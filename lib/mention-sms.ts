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

const SINGLE_SEGMENT_LIMIT = 160;
const STOP_NOTICE = ' Reply STOP to opt out.';

/**
 * A document title long enough to push the message into a second segment is
 * truncated rather than allowed to cost an extra message. The link matters more
 * than the full title: the title is context, the link is the action.
 */
const fitTitle = (title: string, budget: number): string =>
  title.length <= budget ? title : `${title.slice(0, Math.max(0, budget - 1)).trimEnd()}…`;

export const buildMentionSms = (options: {
  authorName: string;
  documentTitle: string;
  documentUrl: string;
}): string => {
  const { authorName, documentUrl } = options;

  const frame = (title: string): string =>
    `${authorName} mentioned you on "${title}". Reply to add a comment. ${documentUrl}${STOP_NOTICE}`;

  const overflow = frame(options.documentTitle).length - SINGLE_SEGMENT_LIMIT;

  return frame(
    overflow <= 0
      ? options.documentTitle
      : fitTitle(options.documentTitle, options.documentTitle.length - overflow)
  );
};
