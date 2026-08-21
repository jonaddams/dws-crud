import { type NextRequest, NextResponse } from 'next/server';
import { addComment } from '@/lib/dws-comments';
import { extractReplyBody } from '@/lib/email-reply';
import { prisma } from '@/lib/prisma';
import { extractReplyToken } from '@/lib/reply-token';
import { fetchInboundEmail } from '@/lib/resend';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

/**
 * POST /api/webhooks/resend
 *
 * Where an emailed reply re-enters the comment thread.
 *
 * This endpoint is open to the internet and writes into threads on behalf of
 * named users, so the order of checks matters:
 *
 * 1. The Svix signature is verified against the raw body before anything is
 *    parsed. An unsigned or altered request never reaches the logic below.
 * 2. The recipient's reply token — not the `From:` header — decides who the
 *    author is. `From:` is trivially forged; the token is unguessable and was
 *    issued to one person for one thread.
 * 3. The provider's message ID is recorded before the comment is written, so a
 *    retried delivery cannot post the same reply twice.
 *
 * Non-events answer 200. Resend retries anything else, and there is nothing to
 * gain from redelivering a message we have deliberately ignored.
 */

/**
 * What `email.received` actually carries: metadata only. There is no body, and
 * no headers — reading the reply takes a second call keyed by `email_id`.
 */
type InboundEmailPayload = {
  type?: string;
  data?: {
    email_id?: string;
    from?: string;
    to?: string[];
    cc?: string[];
    /** The addresses the message was actually routed to, plus-addressing intact. */
    received_for?: string[];
    subject?: string;
  };
};

const replyDomain = (): string => process.env.EMAIL_REPLY_DOMAIN ?? 'jonaddams.com';

const ignored = (reason: string) => NextResponse.json({ ignored: reason }, { status: 200 });

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureValid = verifyWebhookSignature({
    payload: rawBody,
    headers: {
      'svix-id': request.headers.get('svix-id') ?? undefined,
      'svix-timestamp': request.headers.get('svix-timestamp') ?? undefined,
      'svix-signature': request.headers.get('svix-signature') ?? undefined,
    },
    secret: process.env.RESEND_WEBHOOK_SECRET ?? '',
  });

  if (!signatureValid) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: InboundEmailPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  if (payload.type !== 'email.received') {
    return ignored(`unhandled event ${payload.type ?? 'unknown'}`);
  }

  const providerMessageId = payload.data?.email_id;
  if (!providerMessageId) {
    return ignored('no message id');
  }

  const token = extractReplyToken({
    recipients: [
      ...(payload.data?.received_for ?? []),
      ...(payload.data?.to ?? []),
      ...(payload.data?.cc ?? []),
    ],
    domain: replyDomain(),
  });

  if (!token) {
    return ignored('no reply token in recipients');
  }

  const replyToken = await prisma.threadReplyToken.findUnique({
    where: { token },
    select: {
      userId: true,
      user: { select: { name: true, email: true } },
      thread: {
        select: {
          id: true,
          rootAnnotationId: true,
          document: { select: { documentEngineId: true } },
        },
      },
    },
  });

  // An unrecognised token is indistinguishable from a guess. Say nothing useful.
  if (!replyToken) {
    return ignored('unknown reply token');
  }

  // The event carries no body, so fetch it. Skipping this step is invisible in
  // testing: the handler simply finds nothing to post and answers 200.
  const inbound = await fetchInboundEmail({ emailId: providerMessageId });

  const body = extractReplyBody(inbound.text);
  if (!body) {
    return ignored('reply had no new text');
  }

  // Claiming the message ID before writing is what makes a retry safe: the unique
  // constraint rejects the second attempt rather than duplicating the comment.
  try {
    await prisma.inboundEmail.create({
      data: {
        providerMessageId,
        threadId: replyToken.thread.id,
        userId: replyToken.userId,
      },
    });
  } catch {
    return ignored('already processed');
  }

  const { commentId } = await addComment({
    documentId: replyToken.thread.document.documentEngineId,
    rootAnnotationId: replyToken.thread.rootAnnotationId,
    authorUserId: replyToken.userId,
    creatorName: replyToken.user.name ?? replyToken.user.email,
    text: body,
    customData: { source: 'email', inboundMessageId: providerMessageId },
  });

  await prisma.inboundEmail.update({
    where: { providerMessageId },
    data: { dwsCommentId: commentId },
  });

  return NextResponse.json({ commentId }, { status: 200 });
}
