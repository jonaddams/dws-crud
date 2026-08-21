import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

type GlobalPrisma = {
  prisma: PrismaClient | undefined;
};

const globalForPrisma = globalThis as unknown as GlobalPrisma;

/**
 * The connection string, preferring the variable Vercel's Neon integration sets.
 *
 * Throws when nothing is configured. The previous behaviour was to fall back to
 * `new PrismaClient()` with no adapter, which quietly connected to 127.0.0.1 and
 * only surfaced much later as a confusing "Can't reach database server" on an
 * unrelated query. A missing connection string is a configuration error and
 * should say so.
 */
export type DatabaseEnv = {
  DATABASE_POSTGRES_PRISMA_URL?: string;
  DATABASE_URL?: string;
};

export const resolveDatabaseUrl = (env: DatabaseEnv): string => {
  const databaseUrl = env.DATABASE_POSTGRES_PRISMA_URL || env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'No database connection configured: set DATABASE_POSTGRES_PRISMA_URL or DATABASE_URL'
    );
  }

  return databaseUrl;
};

/**
 * Builds the client with the PostgreSQL driver adapter.
 *
 * The adapter is given a connection config, **not** a `pg.Pool`. Its constructor
 * accepts either, but it distinguishes them by identity, and under pnpm the
 * adapter resolves its own copy of `pg` — so a Pool built from this project's
 * `pg` is not recognised as one. It gets treated as a `PoolConfig` instead, and
 * the adapter then constructs a pool from our pool object: every property
 * becomes a connection option, `Promise` among them, and the protocol write
 * fails with "The string argument must be of type string... Received an instance
 * of Object" before any connection is made. In production that surfaced as
 * `DriverAdapterError: DatabaseNotReachable` against 127.0.0.1.
 *
 * Passing the connection string sidesteps the identity check entirely and lets
 * the adapter manage its own pool.
 */
function createPrismaClient(): PrismaClient {
  const connectionString = resolveDatabaseUrl({
    DATABASE_POSTGRES_PRISMA_URL: process.env.DATABASE_POSTGRES_PRISMA_URL,
    DATABASE_URL: process.env.DATABASE_URL,
  });

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({ adapter });
}

// Lazy initialization - don't create client until first access. This is what
// keeps a build from needing a database.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

// Export a Proxy that creates the client only when accessed
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    const value = client[prop as keyof PrismaClient];

    if (typeof value === 'function') {
      return value.bind(client);
    }

    return value;
  },
});
