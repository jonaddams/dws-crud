// @vitest-environment node

import { describe, expect, it } from 'vitest';
import type { NutrientLimits } from '@/lib/nutrient-config';
import { validateUpload } from '@/lib/upload-validation';

const limits = (overrides: Partial<NutrientLimits> = {}): NutrientLimits => ({
  maxUploadBytes: 1024,
  allowedMimeTypes: ['application/pdf', 'image/png'],
  requestTimeoutMs: 120_000,
  ...overrides,
});

const fileOf = (options: { bytes: number; type?: string }): File =>
  new File([new Uint8Array(options.bytes)], 'contract.pdf', {
    type: options.type ?? 'application/pdf',
  });

describe('accepting an upload', () => {
  it('accepts a supported file within the ceiling', () => {
    expect(validateUpload({ file: fileOf({ bytes: 512 }), limits: limits() })).toEqual({
      ok: true,
    });
  });

  it('accepts a file exactly at the ceiling, which is a limit not a threshold', () => {
    expect(validateUpload({ file: fileOf({ bytes: 1024 }), limits: limits() })).toEqual({
      ok: true,
    });
  });

  it('accepts a supported type written in any case', () => {
    // Browsers and clients are inconsistent about casing, and MIME types are
    // case-insensitive, so rejecting on case would refuse a valid PDF.
    const result = validateUpload({
      file: fileOf({ bytes: 10, type: 'Application/PDF' }),
      limits: limits(),
    });

    expect(result).toEqual({ ok: true });
  });
});

describe('rejecting an upload', () => {
  it('refuses a file one byte over the ceiling', () => {
    const result = validateUpload({ file: fileOf({ bytes: 1025 }), limits: limits() });

    expect(result.ok).toBe(false);
    // 413 is what the backend itself answers, so the app agrees with it rather
    // than inventing a different code for the same condition.
    expect(result).toMatchObject({ status: 413 });
  });

  it('says what the ceiling is, so the message is actionable', () => {
    const result = validateUpload({ file: fileOf({ bytes: 1025 }), limits: limits() });

    expect(result).toMatchObject({ message: expect.stringContaining('1024') });
  });

  it('refuses a type that is not configured, listing what is', () => {
    const result = validateUpload({
      file: fileOf({ bytes: 10, type: 'application/zip' }),
      limits: limits(),
    });

    expect(result).toMatchObject({ status: 415 });
    expect(result).toMatchObject({ message: expect.stringContaining('application/pdf') });
  });

  it('refuses a file carrying no type at all', () => {
    // The type is forwarded verbatim as the Content-Type of the upstream upload,
    // so an empty one produces a confusing backend failure rather than a clear
    // local one.
    const result = validateUpload({ file: fileOf({ bytes: 10, type: '' }), limits: limits() });

    expect(result).toMatchObject({ status: 415 });
  });

  it('refuses an empty file, which nothing downstream can process', () => {
    const result = validateUpload({ file: fileOf({ bytes: 0 }), limits: limits() });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ status: 400 });
  });

  it('checks the size before the type, so the larger problem is reported first', () => {
    const result = validateUpload({
      file: fileOf({ bytes: 2048, type: 'application/zip' }),
      limits: limits(),
    });

    expect(result).toMatchObject({ status: 413 });
  });
});
