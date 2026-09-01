/**
 * Every message this program sends, in one place.
 *
 * These strings are not ordinary copy. Three things have to state them
 * identically, and a carrier reviewer compares all three against each other:
 *
 * 1. the sample messages filed with the A2P 10DLC campaign,
 * 2. the examples published at https://jonaddams.com/sms (rendered from
 *    `LEGAL` in the `nutrient-sdk-samples` repo), and
 * 3. what this application actually sends.
 *
 * The campaign's first submission was rejected on its Call-to-Action check with
 * several of these disagreeing at once — the published page named a host that
 * did not resolve, published a number the account no longer sent from, and
 * showed a `Bindery:` prefix the code never produced. Scattering the strings
 * across call sites is what let them drift, so they live here instead: changing
 * one is now a visible edit to a file whose whole purpose is to say they must
 * match the filing.
 *
 * If you change any string here, update the published page and re-file the
 * campaign's sample messages in the same change.
 */

/**
 * The program name every outbound message leads with.
 *
 * Carriers expect an A2P message to identify its program, and a recipient
 * reading a lock screen sees this before anything else. Note it is the
 * *program* name — not the repository, not the deployment host. Renaming either
 * of those does not license changing this.
 */
export const PROGRAM_NAME = 'Bindery';

const prefixed = (message: string): string => `${PROGRAM_NAME}: ${message}`;

/** Sent when someone texts a valid, live verification code. */
export const REGISTERED_MESSAGE = prefixed(
  "Your number is registered. You'll get a text when someone mentions you in a document comment. Reply HELP for help, STOP to cancel."
);

/** Sent when someone re-texts a code they have already redeemed themselves. */
export const ALREADY_REGISTERED_MESSAGE = prefixed(
  'Your number is already registered. Reply HELP for help, STOP to cancel.'
);

/** Sent when someone who previously opted out texts START. */
export const OPTED_BACK_IN_MESSAGE = prefixed(
  "You're opted back in. Reply HELP for help, STOP to cancel."
);

/**
 * Sent in answer to HELP.
 *
 * Carriers expect a HELP reply to name the program, say what it does, and carry
 * both the rates disclosure and the opt-out instruction.
 */
export const HELP_MESSAGE = prefixed(
  'Mention notifications for your documents. Reply to a notification to comment. Msg & data rates may apply. Reply STOP to opt out.'
);

export const CODE_EXPIRED_MESSAGE = prefixed('That code has expired. Please request a new one.');

export const TOO_MANY_ATTEMPTS_MESSAGE = prefixed(
  'Too many attempts. Please wait and request a new code.'
);

export const PHONE_IN_USE_MESSAGE = prefixed(
  'That number is already registered to a different account.'
);

export const NO_THREAD_MESSAGE = prefixed(
  'No recent comment thread to reply to. Open the document to comment.'
);
