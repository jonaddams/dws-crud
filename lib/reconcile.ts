import type { DwsComment } from '@/lib/dws-comments';
import { type DirectoryUser, extractMentionedUserIds } from '@/lib/mentions';

/**
 * Reconciling a thread means asking DWS what it holds and comparing that against
 * what we have already acted on. DWS has no webhooks, so a browser tells us a
 * document changed and the server comes here to find out what actually happened —
 * the hint is never trusted for its contents, only as a nudge to look.
 *
 * The comparison is deliberately a pure function. It is where the behaviour worth
 * being sure about lives: what counts as new, and who each new comment mentions.
 * Reading from DWS and writing to Postgres sit outside it.
 */

export type ReconcileAction = {
  comment: DwsComment;
  mentionedUserIds: string[];
};

export type PlanReconcileOptions = {
  /** Every comment DWS currently holds for the thread. */
  fetched: DwsComment[];
  /** IDs of comments already recorded, mentions included. */
  observedCommentIds: string[];
  directory: DirectoryUser[];
};

/**
 * What this pass has to record, in the order DWS returned it.
 *
 * A comment mentioning nobody is still returned: it has to be written down, or
 * the next pass treats it as new again. Comments that have disappeared from DWS
 * are simply absent from the result — nothing is resurrected or re-notified.
 */
export const planReconcile = (options: PlanReconcileOptions): ReconcileAction[] => {
  const { fetched, observedCommentIds, directory } = options;
  const alreadySeen = new Set(observedCommentIds);

  return fetched
    .filter((comment) => !alreadySeen.has(comment.id))
    .map((comment) => ({
      comment,
      mentionedUserIds: extractMentionedUserIds({ comment, directory }),
    }));
};
