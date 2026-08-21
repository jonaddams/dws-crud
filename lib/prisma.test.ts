// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { resolveDatabaseUrl } from '@/lib/prisma';

describe('Choosing the database connection', () => {
  it('prefers the Neon variable Vercel provides', () => {
    const url = resolveDatabaseUrl({
      DATABASE_POSTGRES_PRISMA_URL: 'postgres://neon/db',
      DATABASE_URL: 'postgres://local/db',
    });

    expect(url).toBe('postgres://neon/db');
  });

  it('falls back to DATABASE_URL for local development', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgres://local/db' })).toBe('postgres://local/db');
  });

  it('ignores an empty value rather than treating it as configured', () => {
    expect(
      resolveDatabaseUrl({ DATABASE_POSTGRES_PRISMA_URL: '', DATABASE_URL: 'postgres://local/db' })
    ).toBe('postgres://local/db');
  });

  it('fails loudly when nothing is configured', () => {
    // Previously this fell back to a client with no adapter, which silently
    // connected to 127.0.0.1 and surfaced much later as an unrelated error.
    expect(() => resolveDatabaseUrl({})).toThrow(/DATABASE_POSTGRES_PRISMA_URL|DATABASE_URL/);
  });
});
