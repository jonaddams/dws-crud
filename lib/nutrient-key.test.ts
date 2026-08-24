// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveViewerApiKey } from '@/lib/nutrient-key';

describe('Choosing the Nutrient API key', () => {
  it('uses the viewer key', () => {
    expect(resolveViewerApiKey({ NUTRIENT_VIEWER_API_KEY: 'viewer-key' })).toBe('viewer-key');
  });

  it('accepts the old single-key name, so an existing deployment keeps working', () => {
    expect(resolveViewerApiKey({ NUTRIENT_API_KEY: 'legacy-key' })).toBe('legacy-key');
  });

  it('prefers the viewer key when a deployment still carries both', () => {
    expect(
      resolveViewerApiKey({
        NUTRIENT_VIEWER_API_KEY: 'viewer-key',
        NUTRIENT_API_KEY: 'legacy-key',
      })
    ).toBe('viewer-key');
  });

  it('treats an empty value as absent rather than sending an empty bearer token', () => {
    expect(
      resolveViewerApiKey({ NUTRIENT_VIEWER_API_KEY: '', NUTRIENT_API_KEY: 'legacy-key' })
    ).toBe('legacy-key');
  });

  it('names the variable to set when nothing is configured', () => {
    expect(() => resolveViewerApiKey({})).toThrow(/NUTRIENT_VIEWER_API_KEY/);
  });

  it('says which product surface the key is for, since the processor key is a different one', () => {
    expect(() => resolveViewerApiKey({})).toThrow(/[Vv]iewer/);
  });
});
