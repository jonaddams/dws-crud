/**
 * The keywords US carriers require every A2P number to honour.
 *
 * Matched only when the keyword is the entire message. "Please stop by later" is
 * a comment, not an opt-out, and unsubscribing somebody who was talking to a
 * colleague is both wrong and the kind of bug nobody reports — they simply stop
 * hearing from us.
 */

const STOP_WORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const START_WORDS = ['START', 'YES', 'UNSTOP'];
const HELP_WORDS = ['HELP', 'INFO'];

export type SmsKeyword = 'stop' | 'start' | 'help';

export const classifyKeyword = (body: string): SmsKeyword | null => {
  const word = body.trim().toUpperCase();

  if (STOP_WORDS.includes(word)) return 'stop';
  if (START_WORDS.includes(word)) return 'start';
  if (HELP_WORDS.includes(word)) return 'help';

  return null;
};
