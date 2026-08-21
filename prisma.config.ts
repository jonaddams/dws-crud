import { defineConfig, env } from 'prisma/config';

// Prisma 7 no longer reads .env on its own. Locally the connection string lives
// there; in CI and on Vercel it is already in the ambient environment.
try {
  process.loadEnvFile('.env');
} catch {
  // No local .env file - fall through to the ambient environment.
}

/**
 * Prisma 7 moved the datasource URL out of schema.prisma and into this file.
 * Without it the migrate commands fail with "datasource.url property is
 * required", which is why no migration had been run since the Prisma 7 upgrade.
 *
 * The application itself does not read this: lib/prisma.ts builds its own
 * connection through the PrismaPg driver adapter at runtime. This is for the CLI.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
});
