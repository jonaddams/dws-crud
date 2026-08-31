// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyTwilioSignature = vi.fn();
const redeemPhoneVerification = vi.fn();
const addComment = vi.fn();
const sendSms = vi.fn();
const findFirstUser = vi.fn();
const findFirstMention = vi.fn();
const createInboundSms = vi.fn();
const deleteInboundSms = vi.fn();
const updateInboundSms = vi.fn();

vi.mock('@/lib/twilio', () => ({
  verifyTwilioSignature: (...a: unknown[]) => verifyTwilioSignature(...a),
  sendSms: (...a: unknown[]) => sendSms(...a),
}));
vi.mock('@/lib/phone-verification', () => ({
  redeemPhoneVerification: (...a: unknown[]) => redeemPhoneVerification(...a),
}));
vi.mock('@/lib/dws-comments', () => ({ addComment: (...a: unknown[]) => addComment(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: (...a: unknown[]) => findFirstUser(...a) },
    commentMention: { findFirst: (...a: unknown[]) => findFirstMention(...a) },
    inboundSms: {
      create: (...a: unknown[]) => createInboundSms(...a),
      delete: (...a: unknown[]) => deleteInboundSms(...a),
      update: (...a: unknown[]) => updateInboundSms(...a),
    },
  },
}));

const { POST } = await import('@/app/api/webhooks/twilio/route');

const post = (params: Record<string, string>) =>
  new Request('https://example.com/api/webhooks/twilio', {
    method: 'POST',
    headers: { 'x-twilio-signature': 'sig', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  });

const inboundReply = {
  From: '+15551234567',
  Body: 'Looks good to me',
  MessageSid: 'SM123',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TWILIO_AUTH_TOKEN', 'token');
  verifyTwilioSignature.mockReturnValue(true);
  redeemPhoneVerification.mockResolvedValue({ status: 'no-match' });
  createInboundSms.mockResolvedValue({});
  updateInboundSms.mockResolvedValue({});
  addComment.mockResolvedValue({ commentId: 'comment_1' });
});

describe('signature', () => {
  it('rejects an unsigned request before doing anything else', async () => {
    verifyTwilioSignature.mockReturnValue(false);

    expect((await POST(post(inboundReply))).status).toBe(403);
    expect(redeemPhoneVerification).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
  });
});

describe('registration', () => {
  it('treats a matching code as a registration, not a reply', async () => {
    redeemPhoneVerification.mockResolvedValue({ status: 'verified', userId: 'user_1' });

    const response = await POST(post({ ...inboundReply, Body: 'AB12' }));

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
    expect(redeemPhoneVerification).toHaveBeenCalledWith({
      code: 'AB12',
      phone: '+15551234567',
    });
  });

  it('confirms registration to the sender', async () => {
    redeemPhoneVerification.mockResolvedValue({ status: 'verified', userId: 'user_1' });

    const body = await (await POST(post({ ...inboundReply, Body: 'AB12' }))).text();

    expect(body).toContain('<Response>');
    expect(body.toLowerCase()).toContain('registered');
  });
});

describe('replies', () => {
  const verifiedSender = { id: 'user_1', name: 'Bob', email: 'bob@example.com' };

  const lastThread = {
    comment: {
      thread: {
        id: 'thread_1',
        rootAnnotationId: 'anno_1',
        document: { documentEngineId: 'doc_engine_1' },
      },
    },
  };

  it('posts the reply into the most recent thread the sender was notified about', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc_engine_1',
        rootAnnotationId: 'anno_1',
        authorUserId: 'user_1',
        text: 'Looks good to me',
      })
    );
  });

  it('orders by most recent notification, which is what last-thread-wins means', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);

    await POST(post(inboundReply));

    expect(findFirstMention).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { notifiedAt: 'desc' } })
    );
  });

  it('ignores a message from a number nobody has verified', async () => {
    findFirstUser.mockResolvedValue(null);

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('tells a sender with no thread to reply to, rather than failing silently', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(null);

    const body = await (await POST(post(inboundReply))).text();

    expect(addComment).not.toHaveBeenCalled();
    expect(body.toLowerCase()).toContain('no recent');
  });

  it('claims the message sid before writing, so a retry cannot double-post', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);
    createInboundSms.mockRejectedValue(new Error('unique constraint'));

    expect((await POST(post(inboundReply))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('releases the claim when the write fails, so the retry is not swallowed', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);
    findFirstMention.mockResolvedValue(lastThread);
    addComment.mockRejectedValue(new Error('DWS is down'));
    deleteInboundSms.mockResolvedValue({});

    expect((await POST(post(inboundReply))).status).toBe(500);
    expect(deleteInboundSms).toHaveBeenCalledWith({
      where: { providerMessageId: 'SM123' },
    });
  });

  it('ignores an empty body rather than posting a blank comment', async () => {
    findFirstUser.mockResolvedValue(verifiedSender);

    expect((await POST(post({ ...inboundReply, Body: '   ' }))).status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });
});
