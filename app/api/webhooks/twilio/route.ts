import { NextResponse } from 'next/server';
import { addComment } from '@/lib/dws-comments';
import {
  looksLikeVerificationCode,
  type RedeemResult,
  redeemPhoneVerification,
} from '@/lib/phone-verification';
import { prisma } from '@/lib/prisma';
import { classifyKeyword } from '@/lib/sms-keywords';
import {
  ALREADY_REGISTERED_MESSAGE,
  CODE_EXPIRED_MESSAGE,
  HELP_MESSAGE,
  NO_THREAD_MESSAGE,
  OPTED_BACK_IN_MESSAGE,
  PHONE_IN_USE_MESSAGE,
  REGISTERED_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/lib/sms-program';
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

  // Before anything else. Somebody texting STOP must be honoured even if the body
  // would otherwise parse as a verification code.
  //
  // Twilio's Advanced Opt-Out could answer these without us, but then
  // `smsOptedOutAt` would never be set: we would keep queuing sends that Twilio
  // silently drops, and the preference screen would show a state that is not
  // true. Handling it here keeps our data honest about what the user asked for.
  const keyword = classifyKeyword(body);

  if (keyword === 'stop') {
    await prisma.user.updateMany({ where: { phone: from }, data: { smsOptedOutAt: new Date() } });

    // Deliberately silent. Twilio sends the carrier-mandated confirmation itself,
    // and a message of our own to somebody who just left is exactly what they
    // asked us to stop doing.
    return twiml();
  }

  if (keyword === 'start') {
    await prisma.user.updateMany({ where: { phone: from }, data: { smsOptedOutAt: null } });

    return twiml(OPTED_BACK_IN_MESSAGE);
  }

  if (keyword === 'help') {
    return twiml(HELP_MESSAGE);
  }

  // Registration first — see the ordering note above. This is an exhaustive
  // switch, not a chain of ifs, on purpose: a chain of ifs is exactly how the
  // `expired` variant went unhandled and silently fell through to the reply
  // path, posting the literal verification code as a comment. The `default`
  // branch below only compiles because every named status is handled above
  // it — add a sixth `RedeemResult` variant and this file fails to build
  // until it is given a branch too.
  //
  // `redeemPhoneVerification` is only called when the body has the *shape* of
  // a code (see `looksLikeVerificationCode`). This is not an optimisation: the
  // function writes a `PhoneVerificationAttempt` row for every `no-match`, and
  // the per-sender throttle counts those rows. Calling it for every ordinary
  // reply meant an active conversation — six replies inside ten minutes —
  // tripped the same throttle a guesser would, silently discarding the sixth
  // reply with no comment, no retry, and no record. Gating on shape preserves
  // the brute-force property (a guess must look like a code to be tried, and
  // every guess that looks like one is still throttled) while keeping ordinary
  // replies out of the verification system entirely.
  const redeemed: RedeemResult = looksLikeVerificationCode(body)
    ? await redeemPhoneVerification({ code: body, phone: from })
    : { status: 'no-match' };

  switch (redeemed.status) {
    case 'verified':
      return twiml(REGISTERED_MESSAGE);
    case 'phone-in-use':
      return twiml(PHONE_IN_USE_MESSAGE);
    case 'too-many-attempts':
      return twiml(TOO_MANY_ATTEMPTS_MESSAGE);
    case 'expired':
      return twiml(CODE_EXPIRED_MESSAGE);
    case 'already-registered':
      // A second delivery of a code the sender already redeemed — most likely
      // a resend after a slow first reply. Reassure rather than silently
      // falling through to the reply path, which would otherwise post the
      // verification code itself as a comment on a document thread.
      return twiml(ALREADY_REGISTERED_MESSAGE);
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
    return twiml(NO_THREAD_MESSAGE);
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
