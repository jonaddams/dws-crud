// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildMentionEmail, type MentionEmailOptions } from '@/lib/mention-email';

const getOptions = (overrides: Partial<MentionEmailOptions> = {}): MentionEmailOptions => ({
  recipientName: 'Bob Example',
  authorName: 'Alice Example',
  documentTitle: 'Q3 Contract',
  documentUrl: 'https://app.example.com/documents/doc_1',
  commentText: 'Can we tighten this clause?',
  replyAddress: 'reply+abc123@jonaddams.com',
  ...overrides,
});

describe('The mention notification email', () => {
  it('says who mentioned them and where, in the subject', () => {
    const email = buildMentionEmail(getOptions());

    expect(email.subject).toBe('Alice Example mentioned you on Q3 Contract');
  });

  it('replies go to the thread address, not to a person', () => {
    const email = buildMentionEmail(getOptions());

    expect(email.replyTo).toBe('reply+abc123@jonaddams.com');
  });

  it('quotes the comment so the reader has the context', () => {
    const email = buildMentionEmail(getOptions({ commentText: 'Please review paragraph 4.' }));

    expect(email.text).toContain('Please review paragraph 4.');
    expect(email.html).toContain('Please review paragraph 4.');
  });

  it('links back to the document', () => {
    const email = buildMentionEmail(getOptions());

    expect(email.html).toContain('https://app.example.com/documents/doc_1');
    expect(email.text).toContain('https://app.example.com/documents/doc_1');
  });

  it('tells the reader their reply will land in the thread', () => {
    const email = buildMentionEmail(getOptions());

    expect(email.text.toLowerCase()).toContain('reply');
  });

  it('offers a plain text alternative alongside the html', () => {
    const email = buildMentionEmail(getOptions());

    expect(email.text).not.toContain('<');
    expect(email.html).toContain('<');
  });
});

describe('Comment text is untrusted input', () => {
  it('escapes markup so a comment cannot inject html into the email', () => {
    const email = buildMentionEmail(
      getOptions({ commentText: '<img src=x onerror="alert(1)">hello' })
    );

    expect(email.html).not.toContain('<img');
    expect(email.html).toContain('&lt;img');
    expect(email.html).toContain('hello');
  });

  it('escapes a document title that contains markup', () => {
    const email = buildMentionEmail(getOptions({ documentTitle: '<b>Q3</b>' }));

    expect(email.html).not.toContain('<b>Q3</b>');
    expect(email.html).toContain('&lt;b&gt;Q3&lt;/b&gt;');
  });

  it('escapes an author name that contains markup', () => {
    const email = buildMentionEmail(getOptions({ authorName: '<script>x</script>' }));

    expect(email.html).not.toContain('<script>');
  });

  it('leaves the plain text part unescaped, since it is not markup', () => {
    const email = buildMentionEmail(getOptions({ commentText: 'a < b & c > d' }));

    expect(email.text).toContain('a < b & c > d');
  });
});
