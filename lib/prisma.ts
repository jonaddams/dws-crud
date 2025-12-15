import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

// Lazy pool initialization - only create when DATABASE_URL is available
function getPool(): Pool {
  if (!globalForPrisma.pool) {
    const databaseUrl = process.env.DATABASE_URL;

    // Allow build to proceed without DATABASE_URL (runtime-only requirement)
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is not set');
    }

    globalForPrisma.pool = new Pool({
      connectionString: databaseUrl,
    });
  }
  return globalForPrisma.pool;
}

// Create adapter lazily to avoid build-time errors
function getAdapter(): PrismaPg {
  return new PrismaPg(getPool());
}

// Lazy Prisma client initialization
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: getAdapter(),
    });
  }
  return globalForPrisma.prisma;
}

// Export a proxy that delays initialization until first use
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrismaClient();
    return client[prop as keyof PrismaClient];
  },
});
