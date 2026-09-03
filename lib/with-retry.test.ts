// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import { withRetry } from '@/lib/with-retry';

describe('retrying a fallible operation', () => {
  it('does not retry something that worked', async () => {
    const operation = vi.fn().mockResolvedValue('ok');

    await expect(withRetry(operation)).resolves.toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('succeeds on a later attempt after a transient failure', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('flaky'))
      .mockResolvedValue('recovered');

    await expect(withRetry(operation, { delayMs: 0 })).resolves.toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('gives up after the allowed number of attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('down'));

    await expect(withRetry(operation, { maxRetries: 2, delayMs: 0 })).rejects.toThrow('down');
    // One initial attempt plus two retries.
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('reports the last failure, not a wrapper, so the cause survives', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('first'))
      .mockRejectedValue(new Error('last'));

    await expect(withRetry(operation, { maxRetries: 1, delayMs: 0 })).rejects.toThrow('last');
  });

  it('can be told not to retry at all', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('once'));

    await expect(withRetry(operation, { maxRetries: 0 })).rejects.toThrow('once');
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
