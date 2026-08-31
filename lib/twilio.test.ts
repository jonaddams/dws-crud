// @vitest-environment node

import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendSms, verifyTwilioSignature } from '@/lib/twilio';

const AUTH_TOKEN = 'test_auth_token';

// Twilio's own documented algorithm, re-implemented in the test so the test
// fails if the implementation drifts rather than agreeing with itself.
const signLikeTwilio = (url: string, params: Record<string, string>): string => {
  const payload = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + params[key], url);

  return createHmac('sha1', AUTH_TOKEN).update(Buffer.from(payload, 'utf-8')).digest('base64');
};

describe('verifyTwilioSignature', () => {
  const url = 'https://example.com/api/webhooks/twilio';
  const params = { From: '+15551234567', Body: 'hello', MessageSid: 'SM123' };

  it('accepts a correctly signed request', () => {
    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: signLikeTwilio(url, params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(true);
  });

  it('rejects a request whose body was altered after signing', () => {
    expect(
      verifyTwilioSignature({
        url,
        params: { ...params, Body: 'tampered' },
        signature: signLikeTwilio(url, params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it('rejects a signature computed for a different URL', () => {
    expect(
      verifyTwilioSignature({
        url,
        params,
        signature: signLikeTwilio('https://evil.example/api/webhooks/twilio', params),
        authToken: AUTH_TOKEN,
      })
    ).toBe(false);
  });

  it('rejects a missing signature rather than treating it as absent-and-fine', () => {
    expect(
      verifyTwilioSignature({ url, params, signature: undefined, authToken: AUTH_TOKEN })
    ).toBe(false);
  });

  it('rejects when no auth token is configured, so a blank env cannot open the endpoint', () => {
    expect(
      verifyTwilioSignature({ url, params, signature: signLikeTwilio(url, params), authToken: '' })
    ).toBe(false);
  });
});

describe('sendSms', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts form-encoded to the account messages endpoint and returns the sid', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+17372583742');

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ sid: 'SM999' }), { status: 201 }));

    const result = await sendSms({ to: '+15551234567', body: 'hello' });

    expect(result).toEqual({ sid: 'SM999' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json');
    expect(String(new URLSearchParams(String(init?.body)).get('To'))).toBe('+15551234567');
    expect(String(new URLSearchParams(String(init?.body)).get('From'))).toBe('+17372583742');
  });

  it('throws with the upstream detail when Twilio rejects the message', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'AC123');
    vi.stubEnv('TWILIO_AUTH_TOKEN', AUTH_TOKEN);
    vi.stubEnv('TWILIO_PHONE_NUMBER', '+17372583742');

    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('{"message":"unverified number"}', { status: 400 })
    );

    await expect(sendSms({ to: '+15559999999', body: 'hi' })).rejects.toThrow('unverified number');
  });

  it('names the missing variable when configuration is incomplete', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', '');

    await expect(sendSms({ to: '+15551234567', body: 'hi' })).rejects.toThrow(
      'Missing TWILIO_ACCOUNT_SID'
    );
  });
});
