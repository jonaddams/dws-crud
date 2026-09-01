/**
 * The text message somebody receives when they are mentioned on a document.
 *
 * Pure, like `buildMentionEmail`: given the facts, produce the message.
 *
 * **This message deliberately omits the comment text.** An email is a reasonable
 * place for a quote; a text message to a personal phone is not. It renders on a
 * lock screen, and the recipient never chose the device as a work surface. The
 * SMS names the author and the document and links to it — the comment itself
 * stays behind authentication. There is no `commentText` parameter, so adding one
 * back is a visible change rather than a quiet one — this is a deliberate privacy
 * decision, not an oversight. The genuine guarantees are the type signature
 * (`buildMentionSms` accepts no `commentText`, enforced by typecheck) and an
 * integration test in a later task that pushes comment text through the notifier
 * and asserts it is absent from the SMS body.
 */

/**
 * The program name every message leads with.
 *
 * Three things have to agree on this string, and a carrier reviewer checks all
 * three against each other: the sample messages filed with the A2P 10DLC
 * campaign, the examples published at https://jonaddams.com/sms, and what this
 * function actually sends. A mismatch between the filing and what a recipient
 * can look up is a documented cause of rejection — the first submission failed
 * its Call-to-Action check partly for that reason.
 *
 * Note this is the *program* name, which is not the same thing as the repository
 * or the deployment. Renaming either one does not license changing this.
 */
const PROGRAM_NAME = 'Bindery';

const STOP_NOTICE = ' Reply STOP to opt out.';

/**
 * The title and link are kept whole rather than truncated to fit one 160-char
 * GSM segment. A realistic production URL and author name routinely leave no
 * budget for the title at all, and truncating with an ellipsis (U+2026, not in
 * the GSM 03.38 alphabet) forces the whole message into UCS-2 — 70-char
 * segments instead of 160 — which costs *more* segments than sending the full
 * title untruncated. Concatenated (multi-part) SMS is accepted deliberately.
 * See the "SMS notifications" section of CLAUDE.md before reintroducing
 * truncation.
 */
export const buildMentionSms = (options: {
  authorName: string;
  documentTitle: string;
  documentUrl: string;
}): string => {
  const { authorName, documentTitle, documentUrl } = options;

  return `${PROGRAM_NAME}: ${authorName} mentioned you on "${documentTitle}". Reply to add a comment. ${documentUrl}${STOP_NOTICE}`;
};
