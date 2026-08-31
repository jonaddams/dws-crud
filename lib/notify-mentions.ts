import type { NotificationChannel } from '@prisma/client';
import { type PendingNotification, reconcileDocument } from '@/lib/comment-sync';
import { buildMentionEmail } from '@/lib/mention-email';
import { buildMentionSms } from '@/lib/mention-sms';
import { prisma } from '@/lib/prisma';
import { createReplyToken, formatReplyAddress } from '@/lib/reply-token';
import { sendEmail } from '@/lib/resend';
import { sendSms } from '@/lib/twilio';

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

/**
 * Why a notification did not go out, in a form that is safe to hand to a caller.
 *
 * `no-account` is a data problem and will not fix itself on a retry;
 * `delivery-failed` is anything that went wrong on the way out and is retried on
 * the next pass.
 */
export type NotifyFailureCode = 'no-account' | 'delivery-failed' | 'no-sms-destination';

export type NotifyFailure = {
  mentionId: string;
  mentionedUserId: string;
  code: NotifyFailureCode;
  /**
   * Upstream detail — a Resend rejection body, a Prisma error, a DWS response.
   *
   * Server-side only. It is written by systems that know nothing about who is
   * asking, so it can name environment variables, hosts and internal
   * identifiers. Callers get `code`; this stays here.
   */
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
 * Which channels a notification should actually go out on.
 *
 * A preference is a request, not a guarantee. SMS needs a verified number and no
 * standing opt-out, and when it is unavailable the notification falls back to
 * email rather than vanishing — a preference should never be the reason somebody
 * hears nothing at all.
 */
type Deliverable = { email: boolean; sms: boolean };

const channelsFor = (recipient: {
  phone: string | null;
  phoneVerifiedAt: Date | null;
  smsOptedOutAt: Date | null;
  notificationChannel: NotificationChannel;
}): Deliverable => {
  const smsAvailable = Boolean(
    recipient.phone && recipient.phoneVerifiedAt && !recipient.smsOptedOutAt
  );

  if (recipient.notificationChannel === 'EMAIL') return { email: true, sms: false };

  if (!smsAvailable) return { email: true, sms: false };

  return { email: recipient.notificationChannel === 'BOTH', sms: true };
};

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

  const record = (mention: PendingNotification, code: NotifyFailureCode, reason: string): void => {
    failures.push({
      mentionId: mention.mentionId,
      mentionedUserId: mention.mentionedUserId,
      code,
      reason,
    });
  };

  for (const mention of pending) {
    try {
      const recipient = await prisma.user.findUnique({
        where: { id: mention.mentionedUserId },
        select: {
          email: true,
          name: true,
          phone: true,
          phoneVerifiedAt: true,
          smsOptedOutAt: true,
          notificationChannel: true,
        },
      });

      if (!recipient) {
        record(
          mention,
          'no-account',
          'Mentioned user has no account, so there is nowhere to send to'
        );
        continue;
      }

      // Being mentioned grants read access, before the email rather than after.
      // A notification that leads to a document the reader is refused is worse
      // than no notification, and that refusal would outlive a failed send.
      await prisma.documentShare.upsert({
        where: {
          documentId_userId: {
            documentId: mention.documentId,
            userId: mention.mentionedUserId,
          },
        },
        create: { documentId: mention.documentId, userId: mention.mentionedUserId },
        update: {},
      });

      const replyAddress = await replyAddressFor({
        threadId: mention.threadId,
        userId: mention.mentionedUserId,
      });

      const channels = channelsFor(recipient);

      let delivered = false;

      if (channels.email) {
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

        delivered = true;
      }

      if (channels.sms && recipient.phone) {
        try {
          await sendSms({
            to: recipient.phone,
            body: buildMentionSms({
              authorName: mention.authorName,
              documentTitle: mention.documentTitle,
              documentUrl: `${appUrl()}/documents/${mention.documentId}`,
            }),
          });

          delivered = true;
        } catch (error) {
          // Recorded, but not rethrown when the email already went out. Retrying
          // the mention would re-send an email that did arrive, so a failed
          // second channel must not undo a delivered first one.
          record(mention, 'delivery-failed', reasonFrom(error));

          if (!delivered) throw error;
        }
      }

      await prisma.commentMention.update({
        where: { id: mention.mentionId },
        data: { notifiedAt: new Date() },
      });

      sent += 1;
    } catch (error) {
      // Left unmarked on purpose so the next reconcile tries again, and the
      // reason is kept so a failure that keeps recurring can be diagnosed.
      record(mention, 'delivery-failed', reasonFrom(error));
    }
  }

  return { sent, failed: failures.length, failures };
};
