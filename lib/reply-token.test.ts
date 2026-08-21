// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  createReplyToken,
  extractReplyToken,
  formatReplyAddress,
  MAX_EMAIL_LOCAL_PART_LENGTH,
} from '@/lib/reply-token';

const DOMAIN = 'jonaddams.com';

describe('Reply token generation', () => {
  it('produces a token that survives a mail system lowercasing the address', () => {
    const token = createReplyToken();

    expect(token).toBe(token.toLowerCase());
  });

  it('uses only characters that are safe in an email local part', () => {
    const token = createReplyToken();

    expect(token).toMatch(/^[a-z2-7]+$/);
  });

  it('produces a different token every time', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => createReplyToken()));

    expect(tokens.size).toBe(100);
  });

  it('carries enough entropy that guessing a live thread is infeasible', () => {
    // base32 encodes 5 bits per character.
    expect(createReplyToken().length * 5).toBeGreaterThanOrEqual(128);
  });
});

describe('Reply address formatting', () => {
  it('builds a plus-addressed recipient for the configured domain', () => {
    const address = formatReplyAddress({ token: 'abc234', domain: DOMAIN });

    expect(address).toBe('reply+abc234@jonaddams.com');
  });

  it('stays within the 64 character limit for an email local part', () => {
    const address = formatReplyAddress({ token: createReplyToken(), domain: DOMAIN });
    const localPart = address.split('@')[0];

    expect(localPart.length).toBeLessThanOrEqual(MAX_EMAIL_LOCAL_PART_LENGTH);
  });
});

describe('Recovering the token from an inbound message', () => {
  const token = createReplyToken();

  it('finds the token on the recipient that matches our domain', () => {
    const found = extractReplyToken({
      recipients: [`reply+${token}@${DOMAIN}`],
      domain: DOMAIN,
    });

    expect(found).toBe(token);
  });

  it('finds the token even when the sender replied to everyone', () => {
    const found = extractReplyToken({
      recipients: ['alice@example.com', `reply+${token}@${DOMAIN}`, 'bob@example.com'],
      domain: DOMAIN,
    });

    expect(found).toBe(token);
  });

  it('recovers the token from an address a mail system has upper-cased', () => {
    const found = extractReplyToken({
      recipients: [`REPLY+${token.toUpperCase()}@${DOMAIN.toUpperCase()}`],
      domain: DOMAIN,
    });

    expect(found).toBe(token);
  });

  it('tolerates a display name wrapping the address', () => {
    const found = extractReplyToken({
      recipients: [`"Q3 Contract thread" <reply+${token}@${DOMAIN}>`],
      domain: DOMAIN,
    });

    expect(found).toBe(token);
  });

  it('ignores a reply address belonging to somebody else’s domain', () => {
    const found = extractReplyToken({
      recipients: [`reply+${token}@attacker.example`],
      domain: DOMAIN,
    });

    expect(found).toBeNull();
  });

  it('ignores recipients on our domain that are not reply addresses', () => {
    const found = extractReplyToken({
      recipients: [`support@${DOMAIN}`],
      domain: DOMAIN,
    });

    expect(found).toBeNull();
  });

  it('rejects a token that is too short to be one of ours', () => {
    const found = extractReplyToken({
      recipients: [`reply+abc@${DOMAIN}`],
      domain: DOMAIN,
    });

    expect(found).toBeNull();
  });

  it('rejects a token of the right length containing characters outside the alphabet', () => {
    const tampered = `${createReplyToken().slice(0, -1)}!`;

    const found = extractReplyToken({
      recipients: [`reply+${tampered}@${DOMAIN}`],
      domain: DOMAIN,
    });

    expect(found).toBeNull();
  });

  it('returns nothing when there are no recipients at all', () => {
    expect(extractReplyToken({ recipients: [], domain: DOMAIN })).toBeNull();
  });
});
