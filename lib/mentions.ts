import type { DwsComment } from '@/lib/dws-comments';

/**
 * Working out who a comment mentions.
 *
 * There are two sources and they are not equivalent.
 *
 * A comment written in the viewer carries the SDK's own mention list, which we
 * pass through as `customData.mentions`. That list is exact: it holds the user
 * IDs the author actually picked from the mention menu.
 *
 * A comment that arrived by email has no `customData` at all — somebody typed
 * `@bob` into their mail client. All we can do is match the text against the
 * directory, and that matching is deliberately conservative: an `@` token has to
 * resolve to a known user's email address or its local part, or it is ignored.
 * Display names are not matched, because they contain spaces and guessing where
 * a name ends produces false positives that email people who were never mentioned.
 */

export type DirectoryUser = {
  id: string;
  email: string;
  name: string | null;
};

/** `@` followed by an email-ish token: `@bob` or `@bob@nutrient.io`. */
const MENTION_TOKEN = /(^|[^\w@])@([\w.+-]+(?:@[\w.-]+\.[a-z]{2,})?)/gi;

/** How the viewer marks up a mention: `<span data-user-id="...">Name</span>`. */
const MARKED_UP_MENTION = /data-user-id=["']([^"']+)["']/gi;

/**
 * User IDs the viewer marked up in the comment body.
 *
 * The SDK does not hand us a mention list — it writes the mention into the text
 * as markup and leaves `customData` empty. That is exact identity, same as a
 * recorded list, so it is trusted the same way and read before falling back to
 * guessing at `@` tokens.
 */
const markedUpMentions = (text: string): string[] | null => {
  const ids = [...text.matchAll(MARKED_UP_MENTION)].map(([, id]) => id);

  return ids.length > 0 ? ids : null;
};

const recordedMentions = (customData: Record<string, unknown> | null): string[] | null => {
  const mentions = customData?.mentions;

  if (!Array.isArray(mentions)) return null;

  const ids = mentions.filter((value): value is string => typeof value === 'string');

  return ids.length > 0 ? ids : null;
};

const mentionsInText = (text: string, directory: DirectoryUser[]): string[] => {
  const byHandle = new Map<string, string>();

  for (const user of directory) {
    const email = user.email.toLowerCase();
    byHandle.set(email, user.id);
    byHandle.set(email.split('@')[0], user.id);
  }

  const found: string[] = [];

  for (const [, , handle] of text.matchAll(MENTION_TOKEN)) {
    const id = byHandle.get(handle.toLowerCase());
    if (id) found.push(id);
  }

  return found;
};

export type ExtractMentionedUserIdsOptions = {
  comment: DwsComment;
  directory: DirectoryUser[];
};

/**
 * User IDs the comment mentions, excluding the author — nobody needs an email
 * about their own comment. Order follows first appearance; duplicates are dropped.
 */
export const extractMentionedUserIds = (options: ExtractMentionedUserIdsOptions): string[] => {
  const { comment, directory } = options;

  const known = new Set(directory.map((user) => user.id));
  const candidates =
    recordedMentions(comment.customData) ??
    markedUpMentions(comment.text) ??
    mentionsInText(comment.text, directory);

  return [...new Set(candidates)].filter((id) => known.has(id) && id !== comment.authorUserId);
};
