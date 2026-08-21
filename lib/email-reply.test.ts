// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { extractReplyBody } from '@/lib/email-reply';

describe('Reading what someone actually wrote back', () => {
  it('keeps a reply that quotes nothing', () => {
    expect(extractReplyBody('Looks good to me.')).toBe('Looks good to me.');
  });

  it('drops the quoted original beneath an attribution line', () => {
    const raw = [
      'Agreed, softening it now.',
      '',
      'On Thu, 21 Aug 2026 at 17:41, Alice Example <alice@nutrient.io> wrote:',
      '> Can we tighten this clause?',
      '> It reads too strongly.',
    ].join('\n');

    expect(extractReplyBody(raw)).toBe('Agreed, softening it now.');
  });

  it('drops quoted lines even without an attribution line', () => {
    const raw = ['Sounds right.', '', '> Can we tighten this clause?'].join('\n');

    expect(extractReplyBody(raw)).toBe('Sounds right.');
  });

  it('drops an Outlook style original message block', () => {
    const raw = [
      'Will do.',
      '',
      '-----Original Message-----',
      'From: Alice Example',
      'Can we tighten this clause?',
    ].join('\n');

    expect(extractReplyBody(raw)).toBe('Will do.');
  });

  it('drops a signature after the standard delimiter', () => {
    const raw = ['Happy with that.', '', '-- ', 'Bob Example', 'Nutrient'].join('\n');

    expect(extractReplyBody(raw)).toBe('Happy with that.');
  });

  it('keeps a multi-line reply intact', () => {
    const raw = [
      'Two thoughts:',
      '',
      'First, the clause is fine.',
      'Second, the date is wrong.',
      '',
      'On Thu, 21 Aug 2026, Alice wrote:',
      '> Can we tighten this clause?',
    ].join('\n');

    expect(extractReplyBody(raw)).toBe(
      'Two thoughts:\n\nFirst, the clause is fine.\nSecond, the date is wrong.'
    );
  });

  it('trims the blank lines a mail client leaves behind', () => {
    expect(extractReplyBody('\n\n  Fine by me.  \n\n\n')).toBe('Fine by me.');
  });

  it('does not mistake a hyphen for a signature delimiter', () => {
    // A signature delimiter is exactly "-- ", not any dashed line.
    expect(extractReplyBody('Use the en-dash --- it reads better.')).toBe(
      'Use the en-dash --- it reads better.'
    );
  });

  it('returns an empty string when the reply is nothing but a quote', () => {
    const raw = ['On Thu, Alice wrote:', '> Can we tighten this clause?'].join('\n');

    expect(extractReplyBody(raw)).toBe('');
  });

  it('handles an empty message', () => {
    expect(extractReplyBody('')).toBe('');
  });
});
