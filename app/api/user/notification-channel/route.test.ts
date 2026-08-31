// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/auth', () => ({ requireAuth: (...a: unknown[]) => requireAuth(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
  },
}));

const { PATCH } = await import('@/app/api/user/notification-channel/route');

const request = (body: unknown) =>
  new Request('https://example.com/api/user/notification-channel', {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

const malformedRequest = () =>
  new Request('https://example.com/api/user/notification-channel', {
    method: 'PATCH',
    body: '{not valid json',
  });

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ user: { id: 'user_1' } });
  findUniqueUser.mockResolvedValue({ phoneVerifiedAt: new Date() });
  updateUser.mockResolvedValue({});
});

describe('PATCH /api/user/notification-channel', () => {
  it('refuses an unauthenticated caller', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    expect((await PATCH(request({ channel: 'EMAIL' }))).status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('stores a valid channel', async () => {
    expect((await PATCH(request({ channel: 'BOTH' }))).status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({ data: { notificationChannel: 'BOTH' } })
    );
  });

  it('rejects a channel outside the enum rather than writing it', async () => {
    expect((await PATCH(request({ channel: 'PIGEON' }))).status).toBe(400);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('rejects a malformed request body rather than throwing', async () => {
    expect((await PATCH(malformedRequest())).status).toBe(400);
    expect(findUniqueUser).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses to select SMS before a number is verified, which would silently drop notifications', async () => {
    findUniqueUser.mockResolvedValue({ phoneVerifiedAt: null });

    expect((await PATCH(request({ channel: 'SMS' }))).status).toBe(409);
    expect(updateUser).not.toHaveBeenCalled();
  });
});
