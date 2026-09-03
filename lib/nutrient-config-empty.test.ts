// @vitest-environment node

/**
 * A documented-but-unset variable arrives as an empty string, not as undefined.
 *
 * `.env.production` lists every NUTRIENT_* name with an empty assignment so the
 * file documents them, and Next loads that file in the production runtime. So
 * `FOO=` in the file means `process.env.FOO === ''`, and every resolver has to
 * treat that as "not configured" rather than as a configured empty value.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DWS_BASE_URL,
  DWS_MAX_UPLOAD_BYTES,
  resolveNutrientConfig,
} from '@/lib/nutrient-config';

describe('a variable that is present but empty', () => {
  it('falls back for every limit rather than throwing', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_TARGET: 'dws',
      NUTRIENT_BASE_URL: '',
      NUTRIENT_MAX_UPLOAD_BYTES: '',
      NUTRIENT_ALLOWED_MIME_TYPES: '',
      NUTRIENT_REQUEST_TIMEOUT_MS: '',
    });

    expect(config.baseUrl).toBe(DEFAULT_DWS_BASE_URL);
    expect(config.limits.maxUploadBytes).toBe(DWS_MAX_UPLOAD_BYTES);
    expect(config.limits.allowedMimeTypes).toContain('application/pdf');
    expect(config.limits.requestTimeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('treats an empty target as unset rather than unrecognised', () => {
    expect(resolveNutrientConfig({ NUTRIENT_TARGET: '' }).target).toBe('dws');
  });

  it('reproduces exactly what .env.production declares', () => {
    // This is the shape the committed file produces. It threw before this fix,
    // which would have taken out upload, viewer-url and delete in production —
    // every route that resolves the config.
    expect(() =>
      resolveNutrientConfig({
        NUTRIENT_TARGET: 'dws',
        NUTRIENT_BASE_URL: '',
        NUTRIENT_MAX_UPLOAD_BYTES: '',
        NUTRIENT_ALLOWED_MIME_TYPES: '',
        NUTRIENT_REQUEST_TIMEOUT_MS: '',
      })
    ).not.toThrow();
  });
});
