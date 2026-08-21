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

/**
 * The text the sender added, with quoted history, attribution lines and any
 * signature removed. Returns an empty string when the reply added nothing.
 */
export const extractReplyBody = (raw: string): string => {
  const kept: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (ATTRIBUTION.test(line) || ORIGINAL_MESSAGE.test(line) || SIGNATURE_DELIMITER.test(line)) {
      break;
    }

    if (QUOTED.test(line)) continue;

    kept.push(line);
  }

  return kept
    .join('\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
};
