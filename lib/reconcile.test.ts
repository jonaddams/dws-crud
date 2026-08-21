// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { DwsComment } from '@/lib/dws-comments';
import type { DirectoryUser } from '@/lib/mentions';
import { planReconcile } from '@/lib/reconcile';

const DIRECTORY: DirectoryUser[] = [
  { id: 'user_alice', email: 'alice@nutrient.io', name: 'Alice Example' },
  { id: 'user_bob', email: 'bob@nutrient.io', name: 'Bob Example' },
];

const getComment = (id: string, overrides: Partial<DwsComment> = {}): DwsComment => ({
  id,
  text: '',
  authorUserId: 'user_alice',
  creatorName: 'Alice Example',
  customData: null,
  createdAt: null,
  ...overrides,
});

describe('Deciding what a reconcile has to act on', () => {
  it('reports a comment nobody has seen before', () => {
    const plan = planReconcile({
      fetched: [getComment('cmt_1', { text: 'over to @bob' })],
      observedCommentIds: [],
      directory: DIRECTORY,
    });

    expect(plan).toEqual([
      { comment: expect.objectContaining({ id: 'cmt_1' }), mentionedUserIds: ['user_bob'] },
    ]);
  });

  it('says nothing when every comment has already been processed', () => {
    const plan = planReconcile({
      fetched: [getComment('cmt_1', { text: 'over to @bob' })],
      observedCommentIds: ['cmt_1'],
      directory: DIRECTORY,
    });

    expect(plan).toEqual([]);
  });

  it('reports only the comments added since the last pass', () => {
    const plan = planReconcile({
      fetched: [
        getComment('cmt_1', { text: 'over to @bob' }),
        getComment('cmt_2', { text: 'and @bob again' }),
        getComment('cmt_3', { text: 'no mentions here' }),
      ],
      observedCommentIds: ['cmt_1'],
      directory: DIRECTORY,
    });

    expect(plan.map((entry) => entry.comment.id)).toEqual(['cmt_2', 'cmt_3']);
  });

  it('still reports a comment that mentions nobody, so it is not seen as new next time', () => {
    const plan = planReconcile({
      fetched: [getComment('cmt_1', { text: 'just a note to myself' })],
      observedCommentIds: [],
      directory: DIRECTORY,
    });

    expect(plan).toEqual([
      { comment: expect.objectContaining({ id: 'cmt_1' }), mentionedUserIds: [] },
    ]);
  });

  it('is unaffected by comments it has seen that are no longer returned', () => {
    // A deleted comment should not resurrect or cause a re-notify.
    const plan = planReconcile({
      fetched: [getComment('cmt_2', { text: 'hello @bob' })],
      observedCommentIds: ['cmt_1', 'cmt_2'],
      directory: DIRECTORY,
    });

    expect(plan).toEqual([]);
  });

  it('does nothing at all for a thread with no comments', () => {
    expect(
      planReconcile({ fetched: [], observedCommentIds: ['cmt_1'], directory: DIRECTORY })
    ).toEqual([]);
  });

  it('does not plan a notification for the comment author', () => {
    const plan = planReconcile({
      fetched: [
        getComment('cmt_1', {
          authorUserId: 'user_bob',
          customData: { mentions: ['user_alice', 'user_bob'] },
        }),
      ],
      observedCommentIds: [],
      directory: DIRECTORY,
    });

    expect(plan[0].mentionedUserIds).toEqual(['user_alice']);
  });
});
