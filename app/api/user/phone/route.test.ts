// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const startPhoneVerification = vi.fn();
const findUniqueUser = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/auth', () => ({ requireAuth: (...a: unknown[]) => requireAuth(...a) }));
vi.mock('@/lib/phone-verification', () => ({
  startPhoneVerification: (...a: unknown[]) => startPhoneVerification(...a),
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: (...a: unknown[]) => findUniqueUser(...a),
      update: (...a: unknown[]) => updateUser(...a),
    },
  },
}));

const { POST, GET, DELETE } = await import('@/app/api/user/phone/route');

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ user: { id: 'user_1' } });
});

describe('POST /api/user/phone', () => {
  it('refuses an unauthenticated caller', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    expect((await POST()).status).toBe(401);
    expect(startPhoneVerification).not.toHaveBeenCalled();
  });

  it('returns a code for the signed-in user to text us', async () => {
    const expiresAt = new Date('2026-09-01T00:00:00Z');
    startPhoneVerification.mockResolvedValue({ code: 'AB12', expiresAt });

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      code: 'AB12',
      expiresAt: expiresAt.toISOString(),
    });
    expect(startPhoneVerification).toHaveBeenCalledWith({ userId: 'user_1' });
  });
});

describe('GET /api/user/phone', () => {
  it('refuses an unauthenticated caller', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    expect((await GET()).status).toBe(401);
    expect(findUniqueUser).not.toHaveBeenCalled();
  });

  it('reports the verified number once the text has arrived', async () => {
    findUniqueUser.mockResolvedValue({ phone: '+15551234567', phoneVerifiedAt: new Date() });

    await expect((await GET()).json()).resolves.toEqual({
      phone: '+15551234567',
      verified: true,
    });
  });

  it('reports unverified while the code is still outstanding', async () => {
    findUniqueUser.mockResolvedValue({ phone: null, phoneVerifiedAt: null });

    await expect((await GET()).json()).resolves.toEqual({ phone: null, verified: false });
  });
});

describe('DELETE /api/user/phone', () => {
  it('refuses an unauthenticated caller', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    expect((await DELETE()).status).toBe(401);
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('forgets the number and stops SMS for that user', async () => {
    updateUser.mockResolvedValue({});

    expect((await DELETE()).status).toBe(200);
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ phone: null, phoneVerifiedAt: null }),
      })
    );
  });
});
