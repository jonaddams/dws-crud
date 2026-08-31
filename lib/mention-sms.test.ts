// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { buildMentionSms } from '@/lib/mention-sms';

const options = {
  authorName: 'Alice Example',
  documentTitle: 'Q3 Contract',
  documentUrl: 'https://example.com/documents/doc_1',
};

describe('buildMentionSms', () => {
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

  it('fits a single segment for a typical document title', () => {
    expect(buildMentionSms(options).length).toBeLessThanOrEqual(160);
  });

  it('truncates a long document title rather than spilling into extra segments', () => {
    const message = buildMentionSms({ ...options, documentTitle: 'A'.repeat(200) });

    expect(message.length).toBeLessThanOrEqual(160);
    expect(message).toContain('…');
  });
});
