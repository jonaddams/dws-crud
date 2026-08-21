import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verifying an inbound webhook from Resend.
 *
 * The endpoint that receives email replies is open to the internet and writes
 * into comment threads, so the signature is the only thing standing between a
 * stranger and the ability to post as somebody else. It is checked before the
 * body is looked at.
 *
 * Resend signs with the Svix scheme: HMAC-SHA256 over `id.timestamp.payload`,
 * base64, in a `svix-signature` header that may carry several space-separated
 * versioned signatures.
 *
 * The timestamp is checked as well as the signature. A signature stays valid
 * forever otherwise, so a captured request could be replayed indefinitely.
 */

const REPLAY_TOLERANCE_SECONDS = 5 * 60;

export type VerifyWebhookSignatureOptions = {
  /** The raw request body, exactly as received. Re-serialising invalidates the signature. */
  payload: string;
  headers: Record<string, string | undefined>;
  /** The endpoint's signing secret, in `whsec_<base64>` form. */
  secret: string;
};

const constantTimeEquals = (a: string, b: string): boolean => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (left.length !== right.length) return false;

  return timingSafeEqual(left, right);
};

const isWithinTolerance = (timestamp: string): boolean => {
  const sentAt = Number(timestamp);

  if (!Number.isFinite(sentAt)) return false;

  const driftSeconds = Math.abs(Math.floor(Date.now() / 1000) - sentAt);

  return driftSeconds <= REPLAY_TOLERANCE_SECONDS;
};

export const verifyWebhookSignature = (options: VerifyWebhookSignatureOptions): boolean => {
  const { payload, headers, secret } = options;

  if (!secret) return false;

  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signatureHeader = headers['svix-signature'];

  if (!id || !timestamp || !signatureHeader) return false;
  if (!isWithinTolerance(timestamp)) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = createHmac('sha256', secretBytes)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  // `v1,<signature> v1,<signature>` — any one matching is enough, which is how
  // Svix supports rotating a signing secret without dropping deliveries.
  return signatureHeader
    .split(' ')
    .map((entry) => entry.split(','))
    .filter(([version]) => version === 'v1')
    .some(([, signature]) => signature !== undefined && constantTimeEquals(signature, expected));
};
