import { randomInt } from 'node:crypto';
import { prisma } from '@/lib/prisma';

/**
 * The registration half of option B: the page shows a code, the reader texts it
 * to our number, and the inbound message is both the proof they hold the phone
 * and the consent record a carrier audit wants to see. We never send SMS to a
 * number nobody has consented to, and we never ask anyone to type their number —
 * it is learned from the message that arrives.
 *
 * The code is short because a human retypes it from a screen, which makes it
 * guessable by construction. Three things bound that: a ten-minute expiry, an
 * attempt cap, and the shape of the win — a correct guess binds *the guesser's
 * own phone* to the matched account. It buys notifications, not access, at the
 * cost of the attacker's own number.
 */

export const VERIFICATION_CODE_LENGTH = 4;
export const VERIFICATION_TTL_MINUTES = 10;
export const MAX_VERIFICATION_ATTEMPTS = 5;

// No O or I: they are misread as 0 and 1 on a screen, and the whole point is
// that somebody retypes this into a phone.
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
  | { status: 'no-match' | 'expired' | 'too-many-attempts' };

export const redeemPhoneVerification = async (options: {
  code: string;
  phone: string;
}): Promise<RedeemResult> => {
  // Phone keyboards capitalise the first letter and readers are inconsistent, so
  // the comparison is case-insensitive. The alphabet is upper-case only, so
  // folding the input is enough.
  const code = options.code.trim().toUpperCase();

  const verification = await prisma.phoneVerification.findFirst({
    where: { code, verifiedAt: null },
  });

  // An unknown code is indistinguishable from a guess. Say nothing more specific.
  if (!verification) return { status: 'no-match' };

  if (verification.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    return { status: 'too-many-attempts' };
  }

  if (verification.expiresAt.getTime() < Date.now()) {
    return { status: 'expired' };
  }

  if (verification.code.toUpperCase() !== code) {
    await prisma.phoneVerification.update({
      where: { id: verification.id },
      data: { attempts: { increment: 1 } },
    });

    return { status: 'no-match' };
  }

  await prisma.phoneVerification.update({
    where: { id: verification.id },
    data: { phone: options.phone, verifiedAt: new Date() },
  });

  // Clearing any prior opt-out is deliberate: texting us a code is a fresh,
  // user-initiated consent, and it should override an old STOP.
  await prisma.user.update({
    where: { id: verification.userId },
    data: { phone: options.phone, phoneVerifiedAt: new Date(), smsOptedOutAt: null },
  });

  return { status: 'verified', userId: verification.userId };
};
