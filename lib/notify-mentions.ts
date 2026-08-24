import { type PendingNotification, reconcileDocument } from '@/lib/comment-sync';
import { buildMentionEmail } from '@/lib/mention-email';
import { prisma } from '@/lib/prisma';
import { createReplyToken, formatReplyAddress } from '@/lib/reply-token';
import { sendEmail } from '@/lib/resend';

/**
 * Reconcile a document, then tell anyone newly mentioned.
 *
 * This is the one place notifications are sent, whatever the comment's origin —
 * typed in the viewer, posted through the API, or arrived as an email reply. They
 * all become DWS comments, and reconcile finds them all the same way.
 */

const replyDomain = (): string => process.env.EMAIL_REPLY_DOMAIN ?? 'jonaddams.com';

const appUrl = (): string => process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

/**
 * The reply address for one person on one thread. Stable: mentioned twice on the
 * same thread, the same address is reused, so an old notification stays repliable.
 */
const replyAddressFor = async (options: { threadId: string; userId: string }): Promise<string> => {
  const { threadId, userId } = options;

  const existing = await prisma.threadReplyToken.findUnique({
    where: { threadId_userId: { threadId, userId } },
    select: { token: true },
  });

  const token =
    existing?.token ??
    (
      await prisma.threadReplyToken.create({
        data: { threadId, userId, token: createReplyToken() },
        select: { token: true },
      })
    ).token;

  return formatReplyAddress({ token, domain: replyDomain() });
};

export type NotifyFailure = {
  mentionId: string;
  mentionedUserId: string;
  /** What went wrong, in enough detail to act on without reproducing it. */
  reason: string;
};

export type NotifyResult = {
  sent: number;
  failed: number;
  /**
   * Why each unsent notification did not go out; empty when everything sent.
   *
   * A count alone cannot be acted on: an unverified sending domain, a missing
   * API key and a deleted recipient all read as `failed: 1`. Since the mention
   * is left for the next pass to retry, a reason that is never recorded is a
   * reason nobody ever sees.
   */
  failures: NotifyFailure[];
};

const reasonFrom = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * One delivery failure does not stop the others: each mention is marked notified
 * only once its own email has been accepted, so a failed one is retried on the
 * next pass rather than silently lost.
 */
export const notifyPendingMentions = async (options: {
  documentId: string;
}): Promise<NotifyResult> => {
  const pending = await reconcileDocument({ documentId: options.documentId });

  let sent = 0;
  const failures: NotifyFailure[] = [];

  const record = (mention: PendingNotification, reason: string): void => {
    failures.push({
      mentionId: mention.mentionId,
      mentionedUserId: mention.mentionedUserId,
      reason,
    });
  };

  for (const mention of pending) {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: mention.mentionedUserId },
        select: { email: true, name: true },
      });

      if (!recipient) {
        record(mention, 'Mentioned user has no account, so there is nowhere to send to');
        continue;
      }

      const replyAddress = await replyAddressFor({
        threadId: mention.threadId,
        userId: mention.mentionedUserId,
      });

      const email = buildMentionEmail({
        recipientName: recipient.name ?? recipient.email,
        authorName: mention.authorName,
        documentTitle: mention.documentTitle,
        documentUrl: `${appUrl()}/documents/${mention.documentId}`,
        commentText: mention.commentText,
        replyAddress,
      });

      await sendEmail({
        to: recipient.email,
        subject: email.subject,
        text: email.text,
        html: email.html,
        replyTo: email.replyTo,
      });

      await prisma.commentMention.update({
        where: { id: mention.mentionId },
        data: { notifiedAt: new Date() },
      });

      sent += 1;
    } catch (error) {
      // Left unmarked on purpose so the next reconcile tries again, and the
      // reason is kept so a failure that keeps recurring can be diagnosed.
      record(mention, reasonFrom(error));
    }
  }

  return { sent, failed: failures.length, failures };
};
