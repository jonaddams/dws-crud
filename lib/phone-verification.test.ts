// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsertVerification = vi.fn();
const findFirstVerification = vi.fn();
const updateVerification = vi.fn();
const updateUser = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    phoneVerification: {
      upsert: (...a: unknown[]) => upsertVerification(...a),
      findFirst: (...a: unknown[]) => findFirstVerification(...a),
      update: (...a: unknown[]) => updateVerification(...a),
    },
    user: { update: (...a: unknown[]) => updateUser(...a) },
  },
}));

const { startPhoneVerification, redeemPhoneVerification, VERIFICATION_CODE_LENGTH } = await import(
  '@/lib/phone-verification'
);

beforeEach(() => {
  vi.clearAllMocks();
  upsertVerification.mockResolvedValue({});
  updateVerification.mockResolvedValue({});
  updateUser.mockResolvedValue({});
});

describe('startPhoneVerification', () => {
  it('returns a code of the documented length', async () => {
    const { code } = await startPhoneVerification({ userId: 'user_1' });

    expect(code).toHaveLength(VERIFICATION_CODE_LENGTH);
  });

  it('avoids characters a reader would misread on a screen', async () => {
    const codes = await Promise.all(
      Array.from({ length: 40 }, () => startPhoneVerification({ userId: 'user_1' }))
    );

    for (const { code } of codes) {
      expect(code).toMatch(/^[0-9A-HJ-NP-Z]+$/);
      expect(code).not.toMatch(/[OI]/);
    }
  });

  it('replaces any previous code for the user rather than leaving two live', async () => {
    await startPhoneVerification({ userId: 'user_1' });

    expect(upsertVerification).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });
});

describe('redeemPhoneVerification', () => {
  const live = (overrides: Record<string, unknown> = {}) => ({
    id: 'pv_1',
    userId: 'user_1',
    code: 'AB12',
    attempts: 0,
    expiresAt: new Date(Date.now() + 60_000),
    verifiedAt: null,
    ...overrides,
  });

  it('binds the sender number to the account when the code matches', async () => {
    findFirstVerification.mockResolvedValue(live());

    const result = await redeemPhoneVerification({ code: 'AB12', phone: '+15551234567' });

    expect(result).toEqual({ status: 'verified', userId: 'user_1' });
    expect(updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'user_1' },
        data: expect.objectContaining({ phone: '+15551234567' }),
      })
    );
  });

  it('matches the code case-insensitively, since phone keyboards capitalise', async () => {
    findFirstVerification.mockResolvedValue(live());

    const result = await redeemPhoneVerification({ code: 'ab12', phone: '+15551234567' });

    expect(result.status).toBe('verified');
  });

  it('reports no match for an unknown code without saying which part was wrong', async () => {
    findFirstVerification.mockResolvedValue(null);

    expect(await redeemPhoneVerification({ code: 'ZZZZ', phone: '+1555' })).toEqual({
      status: 'no-match',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses an expired code', async () => {
    findFirstVerification.mockResolvedValue(live({ expiresAt: new Date(Date.now() - 1) }));

    expect(await redeemPhoneVerification({ code: 'AB12', phone: '+1555' })).toEqual({
      status: 'expired',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('refuses once the attempt cap is reached, so a short code cannot be ground down', async () => {
    findFirstVerification.mockResolvedValue(live({ attempts: 5 }));

    expect(await redeemPhoneVerification({ code: 'AB12', phone: '+1555' })).toEqual({
      status: 'too-many-attempts',
    });
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('counts a failed attempt so repeated guessing runs out', async () => {
    findFirstVerification.mockResolvedValue(live({ code: 'WXYZ' }));

    await redeemPhoneVerification({ code: 'AB12', phone: '+1555' });

    expect(updateVerification).toHaveBeenCalledWith(
      expect.objectContaining({ data: { attempts: { increment: 1 } } })
    );
  });
});
