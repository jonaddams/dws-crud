// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const getEffectiveDocumentFilter = vi.fn();
const notifyPendingMentions = vi.fn();
const findFirstDocument = vi.fn();

vi.mock('@/lib/auth', () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
  getEffectiveDocumentFilter: (...a: unknown[]) => getEffectiveDocumentFilter(...a),
}));
vi.mock('@/lib/notify-mentions', () => ({
  notifyPendingMentions: (...a: unknown[]) => notifyPendingMentions(...a),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: { document: { findFirst: (...a: unknown[]) => findFirstDocument(...a) } },
}));

const { POST } = await import('@/app/api/documents/[id]/sync-comments/route');

const post = () =>
  POST(new Request('https://example.test/sync', { method: 'POST' }) as never, {
    params: Promise.resolve({ id: 'doc_1' }),
  });

beforeEach(() => {
  requireAuth.mockReset().mockResolvedValue({ user: { id: 'user_alice', role: 'USER' } });
  getEffectiveDocumentFilter.mockReset().mockReturnValue({});
  findFirstDocument.mockReset().mockResolvedValue({ id: 'doc_1' });
  notifyPendingMentions.mockReset().mockResolvedValue({ sent: 1, failed: 0, failures: [] });
});

describe('Syncing a document’s comments', () => {
  it('reports how many notifications went out', async () => {
    const body = await (await post()).json();

    expect(body).toEqual({ sent: 1, failed: 0, failures: [] });
  });

  it('never returns upstream error text to the caller', async () => {
    notifyPendingMentions.mockResolvedValue({
      sent: 0,
      failed: 1,
      failures: [
        {
          mentionId: 'mention_1',
          mentionedUserId: 'user_bob',
          code: 'delivery-failed',
          // What Resend, Prisma or DWS actually said. This is for the server.
          reason: 'Missing RESEND_KEY: cannot send email',
        },
      ],
    });

    const response = await post();
    const body = await response.json();

    expect(JSON.stringify(body)).not.toContain('RESEND_KEY');
    expect(body.failures).toEqual([{ mentionId: 'mention_1', code: 'delivery-failed' }]);
  });

  it('still says enough for a caller to tell the failures apart', async () => {
    notifyPendingMentions.mockResolvedValue({
      sent: 0,
      failed: 2,
      failures: [
        { mentionId: 'm1', mentionedUserId: 'u1', code: 'no-account', reason: 'gone' },
        { mentionId: 'm2', mentionedUserId: 'u2', code: 'delivery-failed', reason: 'boom' },
      ],
    });

    const body = await (await post()).json();

    expect(body.failures.map((f: { code: string }) => f.code)).toEqual([
      'no-account',
      'delivery-failed',
    ]);
    expect(JSON.stringify(body)).not.toContain('boom');
  });

  it('refuses a document the caller cannot see', async () => {
    findFirstDocument.mockResolvedValue(null);

    const response = await post();

    expect(response.status).toBe(404);
    expect(notifyPendingMentions).not.toHaveBeenCalled();
  });

  it('refuses an unauthenticated caller', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    const response = await post();

    expect(response.status).toBe(401);
  });
});
