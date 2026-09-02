// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmailDomain } from '@/lib/auth-config';

describe('Who is allowed to sign in', () => {
  it('admits a Nutrient address', () => {
    expect(isAllowedEmailDomain('jon.addams@nutrient.io')).toBe(true);
  });

  it('admits a legacy PSPDFKit address', () => {
    expect(isAllowedEmailDomain('someone@pspdfkit.com')).toBe(true);
  });

  it('refuses an unrelated domain', () => {
    expect(isAllowedEmailDomain('someone@gmail.com')).toBe(false);
  });

  it('refuses a domain that merely ends with an allowed one', () => {
    // A suffix test rather than an equality test would admit both of these.
    expect(isAllowedEmailDomain('attacker@notnutrient.io')).toBe(false);
    expect(isAllowedEmailDomain('attacker@nutrient.io.example.com')).toBe(false);
  });

  it('refuses a subdomain that was never on the list', () => {
    expect(isAllowedEmailDomain('someone@mail.nutrient.io')).toBe(false);
  });

  it('is case-insensitive about the domain', () => {
    expect(isAllowedEmailDomain('Someone@NUTRIENT.IO')).toBe(true);
  });

  it('refuses a missing, empty or malformed address', () => {
    expect(isAllowedEmailDomain(null)).toBe(false);
    expect(isAllowedEmailDomain(undefined)).toBe(false);
    expect(isAllowedEmailDomain('')).toBe(false);
    expect(isAllowedEmailDomain('no-at-sign')).toBe(false);
    expect(isAllowedEmailDomain('trailing@')).toBe(false);
  });

  it('uses the last @ so a local part cannot smuggle a domain past the check', () => {
    expect(isAllowedEmailDomain('nutrient.io@gmail.com')).toBe(false);
    expect(isAllowedEmailDomain('foo@bar@nutrient.io')).toBe(true);
  });

  it('publishes exactly the two domains the app admits', () => {
    expect(ALLOWED_EMAIL_DOMAINS).toEqual(['nutrient.io', 'pspdfkit.com']);
  });
});
