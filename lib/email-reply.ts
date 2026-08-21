/**
 * Recovering just the new text from an email reply.
 *
 * A reply carries the whole conversation beneath it. Posting that verbatim would
 * put the entire thread history back into the thread on every response, growing
 * quadratically and drowning the actual comment.
 *
 * There is no reliable way to do this — mail clients quote however they please,
 * and the heuristics below are the common cases, not a guarantee. That is an
 * accepted limit of the approach rather than a bug to chase: the alternative is
 * a structured reply widget, which defeats the point of replying from your inbox.
 * When the heuristics miss, the worst outcome is a comment with some quoted text
 * in it.
 */

/** `On <date>, <person> wrote:` — the usual attribution, possibly wrapped. */
const ATTRIBUTION = /^\s*On .+ wrote:\s*$/i;

/** Outlook and similar. */
const ORIGINAL_MESSAGE = /^\s*-{2,}\s*(original message|forwarded message)\s*-{2,}\s*$/i;

/** The conventional signature delimiter is exactly two hyphens and a space. */
const SIGNATURE_DELIMITER = /^-- $/;

/** A quoted line, however deeply nested. */
const QUOTED = /^\s*>/;

/** `Sent from my iPhone` and friends. */
const MOBILE_SIGNOFF = /^\s*sent from my .+/i;

/** What a mail client leaves in the text part where an image was. */
const IMAGE_PLACEHOLDER = /^\s*\[image:[^\]]*\]\s*$/i;

/** Nothing but punctuation and symbols. */
const PUNCTUATION_ONLY = /^[\s\p{P}\p{S}]+$/u;

/** Emoji are symbols too, and a row of them is a reply, not a rule. */
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * The shortest run of symbols treated as a horizontal rule.
 *
 * Four, so that an ellipsis on its own line stays. The conventional `-- ` is
 * shorter than this and is matched exactly by SIGNATURE_DELIMITER instead.
 */
const MIN_RULE_LENGTH = 4;

/**
 * Whether a line is a decorative rule opening a signature block.
 *
 * Plenty of signatures have no `-- ` delimiter. What they tend to have is a line
 * of dashes, underscores, box characters — or, in at least one real case, Morse
 * code — separating the message from the contact details beneath it.
 */
const isSignatureRule = (line: string): boolean => {
  if (EMOJI.test(line)) return false;
  if (line.replace(/\s/g, '').length < MIN_RULE_LENGTH) return false;

  return PUNCTUATION_ONLY.test(line);
};

/**
 * The text the sender added, with quoted history, attribution lines and any
 * signature removed. Returns an empty string when the reply added nothing.
 */
export const extractReplyBody = (raw: string): string => {
  const kept: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (
      ATTRIBUTION.test(line) ||
      ORIGINAL_MESSAGE.test(line) ||
      SIGNATURE_DELIMITER.test(line) ||
      MOBILE_SIGNOFF.test(line) ||
      isSignatureRule(line)
    ) {
      break;
    }

    if (QUOTED.test(line) || IMAGE_PLACEHOLDER.test(line)) continue;

    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
};
