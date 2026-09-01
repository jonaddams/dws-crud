// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { classifyKeyword } from '@/lib/sms-keywords';

describe('classifyKeyword', () => {
  // OPTOUT and REVOKE are registered with the A2P campaign as opt-out keywords.
  // A keyword the filing promises but the code does not honour is a compliance
  // failure a carrier can test for directly — and worse than silence, since the
  // message would instead fall through and be posted as a document comment.
  it.each([
    'STOP',
    'stop',
    ' Stop ',
    'STOPALL',
    'UNSUBSCRIBE',
    'CANCEL',
    'END',
    'QUIT',
    'OPTOUT',
    'REVOKE',
  ])('treats %s as an opt-out', (body) => {
    expect(classifyKeyword(body)).toBe('stop');
  });

  it.each(['START', 'start', 'YES', 'UNSTOP'])('treats %s as an opt-in', (body) => {
    expect(classifyKeyword(body)).toBe('start');
  });

  it.each(['HELP', 'help', 'INFO'])('treats %s as a help request', (body) => {
    expect(classifyKeyword(body)).toBe('help');
  });

  it('does not treat an ordinary reply as a keyword', () => {
    expect(classifyKeyword('Looks good, please stop by later')).toBeNull();
  });

  it('does not swallow a reply that merely begins with a keyword word', () => {
    expect(classifyKeyword('Start the review on Monday')).toBeNull();
  });
});
