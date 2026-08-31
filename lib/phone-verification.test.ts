// @vitest-environment node

import { Prisma } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const upsertVerification = vi.fn();
const findFirstVerification = vi.fn();
const updateVerification = vi.fn();
const updateUser = vi.fn();
const countAttempts = vi.fn();
const createAttempt = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    phoneVerification: {
      upsert: (...a: unknown[]) => upsertVerification(...a),
      findFirst: (...a: unknown[]) => findFirstVerification(...a),
      update: (...a: unknown[]) => updateVerification(...a),
    },
    phoneVerificationAttempt: {
      count: (...a: unknown[]) => countAttempts(...a),
      create: (...a: unknown[]) => createAttempt(...a),
    },
    user: { update: (...a: unknown[]) => updateUser(...a) },
  },
}));

const {
  startPhoneVerification,
  redeemPhoneVerification,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_TTL_MINUTES,
} = await import('@/lib/phone-verification');

beforeEach(() => {
  vi.clearAllMocks();
  upsertVerification.mockResolvedValue({});
  updateVerification.mockResolvedValue({});
  updateUser.mockResolvedValue({});
  countAttempts.mockResolvedValue(0);
  createAttempt.mockResolvedValue({});
});

afterEach(() => {
  vi.useRealTimers();
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

  it('looks the code up with an exact match in SQL rather than comparing app-side', async () => {
    findFirstVerification.mockResolvedValue(live());

    await redeemPhoneVerification({ code: 'ab12', phone: '+15551234567' });

    // This is the assertion that would have caught the brute-force bug: the
    // guessed code is what the database is asked to match, so a wrong guess
    // can never come back as a row whose `code` differs from what was typed.
    expect(findFirstVerification).toHaveBeenCalledWith({
      where: { code: 'AB12', verifiedAt: null },
    });
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

  it('refuses a sender who has hit the attempt cap before ever looking up the code', async () => {
    countAttempts.mockResolvedValue(5);

    const result = await redeemPhoneVerification({ code: 'AB12', phone: '+1555' });

    expect(result).toEqual({ status: 'too-many-attempts' });
    expect(findFirstVerification).not.toHaveBeenCalled();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("only counts a sender's failures inside the verification TTL window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-31T12:00:00.000Z'));
    findFirstVerification.mockResolvedValue(null);

    await redeemPhoneVerification({ code: 'ZZZZ', phone: '+15559998888' });

    expect(countAttempts).toHaveBeenCalledWith({
      where: {
        phone: '+15559998888',
        createdAt: { gte: new Date(Date.now() - VERIFICATION_TTL_MINUTES * 60_000) },
      },
    });
  });

  it('records a failed attempt against the sender when the code matches no live row', async () => {
    findFirstVerification.mockResolvedValue(null);

    await redeemPhoneVerification({ code: 'ZZZZ', phone: '+15559876543' });

    expect(createAttempt).toHaveBeenCalledWith({ data: { phone: '+15559876543' } });
  });

  it("does not decrement or consume another user's live verification on a wrong guess", async () => {
    findFirstVerification.mockResolvedValue(null);

    await redeemPhoneVerification({ code: 'ZZZZ', phone: '+1555' });

    // Nothing was found for this code, so no PhoneVerification row — belonging
    // to this sender or anyone else — is touched.
    expect(updateVerification).not.toHaveBeenCalled();
  });

  it('reports phone-in-use rather than throwing when the number already belongs to someone else', async () => {
    findFirstVerification.mockResolvedValue(live());
    updateUser.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`phone`)',
        { code: 'P2002', clientVersion: '7.9.1' }
      )
    );

    const result = await redeemPhoneVerification({ code: 'AB12', phone: '+15551234567' });

    expect(result).toEqual({ status: 'phone-in-use' });
  });
});
