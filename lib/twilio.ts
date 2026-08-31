import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal Twilio client.
 *
 * Called over REST rather than through the SDK, matching how `lib/resend.ts`
 * talks to Resend and keeping the dependency surface at zero.
 */

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

type TwilioEnvVar = 'TWILIO_ACCOUNT_SID' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_PHONE_NUMBER';

const requireEnv = (name: TwilioEnvVar): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}: cannot send SMS`);
  }

  return value;
};

export const sendSms = async (options: { to: string; body: string }): Promise<{ sid: string }> => {
  const accountSid = requireEnv('TWILIO_ACCOUNT_SID');
  const authToken = requireEnv('TWILIO_AUTH_TOKEN');
  const from = requireEnv('TWILIO_PHONE_NUMBER');

  const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: options.to, From: from, Body: options.body }).toString(),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(`Twilio rejected the message: ${response.status} - ${raw}`);
  }

  const result = JSON.parse(raw) as { sid?: string };

  return { sid: result.sid ?? '' };
};

/**
 * Verifying an inbound webhook from Twilio.
 *
 * Deliberately not a parameter on `lib/webhook-signature.ts`. Resend signs with
 * the Svix scheme — HMAC-SHA256 over `id.timestamp.payload`. Twilio signs
 * HMAC-SHA1 over the full request URL followed by every POST parameter sorted by
 * key and concatenated as `key + value` with no separator. Different hash,
 * different message, different header; one function serving both would obscure
 * both.
 *
 * Note what is missing: Twilio puts no timestamp in the signature, so there is no
 * replay window to check the way the Resend verifier does. A captured request
 * stays valid forever. The unique constraint on `InboundSms.providerMessageId`
 * bounds replay of the **reply path only** — the row is claimed after the
 * keyword (STOP/START/HELP) and registration branches have already returned.
 * A captured, signed HELP (or STOP/START) request can be replayed indefinitely;
 * each one still costs an outbound SMS or a database write. That guard is
 * load-bearing for replies, not a blanket replay defence for the endpoint.
 */
export const verifyTwilioSignature = (options: {
  /** The full public URL Twilio posted to, including any query string. */
  url: string;
  params: Record<string, string>;
  signature: string | undefined;
  authToken: string;
}): boolean => {
  const { url, params, signature, authToken } = options;

  if (!signature || !authToken) return false;

  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  const expected = createHmac('sha1', authToken)
    .update(Buffer.from(payload, 'utf-8'))
    .digest('base64');

  const provided = Buffer.from(signature);
  const computed = Buffer.from(expected);

  // timingSafeEqual throws on a length mismatch, which would itself leak length.
  if (provided.length !== computed.length) return false;

  return timingSafeEqual(provided, computed);
};
