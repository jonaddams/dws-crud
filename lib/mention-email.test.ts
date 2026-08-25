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

describe('Comment text that arrived as markup', () => {
  // The viewer stores comments as HTML. Escaping it without flattening it first
  // shows the reader the tags.
  const FROM_VIEWER =
    '<p><span data-user-id="user_bob">Bob Example</span> could you check this?</p>';

  it('reads as prose rather than markup', () => {
    const email = buildMentionEmail(getOptions({ commentText: FROM_VIEWER }));

    expect(email.text).toContain('Bob Example could you check this?');
    expect(email.text).not.toContain('<span');
    expect(email.text).not.toContain('data-user-id');
  });

  it('puts no tags in the HTML part either', () => {
    const email = buildMentionEmail(getOptions({ commentText: FROM_VIEWER }));

    expect(email.html).not.toContain('data-user-id');
    expect(email.html).toContain('Bob Example could you check this?');
  });

  it('keeps paragraphs and line breaks apart', () => {
    const email = buildMentionEmail(
      getOptions({ commentText: '<p>First point</p><p>Second point<br>and a break</p>' })
    );

    expect(email.text).toContain('First point');
    expect(email.text).toContain('Second point');
    expect(email.text).toContain('and a break');
    expect(email.text).not.toContain('First pointSecond point');
  });

  it('decodes entities instead of showing them', () => {
    const email = buildMentionEmail(
      getOptions({ commentText: '<p>Tighten &amp; clarify clause 3 &lt; 4</p>' })
    );

    expect(email.text).toContain('Tighten & clarify clause 3 < 4');
  });

  it('still escapes markup so a comment cannot inject into the email', () => {
    const email = buildMentionEmail(
      getOptions({ commentText: '<p>look</p><script>alert(1)</script>' })
    );

    expect(email.html).not.toContain('<script>');
  });

  it('leaves a plain comment untouched', () => {
    const email = buildMentionEmail(getOptions({ commentText: 'Can we tighten this clause?' }));

    expect(email.text).toContain('Can we tighten this clause?');
  });
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

    // The tag is removed by flattening rather than escaped into visible text,
    // so the assertion is on the property — nothing live reaches the reader.
    expect(email.html).not.toContain('<img');
    expect(email.html).not.toContain('onerror');
    expect(email.html).toContain('hello');
  });

  it('escapes what survives flattening, so the escape is not bypassed', () => {
    // A "<" with no tag name after it is prose, so flattening leaves it. That is
    // exactly the input the escape has to catch, and this fails if it is ever
    // dropped on the assumption that flattening already made the text safe.
    const email = buildMentionEmail(getOptions({ commentText: 'a < b' }));

    expect(email.html).toContain('a &lt; b');
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
