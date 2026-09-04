/**
 * Which Nutrient backend this deployment talks to, and the limits it imposes.
 *
 * There are two, and a customer may run either: the hosted **DWS API** at
 * api.nutrient.io, or their own **Document Engine** on their own hardware. The
 * two are close but not interchangeable — different paths, different
 * authentication, and only the hosted one meters credits — so the target is a
 * fact the whole app has to agree on rather than something each call site
 * decides. `lib/document-provider.ts` turns this config into the right client;
 * this module only reads and validates.
 *
 * It replaces three disagreeing conventions for the same value. Before this,
 * `NUTRIENT_API_BASE_URL` meant *origin plus the documents path*,
 * `NUTRIENT_API_BASE_URL_ROOT` meant *origin only*, and the sessions endpoint
 * was hardcoded to api.nutrient.io and so could not be pointed anywhere else at
 * all. Both old names are still read, because production holds one of them.
 *
 * Limits live here for the same reason. They are not universal constants: the
 * hosted API rejects a file over 100 MB, while a self-hosted engine's ceiling is
 * whatever its operator configured. A value that legitimately differs per
 * deployment belongs in configuration; a value that does not — retry backoff,
 * say — is a tuning constant and stays in code, because every knob is a support
 * question and a test-matrix row.
 */

export type NutrientTarget = 'dws' | 'document-engine';

const TARGETS: readonly NutrientTarget[] = ['dws', 'document-engine'];

/** The hosted API's one well-known address. */
export const DEFAULT_DWS_BASE_URL = 'https://api.nutrient.io';

/**
 * The largest file the hosted API accepts, from its published limits.
 *
 * Configuring anything above this does not raise the ceiling — it just moves the
 * failure from our own validation to an opaque `413` from the API, after the
 * upload has already been paid for in bandwidth.
 */
export const DWS_MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

/**
 * Long enough for a slow synchronous operation.
 *
 * The Processor API has no async mode: OCR and redaction return the finished
 * document in the response body, so a large job holds the connection open for
 * tens of seconds and a short timeout would abandon work already being billed.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 120_000;

const DEFAULT_ALLOWED_MIME_TYPES: readonly string[] = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/png',
  'image/jpeg',
  'image/tiff',
];

export type NutrientLimits = {
  maxUploadBytes: number;
  allowedMimeTypes: readonly string[];
  requestTimeoutMs: number;
};

export type NutrientConfig = {
  target: NutrientTarget;
  /** An origin with no path and no trailing slash. Call sites append their own. */
  baseUrl: string;
  limits: NutrientLimits;
};

export type NutrientConfigEnv = {
  NUTRIENT_TARGET?: string;
  NUTRIENT_BASE_URL?: string;
  NUTRIENT_MAX_UPLOAD_BYTES?: string;
  NUTRIENT_ALLOWED_MIME_TYPES?: string;
  NUTRIENT_REQUEST_TIMEOUT_MS?: string;
  /** Superseded by NUTRIENT_BASE_URL. Held an origin *and* the documents path. */
  NUTRIENT_API_BASE_URL?: string;
  /** Superseded by NUTRIENT_BASE_URL. Held an origin only. */
  NUTRIENT_API_BASE_URL_ROOT?: string;
};

const isTarget = (value: string): value is NutrientTarget =>
  TARGETS.includes(value as NutrientTarget);

const resolveTarget = (raw: string | undefined): NutrientTarget => {
  if (!raw) {
    return 'dws';
  }

  if (!isTarget(raw)) {
    throw new Error(
      `NUTRIENT_TARGET must be one of ${TARGETS.join(', ')}, but was "${raw}". ` +
        'Use "dws" for the hosted API or "document-engine" for a self-hosted server.'
    );
  }

  return raw;
};

/**
 * Reduce whatever was configured to a bare origin.
 *
 * The old variables sometimes carried a path, so a path is discarded rather than
 * treated as an error — otherwise the existing production value would fail the
 * deploy that reads it.
 */
const toOrigin = (raw: string, variableName: string): string => {
  try {
    return new URL(raw).origin;
  } catch {
    throw new Error(
      `${variableName} must be an absolute URL such as https://api.nutrient.io, but was "${raw}".`
    );
  }
};

const resolveBaseUrl = (options: { env: NutrientConfigEnv; target: NutrientTarget }): string => {
  const { env, target } = options;

  if (env.NUTRIENT_BASE_URL) {
    return toOrigin(env.NUTRIENT_BASE_URL, 'NUTRIENT_BASE_URL');
  }

  if (env.NUTRIENT_API_BASE_URL) {
    return toOrigin(env.NUTRIENT_API_BASE_URL, 'NUTRIENT_API_BASE_URL');
  }

  if (env.NUTRIENT_API_BASE_URL_ROOT) {
    return toOrigin(env.NUTRIENT_API_BASE_URL_ROOT, 'NUTRIENT_API_BASE_URL_ROOT');
  }

  if (target === 'document-engine') {
    // There is no default address for somebody else's server, and guessing the
    // hosted one would silently send a customer's documents to the cloud.
    throw new Error(
      'NUTRIENT_BASE_URL is required when NUTRIENT_TARGET is "document-engine": ' +
        'a self-hosted Document Engine has no well-known address.'
    );
  }

  return DEFAULT_DWS_BASE_URL;
};

