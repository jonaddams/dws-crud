// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildMentionSms } from '@/lib/mention-sms';

const options = {
  authorName: 'Alice Example',
  documentTitle: 'Q3 Contract',
  documentUrl: 'https://example.com/documents/doc_1',
};

describe('buildMentionSms', () => {
  it('identifies the sending program, so a recipient knows who is texting them', () => {
    // Carriers expect an A2P message to identify its program, and this prefix is
    // registered as part of the campaign's sample messages. Someone reading a
    // lock screen sees the program name before anything else.
    expect(buildMentionSms(options)).toMatch(/^Bindery: /);
  });

  it('names the author and the document and links to it', () => {
    const message = buildMentionSms(options);

    expect(message).toContain('Alice Example');
    expect(message).toContain('Q3 Contract');
    expect(message).toContain('https://example.com/documents/doc_1');
  });

  it('tells the reader they can reply, since that is not obvious from a text', () => {
    expect(buildMentionSms(options).toLowerCase()).toContain('reply');
  });

  it('carries STOP instructions, which carriers require on the message itself', () => {
    expect(buildMentionSms(options)).toContain('STOP');
  });

  it('keeps the full title and the intact link even at production-realistic length, accepting concatenated SMS instead of truncating', () => {
    // A real NEXT_PUBLIC_APP_URL on a vercel.app host plus a long author name
    // pushes fixed overhead well past 160 chars on its own. Truncating the
    // title used to "fix" this by inserting U+2026, which is outside the GSM
    // 03.38 alphabet and forces the whole message into UCS-2 (70-char
    // segments) — costing more segments than the untruncated GSM original.
    // The message must carry the full title and URL regardless.
    const longTitle =
      'Amended and Restated Master Services Agreement Between Acme Corporation and Example Industries LLC';
    const productionUrl = 'https://dws-crud.vercel.app/documents/clx1a2b3c4d5e6f7g8h9i0j1k';
    const longAuthorName = 'Alexandria Montgomery-Fitzgerald';

    const message = buildMentionSms({
      authorName: longAuthorName,
      documentTitle: longTitle,
      documentUrl: productionUrl,
    });

    expect(message).toContain(longTitle);
    expect(message).toContain(productionUrl);
  });
});
