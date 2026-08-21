// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { DwsComment } from '@/lib/dws-comments';
import { type DirectoryUser, extractMentionedUserIds } from '@/lib/mentions';

const DIRECTORY: DirectoryUser[] = [
  { id: 'user_alice', email: 'alice@nutrient.io', name: 'Alice Example' },
  { id: 'user_bob', email: 'bob@nutrient.io', name: 'Bob Example' },
  { id: 'user_carol', email: 'carol@pspdfkit.com', name: null },
];

const getComment = (overrides: Partial<DwsComment> = {}): DwsComment => ({
  id: 'cmt_1',
  text: '',
  authorUserId: 'user_alice',
  creatorName: 'Alice Example',
  customData: null,
  createdAt: null,
  ...overrides,
});

const mentionedIn = (comment: DwsComment) =>
  extractMentionedUserIds({ comment, directory: DIRECTORY });

describe('Mentions recorded by the viewer', () => {
  it('trusts the mention list the SDK attached to the comment', () => {
    const comment = getComment({
      text: 'Have a look @Bob Example',
      customData: { mentions: ['user_bob'] },
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('ignores identifiers in that list that match nobody we know', () => {
    const comment = getComment({ customData: { mentions: ['user_bob', 'user_ghost'] } });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('never notifies the author about their own comment', () => {
    const comment = getComment({
      authorUserId: 'user_alice',
      customData: { mentions: ['user_alice', 'user_bob'] },
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });
});

describe('Mentions written by hand, as in an emailed reply', () => {
  // A comment arriving by email has no customData, so the text is all we have.

  it('matches a full email address', () => {
    const comment = getComment({ text: 'good point @bob@nutrient.io', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('matches the local part on its own', () => {
    const comment = getComment({ text: 'thanks @bob, will fix', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('matches regardless of case', () => {
    const comment = getComment({ text: 'over to you @BOB', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('finds several people in one comment', () => {
    const comment = getComment({ text: '@bob @carol please review', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual(['user_bob', 'user_carol']);
  });

  it('mentions someone once however many times they are named', () => {
    const comment = getComment({
      text: '@bob and again @bob@nutrient.io',
      authorUserId: 'user_alice',
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('ignores an @ token that matches nobody', () => {
    const comment = getComment({ text: 'cc @nobody', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual([]);
  });

  it('does not treat a bare email address as a mention', () => {
    const comment = getComment({ text: 'write to bob@nutrient.io', authorUserId: 'user_alice' });

    expect(mentionedIn(comment)).toEqual([]);
  });

  it('finds nobody in an empty comment', () => {
    expect(mentionedIn(getComment({ text: '' }))).toEqual([]);
  });
});

describe('Choosing between the two sources', () => {
  it('prefers the recorded list over the text when both are present', () => {
    // The viewer records exactly who was picked; the text may name others loosely.
    const comment = getComment({
      text: '@carol should see this too',
      customData: { mentions: ['user_bob'] },
      authorUserId: 'user_alice',
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('falls back to the text when the recorded list is present but empty', () => {
    const comment = getComment({
      text: 'over to @bob',
      customData: { mentions: [] },
      authorUserId: 'user_alice',
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });

  it('falls back to the text when customData holds unrelated keys', () => {
    const comment = getComment({
      text: 'over to @bob',
      customData: { source: 'email' },
      authorUserId: 'user_alice',
    });

    expect(mentionedIn(comment)).toEqual(['user_bob']);
  });
});
