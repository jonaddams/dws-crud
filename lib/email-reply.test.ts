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

  it('drops a signature when the delimiter lost its trailing space in transit', () => {
    // RFC 3676 writes the delimiter as "-- ", but plenty of mail servers and
    // clients strip trailing whitespace, so it arrives as a bare "--". Observed
    // against the live round trip, where the signature survived into the comment.
    const raw = ['Happy with that.', '', '--', 'Bob Example', 'Nutrient'].join('\n');

    expect(extractReplyBody(raw)).toBe('Happy with that.');
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

describe('Signatures that do not use the conventional delimiter', () => {
  it('cuts at a decorative separator line', () => {
    // Captured from a real Gmail reply: the separator is Morse code, and there
    // is no "-- " anywhere in the message.
    const raw = [
      'No, do not use expensive extra virgin olive oil, save it for a nice salad.',
      '',
      '− •   • • −    −    • − •    • •    •    − •    −',
      'Jon Addams',
      'Solutions Engineer',
      '',
      'jon.addams@nutrient.io',
      '',
      'Click here to set up a call <https://scheduler.zoom.us/nutrient-jon-addams>',
      '',
      '[image: Nutrient]',
      '',
      'The deterministic document platform. nutrient.io',
      '',
      '',
      'On Fri, Aug 21, 2026 at 4:27 PM <jon@jonaddams.com> wrote:',
      '> Hi Jon Addams,',
    ].join('\n');

    expect(extractReplyBody(raw)).toBe(
      'No, do not use expensive extra virgin olive oil, save it for a nice salad.'
    );
  });

  it('cuts at a rule of underscores', () => {
    const raw = ['Approved.', '', '________________________________', 'Jane Doe', 'Legal'].join(
      '\n'
    );

    expect(extractReplyBody(raw)).toBe('Approved.');
  });

  it('cuts at a rule of equals signs', () => {
    const raw = ['Looks fine.', '====================', 'Sent from somewhere'].join('\n');

    expect(extractReplyBody(raw)).toBe('Looks fine.');
  });

  it('drops the placeholder a mail client leaves where an image was', () => {
    expect(extractReplyBody('Yes please.\n[image: Nutrient]')).toBe('Yes please.');
  });

  it('cuts a mobile sign-off', () => {
    expect(extractReplyBody('On my way.\n\nSent from my iPhone')).toBe('On my way.');
  });

  it('keeps punctuation that is part of a sentence', () => {
    // A short run of symbols inside prose is not a separator.
    expect(extractReplyBody('Use 2 -- maybe 3 -- tablespoons.')).toBe(
      'Use 2 -- maybe 3 -- tablespoons.'
    );
  });

  it('keeps an ellipsis on its own line', () => {
    expect(extractReplyBody('Thinking about it\n...\nstill thinking')).toBe(
      'Thinking about it\n...\nstill thinking'
    );
  });

  it('keeps a reply that is only an emoji', () => {
    expect(extractReplyBody('👍')).toBe('👍');
  });
});
