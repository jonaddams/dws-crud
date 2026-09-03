// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DWS_BASE_URL,
  DWS_MAX_UPLOAD_BYTES,
  resolveNutrientConfig,
} from '@/lib/nutrient-config';

describe('which backend the app talks to', () => {
  it('talks to the hosted DWS API unless told otherwise', () => {
    const config = resolveNutrientConfig({});

    expect(config.target).toBe('dws');
    expect(config.baseUrl).toBe(DEFAULT_DWS_BASE_URL);
  });

  it('talks to a self-hosted Document Engine when asked', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_TARGET: 'document-engine',
      NUTRIENT_BASE_URL: 'https://engine.internal:5000',
    });

    expect(config.target).toBe('document-engine');
    expect(config.baseUrl).toBe('https://engine.internal:5000');
  });

  it('refuses a target it cannot talk to, naming the ones it can', () => {
    expect(() => resolveNutrientConfig({ NUTRIENT_TARGET: 'on-prem' })).toThrow(/document-engine/);
  });

  it('refuses a self-hosted target with no address, since there is no default host', () => {
    // The hosted API has one well-known address; somebody else's server does not.
    // Defaulting here would silently send a customer's documents to the cloud.
    expect(() => resolveNutrientConfig({ NUTRIENT_TARGET: 'document-engine' })).toThrow(
      /NUTRIENT_BASE_URL/
    );
  });
});

describe('the backend address', () => {
  it('is reduced to an origin, so call sites can append their own paths', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_BASE_URL: 'https://api.nutrient.io/viewer/documents',
    });

    expect(config.baseUrl).toBe('https://api.nutrient.io');
  });

  it('drops a trailing slash, so appending a path cannot double it', () => {
    const config = resolveNutrientConfig({ NUTRIENT_BASE_URL: 'https://api.nutrient.io/' });

    expect(config.baseUrl).toBe('https://api.nutrient.io');
  });

  it('accepts the older variable that carried a full endpoint path', () => {
    // This is what production actually holds today, so dropping it would break
    // the deploy that reads it.
    const config = resolveNutrientConfig({
      NUTRIENT_API_BASE_URL: 'https://api.nutrient.io/viewer/documents',
    });

    expect(config.baseUrl).toBe('https://api.nutrient.io');
  });

  it('accepts the older variable that carried only an origin', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_API_BASE_URL_ROOT: 'https://engine.internal',
    });

    expect(config.baseUrl).toBe('https://engine.internal');
  });

  it('prefers the current variable over either older one', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_BASE_URL: 'https://current.example',
      NUTRIENT_API_BASE_URL: 'https://legacy.example/viewer/documents',
      NUTRIENT_API_BASE_URL_ROOT: 'https://legacy-root.example',
    });

    expect(config.baseUrl).toBe('https://current.example');
  });

  it('refuses an address that is not a URL', () => {
    expect(() => resolveNutrientConfig({ NUTRIENT_BASE_URL: 'engine.internal' })).toThrow(
      /NUTRIENT_BASE_URL/
    );
  });
});

describe('the upload ceiling', () => {
  it('defaults to what the hosted API will actually accept', () => {
    expect(resolveNutrientConfig({}).limits.maxUploadBytes).toBe(DWS_MAX_UPLOAD_BYTES);
  });

  it('refuses a ceiling the hosted API would reject anyway', () => {
    // Configuring 200MB against DWS does not raise the limit, it just moves the
    // failure from our validation to an opaque 413 from the API.
    expect(() =>
      resolveNutrientConfig({ NUTRIENT_MAX_UPLOAD_BYTES: String(DWS_MAX_UPLOAD_BYTES + 1) })
    ).toThrow(/DWS/);
  });

  it('allows a self-hosted deployment to raise it, since its limit is its own', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_TARGET: 'document-engine',
      NUTRIENT_BASE_URL: 'https://engine.internal',
      NUTRIENT_MAX_UPLOAD_BYTES: String(DWS_MAX_UPLOAD_BYTES * 4),
    });

    expect(config.limits.maxUploadBytes).toBe(DWS_MAX_UPLOAD_BYTES * 4);
  });

  it('refuses a ceiling that is not a positive whole number of bytes', () => {
    expect(() => resolveNutrientConfig({ NUTRIENT_MAX_UPLOAD_BYTES: 'lots' })).toThrow(
      /NUTRIENT_MAX_UPLOAD_BYTES/
    );
    expect(() => resolveNutrientConfig({ NUTRIENT_MAX_UPLOAD_BYTES: '0' })).toThrow(
      /NUTRIENT_MAX_UPLOAD_BYTES/
    );
    expect(() => resolveNutrientConfig({ NUTRIENT_MAX_UPLOAD_BYTES: '-1' })).toThrow(
      /NUTRIENT_MAX_UPLOAD_BYTES/
    );
  });
});

describe('which files may be uploaded', () => {
  it('accepts PDFs out of the box', () => {
    expect(resolveNutrientConfig({}).limits.allowedMimeTypes).toContain('application/pdf');
  });

  it('takes a comma-separated list, ignoring spacing and case', () => {
    const config = resolveNutrientConfig({
      NUTRIENT_ALLOWED_MIME_TYPES: 'application/pdf, IMAGE/PNG ,,image/jpeg',
    });

    expect(config.limits.allowedMimeTypes).toEqual(['application/pdf', 'image/png', 'image/jpeg']);
  });

  it('refuses a list that configures nothing, which would reject every upload', () => {
    expect(() => resolveNutrientConfig({ NUTRIENT_ALLOWED_MIME_TYPES: ' , ' })).toThrow(
      /NUTRIENT_ALLOWED_MIME_TYPES/
    );
  });
});

describe('how long a request may take', () => {
  it('allows long enough for a slow operation by default', () => {
    // OCR and redaction are synchronous upstream and can take tens of seconds.
    expect(resolveNutrientConfig({}).limits.requestTimeoutMs).toBeGreaterThanOrEqual(60_000);
  });

  it('is configurable, since a self-hosted engine may be faster or slower', () => {
    const config = resolveNutrientConfig({ NUTRIENT_REQUEST_TIMEOUT_MS: '5000' });

    expect(config.limits.requestTimeoutMs).toBe(5000);
  });

  it('refuses a timeout that is not a positive number of milliseconds', () => {
    expect(() => resolveNutrientConfig({ NUTRIENT_REQUEST_TIMEOUT_MS: '0' })).toThrow(
      /NUTRIENT_REQUEST_TIMEOUT_MS/
    );
  });
});
