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

export const buildMentionEmail = (options: MentionEmailOptions): MentionEmail => {
  const { recipientName, authorName, documentTitle, documentUrl, commentText, replyAddress } =
    options;

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
