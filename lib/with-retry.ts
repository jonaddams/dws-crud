/**
 * Retry an operation a few times before giving up.
 *
 * Lifted out of the Nutrient client, where it had been a method: retrying is not
 * something a document backend does, it is something a caller decides to do
 * around any fallible call.
 *
 * The counts and the delay are deliberately *not* configurable. They do not
 * differ per deployment — they are a tuning constant, and every knob is a
 * support question and a test-matrix row. See lib/nutrient-config.ts for the
 * values that do belong in configuration.
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_DELAY_MS = 1000;

export type WithRetryOptions = {
  maxRetries?: number;
  delayMs?: number;
};

export const withRetry = async <T>(
  operation: () => Promise<T>,
  options: WithRetryOptions = {}
): Promise<T> => {
  const { maxRetries = DEFAULT_MAX_RETRIES, delayMs = DEFAULT_DELAY_MS } = options;

  let lastError: unknown = new Error('Retried operation never ran');

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
};
