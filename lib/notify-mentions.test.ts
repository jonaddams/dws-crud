// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingNotification } from '@/lib/comment-sync';

const reconcileDocument = vi.fn();
const sendEmail = vi.fn();
const sendSms = vi.fn();
const findUniqueUser = vi.fn();
const findUniqueReplyToken = vi.fn();
const createReplyTokenRow = vi.fn();
const updateMention = vi.fn();
const upsertShare = vi.fn();

vi.mock('@/lib/comment-sync', () => ({
  reconcileDocument: (...args: unknown[]) => reconcileDocument(...args),
}));
vi.mock('@/lib/resend', () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));
vi.mock('@/lib/twilio', () => ({ sendSms: (...args: unknown[]) => sendSms(...args) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: (...a: unknown[]) => findUniqueUser(...a) },
    threadReplyToken: {
      findUnique: (...a: unknown[]) => findUniqueReplyToken(...a),
      create: (...a: unknown[]) => createReplyTokenRow(...a),
    },
    commentMention: { update: (...a: unknown[]) => updateMention(...a) },
    documentShare: { upsert: (...a: unknown[]) => upsertShare(...a) },
  },
}));

const { notifyPendingMentions } = await import('@/lib/notify-mentions');

const mention = (overrides: Partial<PendingNotification> = {}): PendingNotification => ({
  mentionId: 'mention_1',
  threadId: 'thread_1',
  rootAnnotationId: 'anno_1',
  documentId: 'doc_1',
  documentTitle: 'Quarterly Report',
  mentionedUserId: 'user_bob',
  commentText: 'Can you take a look @Bob?',
  authorName: 'Alice Example',
  ...overrides,
});

beforeEach(() => {
  vi.stubEnv('EMAIL_REPLY_DOMAIN', 'jonaddams.com');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://dws-crud.vercel.app');

  reconcileDocument.mockReset().mockResolvedValue([]);
  sendEmail.mockReset().mockResolvedValue({ id: 'msg_1' });
  sendSms.mockReset().mockResolvedValue({ sid: 'sms_1' });
  findUniqueUser.mockReset().mockResolvedValue({ email: 'bob@nutrient.io', name: 'Bob Example' });
  findUniqueReplyToken.mockReset().mockResolvedValue({ token: 'existingtoken234567' });
  createReplyTokenRow.mockReset().mockResolvedValue({ token: 'freshtoken234567abc' });
  updateMention.mockReset().mockResolvedValue({});
  upsertShare.mockReset().mockResolvedValue({});
});

describe('Notifying people who were mentioned', () => {
  it('emails each newly mentioned person and records that they were told', async () => {
    reconcileDocument.mockResolvedValue([mention()]);

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);

    const [message] = sendEmail.mock.calls[0] as [{ to: string; replyTo: string }];
    expect(message.to).toBe('bob@nutrient.io');
    expect(message.replyTo).toBe('reply+existingtoken234567@jonaddams.com');

    // Marked notified, so a second reconcile does not send the same mention twice.
    expect(updateMention).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'mention_1' } })
    );
  });

  it('reuses the address someone was already given for a thread, so old mail stays repliable', async () => {
    reconcileDocument.mockResolvedValue([mention()]);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(createReplyTokenRow).not.toHaveBeenCalled();
  });

  it('issues a reply address the first time someone is mentioned on a thread', async () => {
    findUniqueReplyToken.mockResolvedValue(null);
    reconcileDocument.mockResolvedValue([mention()]);

    await notifyPendingMentions({ documentId: 'doc_1' });

    const [message] = sendEmail.mock.calls[0] as [{ replyTo: string }];
    expect(message.replyTo).toBe('reply+freshtoken234567abc@jonaddams.com');
  });

  it('leaves a mention unnotified when the send fails, so the next pass retries it', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    sendEmail.mockRejectedValue(
      new Error('Resend rejected the message: 422 - domain not verified')
    );

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(updateMention).not.toHaveBeenCalled();
  });

  it('reports why a notification failed instead of discarding the reason', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    sendEmail.mockRejectedValue(
      new Error('Resend rejected the message: 422 - domain not verified')
    );

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.failures).toEqual([
      expect.objectContaining({
        mentionId: 'mention_1',
        mentionedUserId: 'user_bob',
        code: 'delivery-failed',
        reason: expect.stringContaining('domain not verified'),
      }),
    ]);
  });

  it('keeps upstream detail out of the category, so a caller can be told one without the other', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    sendEmail.mockRejectedValue(new Error('Missing RESEND_KEY: cannot send email'));

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.failures[0].code).toBe('delivery-failed');
    expect(result.failures[0].reason).toContain('RESEND_KEY');
  });

  it('reports a mention aimed at someone who no longer has an account', async () => {
    findUniqueUser.mockResolvedValue(null);
    reconcileDocument.mockResolvedValue([mention()]);

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.failed).toBe(1);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(result.failures[0]).toEqual(
      expect.objectContaining({
        mentionedUserId: 'user_bob',
        code: 'no-account',
        reason: expect.stringMatching(/no account|unknown|not found/i),
      })
    );
  });

  it('still notifies everyone else when one recipient fails', async () => {
    reconcileDocument.mockResolvedValue([
      mention({ mentionId: 'mention_1', mentionedUserId: 'user_bob' }),
      mention({ mentionId: 'mention_2', mentionedUserId: 'user_carol' }),
    ]);
    sendEmail
      .mockRejectedValueOnce(new Error('mailbox full'))
      .mockResolvedValueOnce({ id: 'msg_2' });

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].mentionId).toBe('mention_1');
  });

  it('gives the mentioned person access to the document', async () => {
    reconcileDocument.mockResolvedValue([mention()]);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(upsertShare).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { documentId_userId: { documentId: 'doc_1', userId: 'user_bob' } },
        create: { documentId: 'doc_1', userId: 'user_bob' },
      })
    );
  });

  it('grants access even when the email fails, since the mention still happened', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    sendEmail.mockRejectedValue(new Error('mailbox full'));

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(upsertShare).toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it('does not grant access to someone with no account', async () => {
    findUniqueUser.mockResolvedValue(null);
    reconcileDocument.mockResolvedValue([mention()]);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(upsertShare).not.toHaveBeenCalled();
  });

  it('reports nothing when there is nothing to notify', async () => {
    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(result).toEqual({ sent: 0, failed: 0, failures: [] });
  });
});

