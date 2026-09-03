// @vitest-environment node

/**
 * What is filed with the A2P 10DLC campaign, pinned as literals.
 *
 * The campaign has been rejected twice for content that disagreed between three
 * places: the filing, the published page at jonaddams.com/sms, and what the
 * application actually sends. Two of those three are code and can be checked by
 * a machine. The filing cannot — it lives in Twilio's console — so it is
 * transcribed here as literal strings and compared against the constants.
 *
 * That makes this an unusual test on purpose: it asserts a constant equals a
 * hardcoded copy of itself. The point is that changing the copy in
 * `lib/sms-program.ts` fails this test, and the failure message is the reminder
 * that **the campaign has to be re-filed and the published page updated** —
 * which is exactly the step that was missed twice. Do not "fix" a failure here
 * by updating the literal alone.
 *
 * Third submission, 2026-09-02. See docs/a2p-campaign-refiling.md.
 */

import { describe, expect, it } from 'vitest';
import { buildMentionSms } from '@/lib/mention-sms';
import { classifyKeyword } from '@/lib/sms-keywords';
import {
  ALREADY_REGISTERED_MESSAGE,
  HELP_MESSAGE,
  OPTED_BACK_IN_MESSAGE,
  REGISTERED_MESSAGE,
} from '@/lib/sms-program';

const FILED_SAMPLES = {
  1: 'Bindery: Alice Example mentioned you on "Q3 Contract". Reply to add a comment. https://bindery.jonaddams.com/documents/abc123 Reply STOP to opt out.',
  2: "Bindery: You're registered. Get a text when someone mentions you. Msg frequency varies. Msg&data rates may apply. Reply HELP for help, STOP to cancel.",
  3: 'Bindery: Mention notifications for your documents. Reply to a notification to comment. Msg & data rates may apply. Reply STOP to opt out.',
  4: 'Bindery: Your number is already registered. Reply HELP for help, STOP to cancel.',
  5: "Bindery: You're opted back in. Reply HELP for help, STOP to cancel.",
} as const;

/** The campaign's "What is the opt-in message?" answer. */
const FILED_OPT_IN_MESSAGE = "Bindery: You're opted back in. Reply HELP for help, STOP to cancel.";

/** The campaign's "What is the help message?" answer. */
const FILED_HELP_MESSAGE =
  'Bindery: Mention notifications for your documents. Reply to a notification to comment. Msg & data rates may apply. Reply STOP to opt out.';

const FILED_OPT_IN_KEYWORDS = ['START', 'YES', 'UNSTOP'] as const;
const FILED_OPT_OUT_KEYWORDS = [
  'OPTOUT',
  'CANCEL',
  'END',
  'QUIT',
  'UNSUBSCRIBE',
  'REVOKE',
  'STOP',
  'STOPALL',
] as const;
const FILED_HELP_KEYWORDS = ['HELP', 'INFO'] as const;

describe('the sample messages filed with the campaign', () => {
  it('sends sample 1 for a mention', () => {
    expect(
      buildMentionSms({
        authorName: 'Alice Example',
        documentTitle: 'Q3 Contract',
        documentUrl: 'https://bindery.jonaddams.com/documents/abc123',
      })
    ).toBe(FILED_SAMPLES[1]);
  });

  it('sends sample 2 to confirm a registration', () => {
    expect(REGISTERED_MESSAGE).toBe(FILED_SAMPLES[2]);
  });

  it('sends sample 3 in answer to HELP', () => {
    expect(HELP_MESSAGE).toBe(FILED_SAMPLES[3]);
  });

  it('sends sample 4 when a code has already been redeemed', () => {
    expect(ALREADY_REGISTERED_MESSAGE).toBe(FILED_SAMPLES[4]);
  });

  it('sends sample 5 when somebody opts back in', () => {
    expect(OPTED_BACK_IN_MESSAGE).toBe(FILED_SAMPLES[5]);
  });
});

describe('the keyword answers filed with the campaign', () => {
  it('honours every filed opt-in keyword', () => {
    // An unrecognised keyword does not fail politely: it falls through to the
    // reply path and is posted into a document as a comment. The third
    // submission was nearly filed claiming VERIFY and VERIFICATION, which
    // nothing here handles.
    for (const keyword of FILED_OPT_IN_KEYWORDS) {
      expect(classifyKeyword(keyword)).toBe('start');
    }
  });

  it('honours every filed opt-out keyword', () => {
    for (const keyword of FILED_OPT_OUT_KEYWORDS) {
      expect(classifyKeyword(keyword)).toBe('stop');
    }
  });

  it('honours every filed help keyword', () => {
    for (const keyword of FILED_HELP_KEYWORDS) {
      expect(classifyKeyword(keyword)).toBe('help');
    }
  });

  it('does not claim a keyword it cannot honour', () => {
    expect(classifyKeyword('VERIFY')).toBeNull();
    expect(classifyKeyword('VERIFICATION')).toBeNull();
  });
});

describe('the message answers filed with the campaign', () => {
  it('answers a filed opt-in keyword with the filed opt-in message', () => {
    expect(OPTED_BACK_IN_MESSAGE).toBe(FILED_OPT_IN_MESSAGE);
  });

  it('answers a filed help keyword with the filed help message', () => {
    // The same string is filed twice, as sample 3 and as the help message. They
    // were briefly different, which gave the form two answers to "what does
    // HELP return?".
    expect(HELP_MESSAGE).toBe(FILED_HELP_MESSAGE);
    expect(FILED_HELP_MESSAGE).toBe(FILED_SAMPLES[3]);
  });
});