const resolvePositiveInteger = (options: {
  raw: string | undefined;
  variableName: string;
  fallback: number;
}): number => {
  const { raw, variableName, fallback } = options;

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${variableName} must be a positive whole number, but was "${raw}".`);
  }

  return parsed;
};

const resolveMaxUploadBytes = (options: {
  raw: string | undefined;
  target: NutrientTarget;
}): number => {
  const { raw, target } = options;

  const configured = resolvePositiveInteger({
    raw,
    variableName: 'NUTRIENT_MAX_UPLOAD_BYTES',
    fallback: DWS_MAX_UPLOAD_BYTES,
  });

  if (target === 'dws' && configured > DWS_MAX_UPLOAD_BYTES) {
    throw new Error(
      `NUTRIENT_MAX_UPLOAD_BYTES is ${configured}, above the ${DWS_MAX_UPLOAD_BYTES} bytes ` +
        'the hosted DWS API accepts. Raising it cannot work — the API answers 413 — so it ' +
        'would only turn our own clear rejection into an opaque one. A self-hosted ' +
        'Document Engine has no such cap; set NUTRIENT_TARGET=document-engine to raise it.'
    );
  }

  return configured;
};

const resolveAllowedMimeTypes = (raw: string | undefined): readonly string[] => {
  if (raw === undefined) {
    return DEFAULT_ALLOWED_MIME_TYPES;
  }

  const types = raw
    .split(',')
    .map((type) => type.trim().toLowerCase())
    .filter((type) => type.length > 0);

  if (types.length === 0) {
    throw new Error(
      `NUTRIENT_ALLOWED_MIME_TYPES was set to "${raw}", which names no types and would ` +
        'reject every upload. Leave it unset to accept the defaults.'
    );
  }

  return types;
};

/**
 * Treat a present-but-blank variable as absent.
 *
 * `.env.production` lists every name here with an empty assignment so the file
 * documents them, and Next loads that file in the production runtime — so a
 * documented-but-unset variable reaches the process as `''`, not as `undefined`.
 * Without this, resolvers that validate their input reject the blank and the
 * whole config throws, which takes out every route that resolves it.
 *
 * Only wholly blank values are erased. Something like `,,,` still reaches its
 * resolver and is still reported, because that is a typo worth surfacing rather
 * than an unset variable.
 */
const withoutBlanks = (env: NutrientConfigEnv): NutrientConfigEnv =>
  Object.fromEntries(
    Object.entries(env).filter(([, value]) => value === undefined || value.trim() !== '')
  );

export const resolveNutrientConfig = (rawEnv: NutrientConfigEnv): NutrientConfig => {
  const env = withoutBlanks(rawEnv);
  const target = resolveTarget(env.NUTRIENT_TARGET);

  return {
    target,
    baseUrl: resolveBaseUrl({ env, target }),
    limits: {
      maxUploadBytes: resolveMaxUploadBytes({ raw: env.NUTRIENT_MAX_UPLOAD_BYTES, target }),
      allowedMimeTypes: resolveAllowedMimeTypes(env.NUTRIENT_ALLOWED_MIME_TYPES),
      requestTimeoutMs: resolvePositiveInteger({
        raw: env.NUTRIENT_REQUEST_TIMEOUT_MS,
        variableName: 'NUTRIENT_REQUEST_TIMEOUT_MS',
        fallback: DEFAULT_REQUEST_TIMEOUT_MS,
      }),
    },
  };
};

/** The configuration of the running process. */
export const nutrientConfig = (): NutrientConfig =>
  resolveNutrientConfig({
    NUTRIENT_TARGET: process.env.NUTRIENT_TARGET,
    NUTRIENT_BASE_URL: process.env.NUTRIENT_BASE_URL,
    NUTRIENT_MAX_UPLOAD_BYTES: process.env.NUTRIENT_MAX_UPLOAD_BYTES,
    NUTRIENT_ALLOWED_MIME_TYPES: process.env.NUTRIENT_ALLOWED_MIME_TYPES,
    NUTRIENT_REQUEST_TIMEOUT_MS: process.env.NUTRIENT_REQUEST_TIMEOUT_MS,
    NUTRIENT_API_BASE_URL: process.env.NUTRIENT_API_BASE_URL,
    NUTRIENT_API_BASE_URL_ROOT: process.env.NUTRIENT_API_BASE_URL_ROOT,
  });
