/**
 * Whether a file may be uploaded at all.
 *
 * Nothing checked this before — not the client, not the route. The upload
 * handler confirmed that a file and a title were present and then forwarded
 * whatever it had received, so an oversized or unsupported file travelled all
 * the way to the backend before being refused, and the refusal arrived as an
 * opaque `413` or `415` after the bytes had already been paid for twice.
 * CLAUDE.md's "250MB limit" described an intention, not any code.
 *
 * The ceilings come from `lib/nutrient-config.ts` rather than from constants
 * here, because they legitimately differ by deployment: the hosted API refuses a
 * file over 100 MB, while a self-hosted Document Engine's limit is whatever its
 * operator configured.
 *
 * The status codes deliberately match the ones the backend uses for the same
 * conditions. Answering `413` for "too large" and `415` for "wrong type" means
 * a caller sees one behaviour whether the check happened here or upstream.
 */

import type { NutrientLimits } from '@/lib/nutrient-config';

export type UploadValidation =
  | { ok: true }
  | {
      ok: false;
      status: 400 | 413 | 415;
      message: string;
    };

const describeBytes = (bytes: number): string => `${bytes} bytes`;

export const validateUpload = (options: {
  file: File;
  limits: NutrientLimits;
}): UploadValidation => {
  const { file, limits } = options;

  if (file.size === 0) {
    return {
      ok: false,
      status: 400,
      message: 'The uploaded file is empty.',
    };
  }

  // Size first: it is the more expensive problem, and reporting the type of a
  // file that could never be accepted anyway would be the less useful answer.
  if (file.size > limits.maxUploadBytes) {
    return {
      ok: false,
      status: 413,
      message:
        `The file is ${describeBytes(file.size)}, above the ` +
        `${describeBytes(limits.maxUploadBytes)} this deployment accepts.`,
    };
  }

  const mimeType = file.type.trim().toLowerCase();

  if (!mimeType) {
    return {
      ok: false,
      status: 415,
      message:
        'The uploaded file carries no content type, so it cannot be identified. ' +
        `Supported types are: ${limits.allowedMimeTypes.join(', ')}.`,
    };
  }

  if (!limits.allowedMimeTypes.includes(mimeType)) {
    return {
      ok: false,
      status: 415,
      message:
        `Files of type ${mimeType} are not accepted. ` +
        `Supported types are: ${limits.allowedMimeTypes.join(', ')}.`,
    };
  }

  return { ok: true };
};
