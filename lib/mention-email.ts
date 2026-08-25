/**
 * The email somebody receives when they are mentioned on a document.
 *
 * Pure on purpose: given the facts, produce the message. Sending it, and working
 * out the reply address, happen elsewhere.
 *
 * Everything interpolated into the HTML part is escaped. Comment text, document
 * titles and display names are all user input, and an unescaped comment would let
 * one user put arbitrary markup into another user's inbox.
 */

export type MentionEmailOptions = {
  recipientName: string;
  authorName: string;
  documentTitle: string;
  documentUrl: string;
  commentText: string;
  /** Per-(thread, recipient) address; a reply to it re-enters the thread. */
  replyAddress: string;
};

export type MentionEmail = {
  subject: string;
  text: string;
  html: string;
  replyTo: string;
};

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/**
 * A comment as prose, for a reader.
 *
 * Comments written in the viewer are HTML — paragraphs, and a `<span>` carrying
 * the user ID for each mention. Escaping that without flattening it first shows
 * the reader the tags rather than the sentence.
 *
 * Flattening happens before escaping, never instead of it: the text is still
 * user input, and the escape below is what keeps it from injecting into the
 * email. This is deliberately a reader-facing convenience, not a sanitiser.
 */
const toPlainText = (value: string): string =>
  value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>|<\/div>|<\/li>/gi, '\n')
    // A tag name must follow the "<", so arithmetic written in prose — "a < b
    // & c > d" — is left alone instead of being mistaken for a tag and deleted.
    .replace(/<\/?[a-zA-Z][^>]*>/g, '')
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? entity)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const buildMentionEmail = (options: MentionEmailOptions): MentionEmail => {
  const { recipientName, authorName, documentTitle, documentUrl, replyAddress } = options;

  const commentText = toPlainText(options.commentText);

  const subject = `${authorName} mentioned you on ${documentTitle}`;

  const text = [
    `Hi ${recipientName},`,
    '',
    `${authorName} mentioned you in a comment on "${documentTitle}":`,
    '',
    commentText,
    '',
    'Reply to this email and your response will be added to the comment thread.',
    '',
    `Open the document: ${documentUrl}`,
  ].join('\n');

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a1414; max-width: 600px;">
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p>${escapeHtml(authorName)} mentioned you in a comment on
        <strong>${escapeHtml(documentTitle)}</strong>:</p>
      <blockquote style="margin: 16px 0; padding: 12px 16px; border-left: 3px solid #d4d4d4; background: #f5f5f5;">
        ${escapeHtml(commentText)}
      </blockquote>
      <p><strong>Reply to this email</strong> and your response will be added to the comment thread.</p>
      <p><a href="${escapeHtml(documentUrl)}">Open the document</a></p>
    </div>
  `.trim();

  return { subject, text, html, replyTo: replyAddress };
};
