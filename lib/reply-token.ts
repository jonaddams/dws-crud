import { randomBytes } from 'node:crypto';

/**
 * Reply-address tokens for inbound email.
 *
 * An inbound reply has to be attributed to one person on one comment thread, and
 * the `From:` header cannot do that job — it is trivially forged. The token in the
 * recipient address is the credential instead: it is unguessable, it is minted per
 * (thread, recipient), and it is what the webhook trusts.
 *
 * Two constraints shape the encoding.
 *
 * An email local part is capped at 64 characters (RFC 5321), and a document ID,
 * root annotation ID and user ID together already exceed that, so the identifiers
 * cannot be packed into the address. The token is opaque and the mapping lives in
 * the database.
 *
 * Mail systems along the delivery path may change the case of the local part, so
 * the alphabet has to be case-insensitive. That rules out base64url and points at
 * base32.
 */

export const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
export const REPLY_ADDRESS_PREFIX = 'reply+';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const TOKEN_BYTES = 20;
const BITS_PER_BASE32_CHAR = 5;
const TOKEN_LENGTH = Math.ceil((TOKEN_BYTES * 8) / BITS_PER_BASE32_CHAR);

const encodeBase32 = (bytes: Buffer): string => {
  let bits = 0;
  let value = 0;
  let encoded = '';

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= BITS_PER_BASE32_CHAR) {
      bits -= BITS_PER_BASE32_CHAR;
      encoded += BASE32_ALPHABET[(value >>> bits) & 31];
    }
  }

  if (bits > 0) {
    encoded += BASE32_ALPHABET[(value << (BITS_PER_BASE32_CHAR - bits)) & 31];
  }

  return encoded;
};

export const createReplyToken = (): string => encodeBase32(randomBytes(TOKEN_BYTES));

type FormatReplyAddressOptions = {
  token: string;
  domain: string;
};

export const formatReplyAddress = (options: FormatReplyAddressOptions): string => {
  const { token, domain } = options;

  return `${REPLY_ADDRESS_PREFIX}${token}@${domain}`;
};

type ExtractReplyTokenOptions = {
  recipients: string[];
  domain: string;
};

// Pulls the bare address out of `"Display Name" <someone@example.com>`.
const ANGLE_BRACKET_ADDRESS = /<([^>]+)>/;

const toBareAddress = (recipient: string): string => {
  const bracketed = recipient.match(ANGLE_BRACKET_ADDRESS);

  return (bracketed ? bracketed[1] : recipient).trim().toLowerCase();
};

const isWellFormedToken = (token: string): boolean =>
  token.length === TOKEN_LENGTH && [...token].every((char) => BASE32_ALPHABET.includes(char));

/**
 * Recovers our reply token from an inbound message's recipients, or null if none
 * of them is a reply address we issued. A malformed token is treated as absent —
 * whether the mapping actually exists is a separate lookup.
 */
export const extractReplyToken = (options: ExtractReplyTokenOptions): string | null => {
  const { recipients, domain } = options;
  const suffix = `@${domain.toLowerCase()}`;

  for (const recipient of recipients) {
    const address = toBareAddress(recipient);

    if (!address.endsWith(suffix)) continue;

    const localPart = address.slice(0, -suffix.length);

    if (!localPart.startsWith(REPLY_ADDRESS_PREFIX)) continue;

    const token = localPart.slice(REPLY_ADDRESS_PREFIX.length);

    if (isWellFormedToken(token)) return token;
  }

  return null;
};
