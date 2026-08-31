import { NextResponse } from 'next/server';
import { addComment } from '@/lib/dws-comments';
import { redeemPhoneVerification } from '@/lib/phone-verification';
import { prisma } from '@/lib/prisma';
import { verifyTwilioSignature } from '@/lib/twilio';

/**
 * POST /api/webhooks/twilio
 *
 * Where an inbound text becomes either a phone registration or a comment reply.
 *
 * The order of checks matters, and it is explicit rather than incidental:
 *
 * 1. The Twilio signature is verified over the raw form parameters before
 *    anything is trusted.
 * 2. A body matching a live verification code is a registration. This is checked
 *    first because a sender with no verified number cannot own a thread — the
 *    ordering would fall out anyway, but relying on that would be an accident.
 * 3. Otherwise it is a reply, attributed by sender number and attached by
 *    last-thread-wins.
 *
 * ## The trust model here is weaker than the email path, on purpose
 *
 * An emailed reply carries a per-(thread, user) token in the recipient address:
 * unguessable, issued to one person for one thread, and the reason the email
 * handler never has to trust the `From:` header. An SMS gives you a sender
 * number, our number, and a body. There is nowhere to hide a token, so **the
 * credential is the sender's phone number.**
 *
 * Twilio validates the originating number, so this is not nothing — but it is
 * the opposite of the "never trust the sender" rule the email path documents,
 * and it inherits every weakness of the phone network: SIM swap, number
 * recycling, and spoofing on some routes.
 *
 * This repository is a reference implementation. Somebody will copy whichever
 * pattern they read, so read this one knowing what it gives up.
 *
 * ## Last-thread-wins is ambiguous, and that is the accepted cost
 *
 * A reply attaches to the most recent thread the sender was notified about. If
 * two mentions land close together the reply may attach to the wrong one. The
 * alternatives all cost more than the ambiguity: a number per thread does not
 * scale, and a code in the body breaks the "just reply" promise that makes this
 * feature worth having. The outbound message names the document so the reader has
 * the context to notice.
 *
 * ## Canonicalisation happens here, not later
 *
 * A phone number enters the system at this boundary — both `User.phone` and
 * `PhoneVerificationAttempt.phone` are keyed on whatever string arrives in
 * `From`. Twilio's webhook guarantees `From` is E.164 (`+15551234567`) for
 * numbers it can identify, so no normalisation step runs here: the value is
 * used as-is. If Twilio ever delivers a non-E.164 `From` (short codes and some
 * alphanumeric sender IDs are the known exceptions), it would silently fail to
 * match a previously-registered number rather than erroring, so that
 * assumption is recorded here rather than left implicit.
 */

const twiml = (message?: string): NextResponse =>
  new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${
      message ? `<Message>${message}</Message>` : ''
    }</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } }
  );

/**
 * The URL Twilio signed. It signs the address it was configured with, so behind a
 * proxy the request's own view of the URL can differ; `TWILIO_WEBHOOK_URL` pins
 * it when they disagree.
 */
const signedUrl = (request: Request): string => process.env.TWILIO_WEBHOOK_URL ?? request.url;

export async function POST(request: Request) {
  const form = new URLSearchParams(await request.text());
  const params = Object.fromEntries(form.entries());

  const signatureValid = verifyTwilioSignature({
    url: signedUrl(request),
    params,
    signature: request.headers.get('x-twilio-signature') ?? undefined,
    authToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  });

  if (!signatureValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
  }

  const from = params.From ?? '';
  const body = (params.Body ?? '').trim();
  const providerMessageId = params.MessageSid ?? '';

  if (!from || !body || !providerMessageId) return twiml();

  // Task 8 inserts STOP/HELP/START keyword handling here, before the
  // verification-code check below.

  // Registration first — see the ordering note above. This is an exhaustive
  // switch, not a chain of ifs, on purpose: a chain of ifs is exactly how the
  // `expired` variant went unhandled and silently fell through to the reply
  // path, posting the literal verification code as a comment. The `default`
  // branch below only compiles because every named status is handled above
  // it — add a fifth `RedeemResult` variant and this file fails to build
  // until it is given a branch too.
  const redeemed = await redeemPhoneVerification({ code: body, phone: from });

  switch (redeemed.status) {
    case 'verified':
      return twiml("You're registered. You'll get a text when someone mentions you.");
    case 'phone-in-use':
      return twiml('That number is already registered to a different account.');
    case 'too-many-attempts':
      return twiml('Too many attempts. Please wait and request a new code.');
    case 'expired':
      return twiml('That code has expired. Please request a new one.');
    case 'no-match':
      // This text was never a verification code attempt — fall through and
      // treat it as a reply. This is the only status that means that.
      break;
    default: {
      const unreachable: never = redeemed;
      throw new Error(`Unhandled phone verification status: ${JSON.stringify(unreachable)}`);
    }
  }

  const sender = await prisma.user.findFirst({
    where: { phone: from, phoneVerifiedAt: { not: null }, smsOptedOutAt: null },
    select: { id: true, name: true, email: true },
  });

  // An unrecognised number is indistinguishable from a stranger. Say nothing.
  if (!sender) return twiml();

  // Last-thread-wins: the most recently notified mention for this person. Reusing
  // the row the notifier already writes keeps this from becoming a second source
  // of truth that can drift.
  const latest = await prisma.commentMention.findFirst({
    where: { mentionedUserId: sender.id, notifiedAt: { not: null } },
    orderBy: { notifiedAt: 'desc' },
    select: {
      comment: {
        select: {
          thread: {
            select: {
              id: true,
              rootAnnotationId: true,
              document: { select: { documentEngineId: true } },
            },
          },
        },
      },
    },
  });

  if (!latest) {
    return twiml('No recent comment thread to reply to. Open the document to comment.');
  }

  const thread = latest.comment.thread;

  // Claiming the SID before writing is what makes a Twilio retry safe — and it is
  // also the only thing bounding replay, since a Twilio signature carries no
  // timestamp and stays valid forever.
  try {
    await prisma.inboundSms.create({
      data: { providerMessageId, fromNumber: from, userId: sender.id, threadId: thread.id },
    });
  } catch {
    return twiml();
  }

  let commentId: string;

  try {
    ({ commentId } = await addComment({
      documentId: thread.document.documentEngineId,
      rootAnnotationId: thread.rootAnnotationId,
      authorUserId: sender.id,
      creatorName: sender.name ?? sender.email,
      text: body,
      customData: { source: 'sms', inboundMessageId: providerMessageId },
    }));
  } catch (error) {
    // Release the claim, exactly as the email path does. Holding it after a
    // failed write turns the idempotency guard into a black hole: Twilio retries,
    // the claim is still there, the retry is ignored, and the reply is lost.
    await prisma.inboundSms.delete({ where: { providerMessageId } }).catch(() => {});

    return NextResponse.json(
      { error: 'Could not add the comment', detail: String(error) },
      { status: 500 }
    );
  }

  await prisma.inboundSms.update({
    where: { providerMessageId },
    data: { dwsCommentId: commentId },
  });

  return twiml();
}
