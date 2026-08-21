// @vitest-environment node

import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '@/lib/webhook-signature';

const SECRET_BYTES = randomBytes(24);
const SECRET = `whsec_${SECRET_BYTES.toString('base64')}`;
const PAYLOAD = JSON.stringify({ type: 'email.received', data: { subject: 'Re: mention' } });

const signedHeaders = (options: {
  payload?: string;
  id?: string;
  timestamp?: number;
  secret?: Buffer;
}): Record<string, string | undefined> => {
  const payload = options.payload ?? PAYLOAD;
  const id = options.id ?? 'msg_2abc';
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const secret = options.secret ?? SECRET_BYTES;

  const signature = createHmac('sha256', secret)
    .update(`${id}.${timestamp}.${payload}`)
    .digest('base64');

  return {
    'svix-id': id,
    'svix-timestamp': String(timestamp),
    'svix-signature': `v1,${signature}`,
  };
};

const verify = (headers: Record<string, string | undefined>, payload = PAYLOAD) =>
  verifyWebhookSignature({ payload, headers, secret: SECRET });

describe('Accepting a genuine webhook', () => {
  it('accepts a correctly signed payload', () => {
    expect(verify(signedHeaders({}))).toBe(true);
  });

  it('accepts when the header carries several signatures and one matches', () => {
    const headers = signedHeaders({});
    headers['svix-signature'] = `v1,not-the-one ${headers['svix-signature']}`;

    expect(verify(headers)).toBe(true);
  });
});

describe('Rejecting anything else', () => {
  it('rejects a payload altered after signing', () => {
    const headers = signedHeaders({});

    expect(
      verify(headers, JSON.stringify({ type: 'email.received', data: { subject: 'evil' } }))
    ).toBe(false);
  });

  it('rejects a signature made with a different secret', () => {
    expect(verify(signedHeaders({ secret: randomBytes(24) }))).toBe(false);
  });

  it('rejects a signature bound to a different message id', () => {
    const headers = signedHeaders({});
    headers['svix-id'] = 'msg_someone_else';

    expect(verify(headers)).toBe(false);
  });

  it('rejects a replayed webhook from hours ago', () => {
    const twoHoursAgo = Math.floor(Date.now() / 1000) - 2 * 60 * 60;

    expect(verify(signedHeaders({ timestamp: twoHoursAgo }))).toBe(false);
  });

  it('rejects a timestamp implausibly far in the future', () => {
    const inAnHour = Math.floor(Date.now() / 1000) + 60 * 60;

    expect(verify(signedHeaders({ timestamp: inAnHour }))).toBe(false);
  });

  it('rejects a request with no signature header', () => {
    const headers = signedHeaders({});
    delete headers['svix-signature'];

    expect(verify(headers)).toBe(false);
  });

  it('rejects a request with no timestamp', () => {
    const headers = signedHeaders({});
    delete headers['svix-timestamp'];

    expect(verify(headers)).toBe(false);
  });

  it('rejects a malformed signature header', () => {
    const headers = signedHeaders({});
    headers['svix-signature'] = 'garbage';

    expect(verify(headers)).toBe(false);
  });

  it('rejects when no secret is configured, rather than letting everything through', () => {
    expect(
      verifyWebhookSignature({ payload: PAYLOAD, headers: signedHeaders({}), secret: '' })
    ).toBe(false);
  });
});