describe('channel selection', () => {
  const smsUser = {
    email: 'bob@example.com',
    name: 'Bob',
    phone: '+15551234567',
    phoneVerifiedAt: new Date(),
    smsOptedOutAt: null,
    notificationChannel: 'SMS',
  };

  it('sends only email when the user has made no choice', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'EMAIL' });

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendSms).not.toHaveBeenCalled();
    expect(result.sent).toBe(1);
  });

  it('sends only SMS when the user chose SMS', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue(smsUser);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ to: '+15551234567' }));
  });

  it('never puts the comment text in the SMS', async () => {
    reconcileDocument.mockResolvedValue([
      mention({ commentText: 'the secret merger price is 4.2bn' }),
    ]);
    findUniqueUser.mockResolvedValue(smsUser);

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms.mock.calls[0][0].body).not.toContain('4.2bn');
  });

  it('sends both when the user chose both', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'BOTH' });

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledTimes(1);
  });

  it('falls back to email when SMS is chosen but the number is unverified', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, phoneVerifiedAt: null });

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
  });

  it('falls back to email for someone who has texted STOP', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, smsOptedOutAt: new Date() });

    await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendSms).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('keeps the mention notified when SMS fails but email succeeded', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue({ ...smsUser, notificationChannel: 'BOTH' });
    sendSms.mockRejectedValue(new Error('unverified number'));

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    // Marked notified: retrying would re-send the email that did arrive.
    expect(updateMention).toHaveBeenCalled();
    expect(result.sent).toBe(1);
    // Exactly one failure entry for this mention — not double-recorded by
    // both the inner SMS catch and the outer per-mention catch.
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]).toEqual(expect.objectContaining({ code: 'delivery-failed' }));
  });

  it('records exactly one failure and leaves the mention unnotified when SMS-only delivery fails', async () => {
    reconcileDocument.mockResolvedValue([mention()]);
    findUniqueUser.mockResolvedValue(smsUser);
    sendSms.mockRejectedValue(new Error('unverified number'));

    const result = await notifyPendingMentions({ documentId: 'doc_1' });

    expect(sendEmail).not.toHaveBeenCalled();
    // A single real failure must produce a single failure entry, not one from
    // the inner SMS catch and a second from the outer per-mention catch.
    expect(result.failures).toHaveLength(1);
    expect(result.failed).toBe(1);
    expect(result.sent).toBe(0);
    // Left unmarked so the next reconcile pass retries — nothing was delivered.
    expect(updateMention).not.toHaveBeenCalled();
  });
});
