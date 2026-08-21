import { fetchComments, fetchThreadRoots } from '@/lib/dws-comments';
import type { DirectoryUser } from '@/lib/mentions';
import { prisma } from '@/lib/prisma';
import { planReconcile } from '@/lib/reconcile';

/**
 * Wiring around `planReconcile`: read the current state from DWS, ask the pure
 * planner what changed, and write the result down.
 *
 * Everything interesting is in the planner. This file is the shell that talks to
 * the outside world, kept deliberately thin for that reason.
 */

export type PendingNotification = {
  mentionId: string;
  threadId: string;
  rootAnnotationId: string;
  documentId: string;
  documentTitle: string;
  mentionedUserId: string;
  commentText: string;
  authorName: string;
};

/**
 * Every user is mentionable. This is the whole directory because the feature is
 * scoped to people who already have accounts — there is no guest participant.
 */
const loadDirectory = async (): Promise<DirectoryUser[]> =>
  prisma.user.findMany({ select: { id: true, email: true, name: true } });

/**
 * Brings our record of a document's comments up to date with DWS and returns the
 * mentions that still need telling.
 *
 * Safe to run repeatedly. A comment is recorded once, and the unique constraint on
 * (comment, user) means a second pass cannot produce a second notification for the
 * same mention.
 */
export const reconcileDocument = async (options: {
  documentId: string;
}): Promise<PendingNotification[]> => {
  const document = await prisma.document.findUnique({
    where: { id: options.documentId },
    select: { id: true, documentEngineId: true, title: true },
  });

  if (!document) {
    throw new Error(`Cannot reconcile unknown document ${options.documentId}`);
  }

  const [directory, rootAnnotationIds] = await Promise.all([
    loadDirectory(),
    fetchThreadRoots({ documentId: document.documentEngineId }),
  ]);

  const displayNameOf = new Map(directory.map((user) => [user.id, user.name ?? user.email]));

  for (const rootAnnotationId of rootAnnotationIds) {
    const thread = await prisma.commentThread.upsert({
      where: { rootAnnotationId },
      create: { rootAnnotationId, documentId: document.id },
      update: {},
      select: { id: true },
    });

    const [fetched, observed] = await Promise.all([
      fetchComments({ documentId: document.documentEngineId, rootAnnotationId }),
      prisma.observedComment.findMany({
        where: { threadId: thread.id },
        select: { dwsCommentId: true },
      }),
    ]);

    const actions = planReconcile({
      fetched,
      observedCommentIds: observed.map((comment) => comment.dwsCommentId),
      directory,
    });

    for (const { comment, mentionedUserIds } of actions) {
      await prisma.observedComment.create({
        data: {
          threadId: thread.id,
          dwsCommentId: comment.id,
          authorUserId: comment.authorUserId,
          mentions: {
            create: mentionedUserIds.map((mentionedUserId) => ({ mentionedUserId })),
          },
        },
      });
    }
  }

  const pending = await prisma.commentMention.findMany({
    where: {
      notifiedAt: null,
      comment: { thread: { documentId: document.id } },
    },
    select: {
      id: true,
      mentionedUserId: true,
      comment: {
        select: {
          dwsCommentId: true,
          authorUserId: true,
          thread: { select: { id: true, rootAnnotationId: true } },
        },
      },
    },
  });

  // DWS holds the comment text, not us, so it is re-read per thread rather than
  // duplicated into Postgres. Threads are few and this keeps one source of truth.
  const textByCommentId = new Map<string, string>();
  for (const rootAnnotationId of new Set(pending.map((m) => m.comment.thread.rootAnnotationId))) {
    const comments = await fetchComments({
      documentId: document.documentEngineId,
      rootAnnotationId,
    });
    for (const comment of comments) textByCommentId.set(comment.id, comment.text);
  }

  return pending.map((mention) => ({
    mentionId: mention.id,
    threadId: mention.comment.thread.id,
    rootAnnotationId: mention.comment.thread.rootAnnotationId,
    documentId: document.id,
    documentTitle: document.title,
    mentionedUserId: mention.mentionedUserId,
    commentText: textByCommentId.get(mention.comment.dwsCommentId) ?? '',
    authorName: displayNameOf.get(mention.comment.authorUserId ?? '') ?? 'Someone',
  }));
};
