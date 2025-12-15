import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';

type GlobalPrisma = {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

const globalForPrisma = globalThis as unknown as GlobalPrisma;

// Initialize Prisma Client with conditional adapter
function createPrismaClient(): PrismaClient {
  const databaseUrl = process.env.DATABASE_URL;

  // For build time without DATABASE_URL, create a basic client that won't be used
  if (!databaseUrl) {
    // This client won't actually connect during build
    return new PrismaClient();
  }

  // For runtime, use the PostgreSQL adapter
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
