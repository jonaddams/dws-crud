import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

type GlobalPrisma = {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const globalForPrisma = globalThis as unknown as GlobalPrisma;

// Initialize Prisma Client with PostgreSQL adapter
function createPrismaClient(): PrismaClient {
  // Try Vercel Neon variable first, fallback to DATABASE_URL
  const databaseUrl = process.env.DATABASE_POSTGRES_PRISMA_URL || process.env.DATABASE_URL;

  // If no DATABASE_URL or it's a placeholder, create client without adapter (build time)
  if (!databaseUrl || databaseUrl.includes('placeholder')) {
    return new PrismaClient();
  }

  // For runtime with real DATABASE_URL, use PostgreSQL adapter
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({
      connectionString: databaseUrl,
    });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  return new PrismaClient({ adapter });
}

// Lazy initialization - don't create client until first access
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
