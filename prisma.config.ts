import { defineConfig } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Locally the connection string lives
// in one of these; on Vercel and in CI it is already in the ambient environment.
// .env.local is loaded second so it wins, matching the usual convention.
for (const file of ['.env', '.env.local']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent is fine - fall through to whatever the environment already holds.
  }
}

const databaseUrl = process.env.DATABASE_URL;

/**
 * Prisma 7 moved the datasource URL out of schema.prisma and into this file.
 * Without it the migrate commands fail with "datasource.url property is
 * required", which is why no migration had been run since the Prisma 7 upgrade.
 *
 * The datasource is omitted entirely when DATABASE_URL is unset, rather than
 * declared with a missing value. `prisma generate` needs no connection string,
 * and it runs from postinstall during the Vercel build where none is available;
 * using prisma/config's `env()` helper there throws PrismaConfigEnvError and
 * fails the whole install. Migrate commands still report the missing URL clearly.
 *
 * The application itself does not read this: lib/prisma.ts builds its own
 * connection through the PrismaPg driver adapter at runtime. This is for the CLI.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  ...(databaseUrl ? { datasource: { url: databaseUrl } } : {}),
});
