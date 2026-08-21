// @vitest-environment node

import { createHmac, randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReplyToken } from '@/lib/reply-token';

const addComment = vi.fn();
const findUniqueToken = vi.fn();
const createInbound = vi.fn();
const updateInbound = vi.fn();

vi.mock('@/lib/dws-comments', () => ({ addComment: (...args: unknown[]) => addComment(...args) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    threadReplyToken: { findUnique: (...a: unknown[]) => findUniqueToken(...a) },
    inboundEmail: {
      create: (...a: unknown[]) => createInbound(...a),
      update: (...a: unknown[]) => updateInbound(...a),
    },
  },
}));

const { POST } = await import('@/app/api/webhooks/resend/route');

const SECRET_BYTES = randomBytes(24);
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
// Generated rather than written out: a literal here is indistinguishable from a
// real reply token, both to a reader and to a secret scanner.
const TOKEN = createReplyToken();

const KNOWN_TOKEN = {
  userId: 'user_bob',
  user: { name: 'Bob Example', email: 'bob@nutrient.io' },
  thread: {
    id: 'thread_1',
    rootAnnotationId: 'anno_1',
    document: { documentEngineId: 'dws_doc_1' },
  },
};

const inboundPayload = (overrides: Record<string, unknown> = {}) =>
  JSON.stringify({
    type: 'email.received',
    data: {
      email_id: 'inbound_1',
      from: 'bob@nutrient.io',
      to: [`reply+${TOKEN}@jonaddams.com`],
      subject: 'Re: Alice mentioned you',
      text: 'Agreed, softening it now.',
      ...overrides,
    },
  });

const postWebhook = (body: string, options: { sign?: boolean } = {}) => {
  const id = 'msg_1';
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', SECRET_BYTES)
    .update(`${id}.${timestamp}.${body}`)
    .digest('base64');

  const headers = new Headers({ 'content-type': 'application/json' });
  if (options.sign !== false) {
    headers.set('svix-id', id);
    headers.set('svix-timestamp', String(timestamp));
    headers.set('svix-signature', `v1,${signature}`);
  }

  return POST(
    new Request('https://app.example.com/api/webhooks/resend', {
      method: 'POST',
      headers,
      body,
      // biome-ignore lint/suspicious/noExplicitAny: NextRequest is structurally a Request here
    }) as any
  );
};

beforeEach(() => {
  vi.stubEnv('RESEND_WEBHOOK_SECRET', SECRET);
  vi.stubEnv('EMAIL_REPLY_DOMAIN', 'jonaddams.com');
  addComment.mockReset().mockResolvedValue({ commentId: 'cmt_new' });
  findUniqueToken.mockReset().mockResolvedValue(KNOWN_TOKEN);
  createInbound.mockReset().mockResolvedValue({});
  updateInbound.mockReset().mockResolvedValue({});
});

describe('Refusing untrusted requests', () => {
  it('rejects a request with no signature', async () => {
    const response = await postWebhook(inboundPayload(), { sign: false });

    expect(response.status).toBe(401);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('rejects a body altered after signing', async () => {
    const id = 'msg_1';
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = createHmac('sha256', SECRET_BYTES)
      .update(`${id}.${timestamp}.${inboundPayload()}`)
      .digest('base64');

    const response = await POST(
      new Request('https://app.example.com/api/webhooks/resend', {
        method: 'POST',
        headers: {
          'svix-id': id,
          'svix-timestamp': String(timestamp),
          'svix-signature': `v1,${signature}`,
        },
        body: inboundPayload({ text: 'Something else entirely.' }),
        // biome-ignore lint/suspicious/noExplicitAny: NextRequest is structurally a Request here
      }) as any
    );

    expect(response.status).toBe(401);
    expect(addComment).not.toHaveBeenCalled();
  });
});

describe('Attributing the reply', () => {
  it('credits the person the token was issued to, not the From header', async () => {
    // The whole point: From is forgeable, the token is not.
    await postWebhook(inboundPayload({ from: 'attacker@evil.example' }));

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({ authorUserId: 'user_bob', creatorName: 'Bob Example' })
    );
  });

  it('posts into the thread the token belongs to', async () => {
    await postWebhook(inboundPayload());

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({ documentId: 'dws_doc_1', rootAnnotationId: 'anno_1' })
    );
  });

  it('marks the comment as having arrived by email', async () => {
    await postWebhook(inboundPayload());

    expect(addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        customData: { source: 'email', inboundMessageId: 'inbound_1' },
      })
    );
  });

  it('posts only what the sender wrote, not the quoted thread', async () => {
    await postWebhook(
      inboundPayload({
        text: 'Agreed.\n\nOn Thu, Alice wrote:\n> Can we tighten this clause?',
      })
    );

    expect(addComment).toHaveBeenCalledWith(expect.objectContaining({ text: 'Agreed.' }));
  });
});

describe('Turning away what it cannot use', () => {
  it('ignores an event type it does not handle', async () => {
    const response = await postWebhook(JSON.stringify({ type: 'email.delivered', data: {} }));

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('ignores a message addressed to nothing resembling a reply token', async () => {
    const response = await postWebhook(inboundPayload({ to: ['support@jonaddams.com'] }));

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('ignores a token that matches no thread, without saying so', async () => {
    findUniqueToken.mockResolvedValue(null);

    const response = await postWebhook(inboundPayload());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('ignores a reply whose only content was the quoted original', async () => {
    const response = await postWebhook(
      inboundPayload({ text: 'On Thu, Alice wrote:\n> Can we tighten this?' })
    );

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });
});

describe('Surviving a redelivery', () => {
  it('does not post the reply twice when Resend retries', async () => {
    createInbound.mockRejectedValue(new Error('unique constraint violated'));

    const response = await postWebhook(inboundPayload());

    expect(response.status).toBe(200);
    expect(addComment).not.toHaveBeenCalled();
  });

  it('claims the message id before writing the comment', async () => {
    const order: string[] = [];
    createInbound.mockImplementation(async () => {
      order.push('claim');
      return {};
    });
    addComment.mockImplementation(async () => {
      order.push('write');
      return { commentId: 'cmt_new' };
    });

    await postWebhook(inboundPayload());

    expect(order).toEqual(['claim', 'write']);
  });
});
