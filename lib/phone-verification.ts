import { randomInt } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * The registration half of option B: the page shows a code, the reader texts it
 * to our number, and the inbound message is both the proof they hold the phone
 * and the consent record a carrier audit wants to see. We never send SMS to a
 * number nobody has consented to, and we never ask anyone to type their number —
 * it is learned from the message that arrives.
 *
 * The code is short because a human retypes it from a screen, which makes it
 * guessable by construction. Three things bound that: a ten-minute expiry, a
 * per-sender attempt throttle, and the shape of the win — a correct guess binds
 * *the guesser's own phone* to the matched account. It buys notifications, not
 * access, at the cost of the attacker's own number.
 *
 * The throttle is keyed by the sender's phone number, not by user or by code.
 * The redemption lookup below filters on `code` in SQL, so a wrong guess
 * simply matches zero rows — there is no row left over to charge an attempt
 * against, and the guesser is anonymous until a code matches. The sender's
 * number is the only signal available to bound guessing, and using it also
 * means one attacker's wrong guesses never cost a different, innocent user
 * mid-registration any of their own attempts.
 */

export const VERIFICATION_CODE_LENGTH = 4;
export const VERIFICATION_TTL_MINUTES = 10;
export const MAX_VERIFICATION_ATTEMPTS = 5;

// No O or I: they are misread as 0 and 1 on a screen, and the whole point is
// that somebody retypes this into a phone. 34 characters (0-9, A-Z minus O
// and I), so a 4-character code has 34^4 = 1,336,336 possibilities.
const CODE_ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

const generateCode = (): string =>
  Array.from(
    { length: VERIFICATION_CODE_LENGTH },
    () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]
  ).join('');

export const startPhoneVerification = async (options: {
  userId: string;
}): Promise<{ code: string; expiresAt: Date }> => {
  const code = generateCode();
  const expiresAt = new Date(Date.now() + VERIFICATION_TTL_MINUTES * 60_000);

  // One live row per user: starting again replaces the previous code and resets
  // the attempt count, so a fresh start is genuinely fresh.
  await prisma.phoneVerification.upsert({
    where: { userId: options.userId },
    create: { userId: options.userId, code, expiresAt, attempts: 0 },
    update: { code, expiresAt, attempts: 0, phone: null, verifiedAt: null },
  });

  return { code, expiresAt };
};

export type RedeemResult =
  | { status: 'verified'; userId: string }
  | { status: 'no-match' | 'expired' | 'too-many-attempts' | 'phone-in-use' };

const isUniqueConstraintViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

export const redeemPhoneVerification = async (options: {
  code: string;
  phone: string;
}): Promise<RedeemResult> => {
  // Phone keyboards capitalise the first letter and readers are inconsistent, so
  // the comparison is case-insensitive. The alphabet is upper-case only, so
  // folding the input is enough.
  const code = options.code.trim().toUpperCase();

  // The per-sender throttle runs before the code is even looked up. Checking
  // it after the lookup would not work: the lookup is filtered by `code` in
  // SQL, so a wrong guess returns no row at all, leaving nothing to charge an
  // attempt against. The sender's number is the only handle an anonymous
  // guess leaves behind.
  const throttleWindowStart = new Date(Date.now() - VERIFICATION_TTL_MINUTES * 60_000);
  const recentFailures = await prisma.phoneVerificationAttempt.count({
    where: { phone: options.phone, createdAt: { gte: throttleWindowStart } },
  });

  if (recentFailures >= MAX_VERIFICATION_ATTEMPTS) {
    return { status: 'too-many-attempts' };
  }

  const verification = await prisma.phoneVerification.findFirst({
    where: { code, verifiedAt: null },
  });

  // An unknown code is indistinguishable from a guess. Say nothing more
  // specific, and record the failure against the sender — not against any
  // verification row, since none was found and no other user's live
  // verification should be touched by somebody else's wrong guess.
  if (!verification) {
    await prisma.phoneVerificationAttempt.create({ data: { phone: options.phone } });
    return { status: 'no-match' };
  }

  if (verification.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' };
  }

  // The row above was found by an exact match on `code`, so the guess was
  // correct by construction — there is no "wrong code, right row" case to
  // handle here. `attempts` still counts this as a retry against this
  // specific verification: a plain usage counter, not the brute-force
  // control (the per-sender throttle above is that).
  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { attempts: { increment: 1 } },
  });

  try {
    // Clearing any prior opt-out is deliberate: texting us a code is a fresh,
    // user-initiated consent, and it should override an old STOP.
    await prisma.user.update({
      where: { id: verification.userId },
      data: { phone: options.phone, phoneVerifiedAt: new Date(), smsOptedOutAt: null },
    });
  } catch (error) {
    // `User.phone` is unique. If this number is already bound to a different
    // account, report that rather than throwing — the caller is an inbound
    // SMS webhook and needs a status to answer the sender with, not a 500.
    // The verification row is left unconsumed so the code stays live.
    if (isUniqueConstraintViolation(error)) {
      return { status: 'phone-in-use' };
    }
    throw error;
  }

  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { phone: options.phone, verifiedAt: new Date() },
  });

  return { status: 'verified', userId: verification.userId };
};
