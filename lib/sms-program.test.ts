// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  ALREADY_REGISTERED_MESSAGE,
  CODE_EXPIRED_MESSAGE,
  formatProgramNumber,
  HELP_MESSAGE,
  NO_THREAD_MESSAGE,
  OPTED_BACK_IN_MESSAGE,
  PHONE_IN_USE_MESSAGE,
  PROGRAM_NAME,
  REGISTERED_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
} from '@/lib/sms-program';

const ALL_MESSAGES = [
  REGISTERED_MESSAGE,
  ALREADY_REGISTERED_MESSAGE,
  OPTED_BACK_IN_MESSAGE,
  HELP_MESSAGE,
  CODE_EXPIRED_MESSAGE,
  TOO_MANY_ATTEMPTS_MESSAGE,
  PHONE_IN_USE_MESSAGE,
  NO_THREAD_MESSAGE,
];

describe('program messages', () => {
  it.each(ALL_MESSAGES)('identifies the program: %s', (message) => {
    // A recipient reading a lock screen must be able to tell who is texting
    // them, and carriers expect an A2P message to name its program.
    expect(message.startsWith(`${PROGRAM_NAME}: `)).toBe(true);
  });

  it('tells a newly registered user how to get help and how to stop', () => {
    // Carrier guidance for an opt-in confirmation, and it is what the published
    // page at jonaddams.com/sms already shows.
    expect(REGISTERED_MESSAGE).toContain('HELP');
    expect(REGISTERED_MESSAGE).toContain('STOP');
  });

  it('carries the rates and frequency disclosures in the opt-in confirmation', () => {
    // This is the one message a carrier reviewer treats as the consent receipt,
    // so it has to carry the full disclosure set on its own rather than relying
    // on the published page to say it: program name, what the messages are,
    // frequency, rates, HELP and STOP.
    //
    // The A2P campaign's second submission was rejected for "invalid sample
    // message content" with this message filed as sample #2 carrying neither
    // disclosure. Removing either one re-opens that rejection.
    expect(REGISTERED_MESSAGE).toContain('frequency varies');
    expect(REGISTERED_MESSAGE).toContain('rates may apply');
  });

  it('answers HELP with what the program is, the rates notice, and how to stop', () => {
    expect(HELP_MESSAGE).toContain('rates may apply');
    expect(HELP_MESSAGE).toContain('STOP');
  });

  it('keeps every message inside a single GSM-7 segment', () => {
    // These are fixed strings with no interpolation, so unlike the mention
    // notification they can and should fit one segment.
    for (const message of ALL_MESSAGES) {
      expect(message.length).toBeLessThanOrEqual(160);
    }
  });

  it('uses no character outside GSM 03.38, which would force UCS-2 and halve the segment', () => {
    // The mention builder lost its truncation to exactly this trap: one `…` or a
    // curly quote drops the segment size from 160 to 70.
    for (const message of ALL_MESSAGES) {
      expect(message).not.toMatch(/[^\x20-\x7E\n\r]/);
    }
  });
});

describe('the number a reader texts their code to', () => {
  it('renders the registered number exactly as the published page shows it', () => {
    // https://jonaddams.com/sms publishes "+1 269 292-5337". A reviewer compares
    // the number on the opt-in screen against the published page against the
    // number filed with the campaign, so the formatting has to agree too, not
    // just the digits.
    expect(formatProgramNumber('+12692925337')).toBe('+1 269 292-5337');
  });

  it('normalises a number that already carries separators', () => {
    expect(formatProgramNumber('+1 (269) 292-5337')).toBe('+1 269 292-5337');
    expect(formatProgramNumber('12692925337')).toBe('+1 269 292-5337');
  });

  it('returns anything it does not recognise untouched rather than mangling it', () => {
    // A non-US number or a misconfigured value should show as-is; inventing a
    // shape for it would display a number nobody can text.
    expect(formatProgramNumber('+442079460958')).toBe('+442079460958');
    expect(formatProgramNumber('')).toBe('');
  });
});
