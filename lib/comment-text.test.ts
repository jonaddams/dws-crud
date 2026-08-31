// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { toPlainText } from '@/lib/comment-text';

describe('toPlainText', () => {
  it('turns viewer paragraph markup into line breaks', () => {
    expect(toPlainText('<p>First</p><p>Second</p>')).toBe('First\nSecond');
  });

  it('strips the mention span but keeps the name inside it', () => {
    expect(toPlainText('Hi <span data-user-id="user_1">@Bob</span>, look')).toBe('Hi @Bob, look');
  });

  it('leaves arithmetic written in prose alone', () => {
    expect(toPlainText('a < b & c > d')).toBe('a < b & c > d');
  });

  it('decodes the entities the viewer emits', () => {
    expect(toPlainText('&quot;quoted&quot; &amp; escaped')).toBe('"quoted" & escaped');
  });
});
