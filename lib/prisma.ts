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
  const databaseUrl = process.env.DATABASE_URL;

  // If no DATABASE_URL, create client without adapter (build time)
  if (!databaseUrl) {
    return new PrismaClient();
  }

  // For runtime with DATABASE_URL, use PostgreSQL adapter
  if (!globalForPrisma.pool) {
    globalForPrisma.pool = new Pool({
      connectionString: databaseUrl,
    });
  }

  const adapter = new PrismaPg(globalForPrisma.pool);
  return new PrismaClient({ adapter });
}

// Export Prisma client with singleton pattern
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
