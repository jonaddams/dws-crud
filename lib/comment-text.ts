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
export const toPlainText = (value: string): string =>
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
