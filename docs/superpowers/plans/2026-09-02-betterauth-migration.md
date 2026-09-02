# BetterAuth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace NextAuth v4 with BetterAuth 1.7.2 and add Microsoft OAuth alongside Google, without changing `lib/auth.ts`'s public surface.

**Architecture:** `lib/auth-config.ts` holds the `betterAuth()` instance and the email-domain policy. `lib/auth.ts` keeps its exact existing exports and re-implements `getSession()` on top of `auth.api.getSession()`, normalising BetterAuth's `{ session, user }` down to the `{ user: SessionUser }` shape every caller already expects, and re-reading `role` and `currentImpersonationMode` from Postgres on each call. Because that surface holds still, the twelve API routes that match the literal string `'Authentication required'` need no edit.

**Tech Stack:** Next.js 16.3.1, React 19.2.8, TypeScript strict, Prisma 7.9.1 + PostgreSQL, better-auth 1.7.2, Vitest 4.1.11, Biome 2.5.9.

**Spec:** `docs/superpowers/specs/2026-09-02-betterauth-migration-design.md`

## Global Constraints

- `better-auth` is pinned to **1.7.2**. Do not use `@better-auth/cli` (published only at 1.4.21, a version behind); the schema ground truth is `getAuthTables()` from `better-auth/db`.
- `requireAuth()` MUST throw an `Error` whose message is exactly `'Authentication required'`. Twelve routes match this literal to return 401.
- `lib/auth.ts` MUST keep exporting `getSession`, `requireAuth`, `getEffectiveDocumentFilter`, `getDocumentWriteFilter`, `canPerformAdminActions`, and the type `SessionUser`. Only `requireAdmin` is removed.
- `lib/auth.test.ts` MUST NOT be modified. It is the regression guard for the three filter functions.
- `session.user.id` MUST come from the `users` row and MUST NOT vary with `currentImpersonationMode`.
- Existing `users.id` values MUST be preserved. Six tables carry FKs to them.
- `PROGRAM_NAME` in `lib/sms-program.ts` MUST stay `'Bindery'`. Do not touch that file.
- `ALLOWED_EMAIL_DOMAINS` = `['nutrient.io', 'pspdfkit.com']`.
- Existing Google account rows backfill to `issuer = 'https://accounts.google.com'` exactly.
- No `any` types, no type assertions without justification, no `@ts-ignore`. `type` over `interface`. Options objects over positional params. Files `kebab-case.ts`.
- Every task ends green on `pnpm test` and `pnpm typecheck`, and `biome check --write` is run before each commit.
- Baseline to preserve: **28 test files, 318 tests passing.**

---

## File Structure

| File | Responsibility |
| --- | --- |
| `lib/auth-config.ts` | The `betterAuth()` instance; `ALLOWED_EMAIL_DOMAINS`; `isAllowedEmailDomain()` |
| `lib/auth.ts` | Session access and document-filter policy. Public surface frozen. |
| `lib/auth-client.ts` | Browser client: `signIn`, `signOut`, `useSession` |
| `app/api/auth/[...all]/route.ts` | BetterAuth HTTP handler |
| `prisma/schema.prisma` | `User`, `Session`, `Account`, `Verification` reshaped |
| `app/auth/signin/page.tsx` | Google + Microsoft buttons |
| `components/document-list.tsx` | Consumes `useSession` from the new client |
| `app/api/user/impersonation/route.ts` | 401 house pattern |

Deleted: `app/api/auth/[...nextauth]/route.ts`, `components/providers/session-provider.tsx`, `types/next-auth.d.ts`.

---

## Task 1: Dependencies and Prisma schema

**Files:**
- Modify: `package.json` (add `better-auth`, remove `next-auth`, `@next-auth/prisma-adapter`)
- Modify: `prisma/schema.prisma:16-80`
- Create: `prisma/migrations/<timestamp>_betterauth/migration.sql`

**Interfaces:**
- Consumes: nothing
- Produces: Prisma models `User`, `Session`, `Account`, `Verification` with BetterAuth-compatible fields; `prisma.verification` accessor

- [ ] **Step 1: Add better-auth, remove next-auth**

```bash
pnpm add better-auth@1.7.2
pnpm remove next-auth @next-auth/prisma-adapter
```

- [ ] **Step 2: Rewrite the four auth models in `prisma/schema.prisma`**

Replace the block from `// NextAuth.js required models` through `model VerificationToken { ... }` with:

```prisma
// BetterAuth required models.
//
// Table names are kept from the NextAuth era via @@map so no table rename is
// needed. BetterAuth addresses models by its own names (user/session/account/
// verification), which the Prisma adapter maps to these Prisma model names;
// usePlural stays at its default of false.
model Account {
  id                    String    @id @default(cuid())
  userId                String    @map("user_id")
  issuer                String
  accountId             String    @map("account_id")
  providerId            String    @map("provider_id")
  accessToken           String?   @db.Text @map("access_token")
  refreshToken          String?   @db.Text @map("refresh_token")
  idToken               String?   @db.Text @map("id_token")
  accessTokenExpiresAt  DateTime? @map("access_token_expires_at")
  refreshTokenExpiresAt DateTime? @map("refresh_token_expires_at")
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([issuer, accountId])
  @@index([userId])
  @@map("accounts")
}

model Session {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String   @map("user_id")
  expiresAt DateTime @map("expires_at")
  ipAddress String?  @map("ip_address")
  userAgent String?  @map("user_agent")
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("sessions")
}

model User {
  id                       String              @id @default(cuid())
  email                    String              @unique
  name                     String
  image                    String?
  emailVerified            Boolean             @default(false) @map("email_verified")
  role                     UserRole            @default(USER)
  currentImpersonationMode ImpersonationMode   @default(SELF) @map("current_impersonation_mode")
  phone                    String?             @unique
  phoneVerifiedAt          DateTime?           @map("phone_verified_at")
  smsOptedOutAt            DateTime?           @map("sms_opted_out_at")
  notificationChannel      NotificationChannel @default(EMAIL) @map("notification_channel")
  createdAt                DateTime            @default(now()) @map("created_at")
  updatedAt                DateTime            @updatedAt @map("updated_at")

  accounts  Account[]
  sessions  Session[]
  documents Document[]

  mentions          CommentMention[]
  replyTokens       ThreadReplyToken[]
  documentShares    DocumentShare[]
  phoneVerification PhoneVerification?

  @@map("users")
}

model Verification {
  id         String   @id @default(cuid())
  identifier String
  value      String
  expiresAt  DateTime @map("expires_at")
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  @@index([identifier])
  @@map("verification")
}
```

Note the three changes to `User`: `name` becomes non-null, `emailVerified` becomes `Boolean`, and the `@@map`s are unchanged. Every application column is untouched.

- [ ] **Step 3: Generate the migration without applying it**

```bash
pnpm prisma migrate dev --create-only --name betterauth
```

Answer any interactive warning prompt rather than falling back to bare `migrate dev` — bare `migrate dev` can offer to reset the database.

- [ ] **Step 4: Rewrite the generated SQL to preserve data**

Prisma generates destructive `DROP COLUMN` / `ADD COLUMN` pairs for renames, which would discard every existing account. Replace the generated file's contents with this, which preserves user IDs and account linkage:

```sql
-- users.email_verified: DateTime? -> Boolean
ALTER TABLE "users" ADD COLUMN "email_verified_bool" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "email_verified_bool" = ("email_verified" IS NOT NULL);
ALTER TABLE "users" DROP COLUMN "email_verified";
ALTER TABLE "users" RENAME COLUMN "email_verified_bool" TO "email_verified";

-- users.name: nullable -> NOT NULL. Backfill from the email local-part.
UPDATE "users" SET "name" = split_part("email", '@', 1)
  WHERE "name" IS NULL OR btrim("name") = '';
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

-- accounts: rename identity columns
ALTER TABLE "accounts" RENAME COLUMN "provider_account_id" TO "account_id";
ALTER TABLE "accounts" RENAME COLUMN "provider" TO "provider_id";

-- accounts.issuer is new and required. Google declares a literal issuer;
-- anything else falls back to BetterAuth's synthetic OAuth issuer form.
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;
UPDATE "accounts" SET "issuer" = 'https://accounts.google.com'
  WHERE "provider_id" = 'google';
UPDATE "accounts" SET "issuer" = 'local:oauth:' || "provider_id"
  WHERE "issuer" IS NULL;
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;

-- accounts: expires_at (unix seconds, Int) -> access_token_expires_at (timestamp)
ALTER TABLE "accounts" ADD COLUMN "access_token_expires_at" TIMESTAMP(3);
UPDATE "accounts"
  SET "access_token_expires_at" = to_timestamp("expires_at")::timestamp(3)
  WHERE "expires_at" IS NOT NULL;
ALTER TABLE "accounts" DROP COLUMN "expires_at";

-- accounts: new columns BetterAuth requires
ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN "password" TEXT;
ALTER TABLE "accounts" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "accounts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- accounts: drop NextAuth-only columns
ALTER TABLE "accounts" DROP COLUMN "type";
ALTER TABLE "accounts" DROP COLUMN "session_state";

-- accounts: reindex on the new identity
DROP INDEX IF EXISTS "accounts_provider_provider_account_id_key";
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- sessions: disposable state. Everyone signs in once more.
TRUNCATE TABLE "sessions";
ALTER TABLE "sessions" RENAME COLUMN "session_token" TO "token";
ALTER TABLE "sessions" RENAME COLUMN "expires" TO "expires_at";
ALTER TABLE "sessions" ADD COLUMN "ip_address" TEXT;
ALTER TABLE "sessions" ADD COLUMN "user_agent" TEXT;
ALTER TABLE "sessions" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "sessions" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
DROP INDEX IF EXISTS "sessions_session_token_key";
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- verification: replaces verification_tokens, which was never used
-- (no email/password or magic-link provider is configured).
DROP TABLE IF EXISTS "verification_tokens";
CREATE TABLE "verification" (
  "id"         TEXT NOT NULL,
  "identifier" TEXT NOT NULL,
  "value"      TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
```

- [ ] **Step 5: Apply the migration and regenerate the client**

```bash
pnpm prisma migrate deploy
pnpm prisma generate
```

- [ ] **Step 6: Verify the schema round-trips and nothing regressed**

```bash
pnpm prisma migrate status
pnpm typecheck
```

Expected: `migrate status` reports no pending migrations. `typecheck` will FAIL at this point, on the NextAuth imports in `lib/auth-config.ts`, `lib/auth.ts`, `types/next-auth.d.ts`, `global.d.ts`, `app/api/auth/[...nextauth]/route.ts`, `components/providers/session-provider.tsx`, `app/auth/signin/page.tsx`, `components/document-list.tsx`. That is expected and is fixed by Tasks 2–6.

- [ ] **Step 7: Commit**

```bash
biome check --write prisma/ || true
git add package.json pnpm-lock.yaml prisma/schema.prisma prisma/migrations
git commit -m "feat: reshape the auth tables for BetterAuth, preserving user IDs

Renames the session and account identity columns, converts users.email_verified
from a nullable timestamp to a boolean, and makes users.name non-null, all
without touching users.id — six tables carry foreign keys to it.

The accounts rows are migrated rather than dropped. BetterAuth 1.7.2 requires an
issuer column alongside accountId and providerId, and Google declares a literal
accountIssuer of https://accounts.google.com. Backfilling that exact string is
what keeps an existing Google identity resolving to the same user instead of
falling through to linking-by-email and silently gaining a duplicate row.

Sessions are truncated; everyone signs in once more."
```

---

## Task 2: The BetterAuth instance and the domain policy

**Files:**
- Modify: `lib/auth-config.ts` (full rewrite)
- Create: `lib/auth-config.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/prisma`
- Produces:
  - `export const auth` — the BetterAuth instance, with `auth.api.getSession({ headers })` and `auth.handler`
  - `export const ALLOWED_EMAIL_DOMAINS: readonly ['nutrient.io', 'pspdfkit.com']`
  - `export function isAllowedEmailDomain(email: string | null | undefined): boolean`

- [ ] **Step 1: Write the failing test**

Create `lib/auth-config.test.ts`:

```ts
// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmailDomain } from '@/lib/auth-config';

describe('Who is allowed to sign in', () => {
  it('admits a Nutrient address', () => {
    expect(isAllowedEmailDomain('jon.addams@nutrient.io')).toBe(true);
  });

  it('admits a legacy PSPDFKit address', () => {
    expect(isAllowedEmailDomain('someone@pspdfkit.com')).toBe(true);
  });

  it('refuses an unrelated domain', () => {
    expect(isAllowedEmailDomain('someone@gmail.com')).toBe(false);
  });

  it('refuses a domain that merely ends with an allowed one', () => {
    // A suffix check rather than an exact match would admit this.
    expect(isAllowedEmailDomain('attacker@notnutrient.io')).toBe(false);
    expect(isAllowedEmailDomain('attacker@nutrient.io.example.com')).toBe(false);
  });

  it('refuses a subdomain that was never on the list', () => {
    expect(isAllowedEmailDomain('someone@mail.nutrient.io')).toBe(false);
  });

  it('is case-insensitive about the domain', () => {
    expect(isAllowedEmailDomain('Someone@NUTRIENT.IO')).toBe(true);
  });

  it('refuses a missing, empty or malformed address', () => {
    expect(isAllowedEmailDomain(null)).toBe(false);
    expect(isAllowedEmailDomain(undefined)).toBe(false);
    expect(isAllowedEmailDomain('')).toBe(false);
    expect(isAllowedEmailDomain('no-at-sign')).toBe(false);
    expect(isAllowedEmailDomain('trailing@')).toBe(false);
  });

  it('uses the last @ so an address cannot smuggle a domain in the local part', () => {
    expect(isAllowedEmailDomain('nutrient.io@gmail.com')).toBe(false);
    expect(isAllowedEmailDomain('foo@bar@nutrient.io')).toBe(true);
  });

  it('publishes exactly the two domains the app admits', () => {
    expect(ALLOWED_EMAIL_DOMAINS).toEqual(['nutrient.io', 'pspdfkit.com']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/auth-config.test.ts`
Expected: FAIL — `isAllowedEmailDomain` is not exported from `@/lib/auth-config`.

- [ ] **Step 3: Write the implementation**

Replace `lib/auth-config.ts` entirely:

```ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './prisma';

/**
 * The only email domains that may sign in. Both providers are gated on this.
 */
export const ALLOWED_EMAIL_DOMAINS = ['nutrient.io', 'pspdfkit.com'] as const;

/**
 * Whether an address belongs to a domain the app admits.
 *
 * The domain is compared for equality, not by suffix: a suffix test would admit
 * `notnutrient.io`. The split is on the **last** `@`, so a local part cannot
 * smuggle an allowed domain past the check.
 */
export function isAllowedEmailDomain(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  const separator = email.lastIndexOf('@');
  if (separator === -1) {
    return false;
  }

  const domain = email.slice(separator + 1).toLowerCase();

  return ALLOWED_EMAIL_DOMAINS.some((allowed) => allowed === domain);
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    },
    microsoft: {
      clientId: process.env.MICROSOFT_CLIENT_ID || '',
      clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
      // Single-tenant. With a real tenant GUID the provider also pins
      // expected-issuer validation, which the 'common' scope cannot do.
      tenantId: process.env.MICROSOFT_TENANT_ID || '',
      prompt: 'select_account',
    },
  },
  account: {
    accountLinking: {
      // One person who signs in with Google and later with Microsoft is one
      // user. Two rows would split document ownership and misattribute
      // comments, since DWS records the session user ID as the comment author.
      enabled: true,
      trustedProviders: ['google', 'microsoft'],
    },
  },
  user: {
    additionalFields: {
      // Declared so BetterAuth's types and the inferred client know about them.
      // getSession() in lib/auth.ts overwrites both from a fresh database read;
      // see the note there for why.
      role: { type: 'string', required: false, input: false },
      currentImpersonationMode: { type: 'string', required: false, input: false },
    },
    /**
     * The port of NextAuth's `signIn` callback. This fires on `create-user`,
     * `link-account` and `sign-in`, so a rejected domain cannot get in by
     * linking to an existing account or by having its provider identity move
     * out of bounds after sign-up.
     */
    validateUserInfo: ({ user }) => {
      if (isAllowedEmailDomain(user.email)) {
        return;
      }

      return {
        error: 'email_not_allowed',
        errorDescription: 'Sign in with your Nutrient account.',
      };
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run lib/auth-config.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
biome check --write lib/auth-config.ts lib/auth-config.test.ts
git add lib/auth-config.ts lib/auth-config.test.ts
git commit -m "feat: configure BetterAuth with Google and single-tenant Microsoft

Ports the NextAuth signIn domain callback to user.validateUserInfo, which fires
on create-user, link-account and sign-in — so a disallowed domain cannot get in
by linking to an existing account, which a databaseHooks create hook would have
let through.

The domain check compares for equality on the segment after the last @. A suffix
test would have admitted notnutrient.io, and splitting on the first @ would have
let a local part smuggle an allowed domain past the check. Both are covered."
```

---

## Task 3: Re-implement `getSession` while freezing the public surface

**Files:**
- Modify: `lib/auth.ts:1-45` (imports, `getSession`, `requireAuth`; delete `requireAdmin`)
- Create: `lib/auth-session.test.ts`
- Do NOT modify: `lib/auth.test.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth-config`; `prisma` from `@/lib/prisma`
- Produces:
  - `getSession(): Promise<{ user: SessionUser } | null>`
  - `requireAuth(): Promise<{ user: SessionUser }>` — throws `Error('Authentication required')`
  - `SessionUser`, `getEffectiveDocumentFilter`, `getDocumentWriteFilter`, `canPerformAdminActions` unchanged

- [ ] **Step 1: Write the failing test**

Create `lib/auth-session.test.ts`:

```ts
// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSessionFromBetterAuth = vi.fn();
const findUnique = vi.fn();

vi.mock('@/lib/auth-config', () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSessionFromBetterAuth(...args) } },
}));

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: (...args: unknown[]) => findUnique(...args) } },
}));

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers({ cookie: 'better-auth.session_token=t' })),
}));

const { getSession, requireAuth } = await import('@/lib/auth');

beforeEach(() => {
  getSessionFromBetterAuth.mockReset();
  findUnique.mockReset();
});

describe('Reading the current session', () => {
  it('reports no session when BetterAuth has none', async () => {
    getSessionFromBetterAuth.mockResolvedValue(null);

    expect(await getSession()).toBeNull();
  });

  it('exposes the signed-in person under the shape callers expect', async () => {
    getSessionFromBetterAuth.mockResolvedValue({
      session: { id: 'sess_1', userId: 'user_alice' },
      user: { id: 'user_alice', email: 'alice@nutrient.io', name: 'Alice', image: null },
    });
    findUnique.mockResolvedValue({
      id: 'user_alice',
      role: 'USER',
      currentImpersonationMode: 'SELF',
    });

    const session = await getSession();

    expect(session).toEqual({
      user: {
        id: 'user_alice',
        email: 'alice@nutrient.io',
        name: 'Alice',
        image: null,
        role: 'USER',
        currentImpersonationMode: 'SELF',
      },
    });
  });

  it('reports no session when the user row has gone away', async () => {
    getSessionFromBetterAuth.mockResolvedValue({
      session: { id: 'sess_1', userId: 'user_ghost' },
      user: { id: 'user_ghost', email: 'ghost@nutrient.io', name: 'Ghost', image: null },
    });
    findUnique.mockResolvedValue(null);

    expect(await getSession()).toBeNull();
  });
});

describe('Role and impersonation mode are read fresh, not cached', () => {
  it('prefers the current database row over whatever the session carried', async () => {
    // The role switcher writes to the users row. A session-cached value would
    // make it appear to do nothing until the next sign-in.
    getSessionFromBetterAuth.mockResolvedValue({
      session: { id: 'sess_1', userId: 'user_admin' },
      user: {
        id: 'user_admin',
        email: 'admin@nutrient.io',
        name: 'Admin',
        image: null,
        role: 'USER',
        currentImpersonationMode: 'SELF',
      },
    });
    findUnique.mockResolvedValue({
      id: 'user_admin',
      role: 'ADMIN',
      currentImpersonationMode: 'ADMIN',
    });

    const session = await getSession();

    expect(session?.user.role).toBe('ADMIN');
    expect(session?.user.currentImpersonationMode).toBe('ADMIN');
  });
});

describe('Impersonation never changes who you are', () => {
  it('keeps the signed-in account id whatever the impersonation mode says', async () => {
    // Comment attribution rides on this id: DWS records it as the comment
    // author. An admin impersonating a user must still post as themselves.
    for (const mode of ['SELF', 'ADMIN', 'USER'] as const) {
      getSessionFromBetterAuth.mockResolvedValue({
        session: { id: 'sess_1', userId: 'admin_real' },
        user: { id: 'admin_real', email: 'admin@nutrient.io', name: 'Admin', image: null },
      });
      findUnique.mockResolvedValue({
        id: 'admin_real',
        role: 'ADMIN',
        currentImpersonationMode: mode,
      });

      const session = await getSession();

      expect(session?.user.id).toBe('admin_real');
      expect(session?.user.email).toBe('admin@nutrient.io');
    }
  });
});

describe('Requiring a session', () => {
  it('throws the exact message twelve API routes match to return 401', async () => {
    getSessionFromBetterAuth.mockResolvedValue(null);

    // The literal string is load-bearing: app/api/**/route.ts compares
    // error.message to it and maps that to a 401. Changing it turns every
    // unauthenticated request into a 500. Assert the exact message, not a
    // substring, and assert the thrown value is a real Error — the route
    // guards on `error instanceof Error` before reading `.message`.
    const thrown = await requireAuth().then(
      () => null,
      (error: unknown) => error
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe('Authentication required');
  });

  it('returns the session when there is one', async () => {
    getSessionFromBetterAuth.mockResolvedValue({
      session: { id: 'sess_1', userId: 'user_bob' },
      user: { id: 'user_bob', email: 'bob@nutrient.io', name: 'Bob', image: null },
    });
    findUnique.mockResolvedValue({
      id: 'user_bob',
      role: 'USER',
      currentImpersonationMode: 'SELF',
    });

    const session = await requireAuth();

    expect(session.user.id).toBe('user_bob');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run lib/auth-session.test.ts`
Expected: FAIL — `lib/auth.ts` still imports `next-auth/next`, which is no longer installed.

- [ ] **Step 3: Write the implementation**

Replace `lib/auth.ts` lines 1–45 (imports through the end of `requireAdmin`) with the following. **Leave everything from `getEffectiveDocumentFilter` onward exactly as it is.**

```ts
import type { ImpersonationMode, Prisma, UserRole } from '@prisma/client';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth-config';
import { prisma } from '@/lib/prisma';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role?: UserRole;
  currentImpersonationMode?: ImpersonationMode;
};

/**
 * The current session, or null.
 *
 * BetterAuth returns `{ session, user }`; every caller here wants `{ user }`,
 * so the shape is normalised rather than passed through.
 *
 * `role` and `currentImpersonationMode` are read from the `users` row on every
 * call rather than taken from the session record. That is deliberate: the admin
 * role switcher writes to that row, and a session-cached value would make it
 * appear to do nothing until the next sign-in.
 *
 * `id` always comes from the signed-in account's own row and is never derived
 * from `currentImpersonationMode`. Impersonation widens document visibility; it
 * does not change who you are. DWS records this id as a comment's author, so
 * conflating the two would post comments as someone else.
 */
export async function getSession(): Promise<{ user: SessionUser } | null> {
  const betterAuthSession = await auth.api.getSession({ headers: await headers() });

  if (!betterAuthSession?.user?.id) {
    return null;
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: betterAuthSession.user.id },
    select: {
      id: true,
      email: true,
      name: true,
      image: true,
      role: true,
      currentImpersonationMode: true,
    },
  });

  if (!dbUser) {
    return null;
  }

  return {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      image: dbUser.image,
      role: dbUser.role,
      currentImpersonationMode: dbUser.currentImpersonationMode,
    },
  };
}

/**
 * Validates that a user session exists and returns the session.
 * Throws an error if no valid session is found.
 * Use this in API routes and server components to ensure authentication.
 *
 * The thrown message is matched literally by every route under `app/api/` to
 * map this to a 401. Do not reword it.
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  return session;
}
```

- [ ] **Step 4: Run the new test and the untouched regression guard**

Run: `pnpm vitest run lib/auth-session.test.ts lib/auth.test.ts`
Expected: PASS. `lib/auth.test.ts` must pass **without modification** — 14 tests there (7 visibility, 4 write, 3 admin-action), plus the 8 new ones in `lib/auth-session.test.ts`.

- [ ] **Step 5: Commit**

```bash
biome check --write lib/auth.ts lib/auth-session.test.ts
git add lib/auth.ts lib/auth-session.test.ts
git commit -m "feat: read the session through BetterAuth without changing lib/auth's surface

getSession now wraps auth.api.getSession and normalises BetterAuth's
{ session, user } to the { user } shape every caller already used, so the twelve
API routes and the four route tests that mock @/lib/auth need no edit, and
lib/auth.test.ts passes unmodified as a regression guard.

role and currentImpersonationMode stay on a per-request database read rather
than moving to BetterAuth's session-cached additionalFields. The admin role
switcher writes to the users row; a cached value would make it appear to do
nothing until the next sign-in.

Adds direct assertions for the two couplings that fail silently: that the
thrown message is exactly 'Authentication required', and that session.user.id
does not move with currentImpersonationMode.

Removes requireAdmin, which was exported and called from nowhere."
```

---

## Task 4: HTTP handler and browser client

**Files:**
- Create: `app/api/auth/[...all]/route.ts`
- Delete: `app/api/auth/[...nextauth]/route.ts`
- Create: `lib/auth-client.ts`

**Interfaces:**
- Consumes: `auth` from `@/lib/auth-config`
- Produces: `signIn`, `signOut`, `useSession` from `@/lib/auth-client`

- [ ] **Step 1: Create the route handler**

Create `app/api/auth/[...all]/route.ts`:

```ts
import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth-config';

export const { GET, POST } = toNextJsHandler(auth);
```

- [ ] **Step 2: Delete the NextAuth handler**

```bash
git rm -r "app/api/auth/[...nextauth]"
```

- [ ] **Step 3: Create the browser client**

Create `lib/auth-client.ts`:

```ts
'use client';

import { createAuthClient } from 'better-auth/react';
import { inferAdditionalFields } from 'better-auth/client/plugins';
import type { auth } from '@/lib/auth-config';

/**
 * The browser-side auth client.
 *
 * `inferAdditionalFields` carries `role` and `currentImpersonationMode` through
 * to `useSession()` so components do not have to re-declare them. Note that the
 * server's `getSession()` re-reads both from the database, so a client value can
 * lag a role switch by one refetch.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession } = authClient;
```

- [ ] **Step 4: Verify the handler and client typecheck**

Run: `pnpm typecheck`
Expected: remaining failures only in `app/auth/signin/page.tsx`, `components/document-list.tsx`, `components/providers/session-provider.tsx`, `app/layout.tsx`, `types/next-auth.d.ts`, `global.d.ts`. Those are Tasks 5 and 6.

- [ ] **Step 5: Commit**

```bash
biome check --write "app/api/auth/[...all]/route.ts" lib/auth-client.ts
git add "app/api/auth/[...all]/route.ts" lib/auth-client.ts
git commit -m "feat: mount the BetterAuth handler and add the browser client

The catch-all moves from [...nextauth] to [...all]. Google's callback path is
/api/auth/callback/google under both libraries, so no Google Cloud Console
change is needed."
```

---

## Task 5: Sign-in page, document list, layout

**Files:**
- Modify: `app/auth/signin/page.tsx` (full rewrite)
- Modify: `components/document-list.tsx:5,17,71`
- Modify: `app/layout.tsx:5,37-39`
- Delete: `components/providers/session-provider.tsx`
- Create: `app/auth/signin/page.test.tsx`

**Interfaces:**
- Consumes: `signIn`, `useSession` from `@/lib/auth-client`
- Produces: nothing consumed by later tasks

- [ ] **Step 1: Write the failing test**

Create `app/auth/signin/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const social = vi.fn();
const useSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  signIn: { social: (...args: unknown[]) => social(...args) },
  useSession: () => useSession(),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { default: SignIn } = await import('@/app/auth/signin/page');

beforeEach(() => {
  social.mockReset();
  push.mockReset();
  useSession.mockReset().mockReturnValue({ data: null, isPending: false });
});

describe('Signing in', () => {
  it('offers both Google and Microsoft', () => {
    render(<SignIn />);

    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
  });

  it('starts a Google sign-in when the Google button is used', async () => {
    render(<SignIn />);

    await userEvent.click(screen.getByRole('button', { name: /google/i }));

    expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/dashboard' });
  });

  it('starts a Microsoft sign-in when the Microsoft button is used', async () => {
    render(<SignIn />);

    await userEvent.click(screen.getByRole('button', { name: /microsoft/i }));

    expect(social).toHaveBeenCalledWith({ provider: 'microsoft', callbackURL: '/dashboard' });
  });

  it('sends an already-signed-in person to the dashboard', () => {
    useSession.mockReturnValue({ data: { user: { id: 'user_1' } }, isPending: false });

    render(<SignIn />);

    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows nothing actionable while the session is still loading', () => {
    useSession.mockReturnValue({ data: null, isPending: true });

    render(<SignIn />);

    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/auth/signin/page.test.tsx`
Expected: FAIL — the page still imports `next-auth/react` and renders one button.

- [ ] **Step 3: Rewrite the sign-in page**

Replace `app/auth/signin/page.tsx` entirely:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signIn, useSession } from '@/lib/auth-client';

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { id: 'google', label: 'Sign in with Google' },
  { id: 'microsoft', label: 'Sign in with Microsoft' },
] as const;

export default function SignIn() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (session) {
      router.push('/dashboard');
    }
  }, [session, router]);

  if (isPending || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">Nutrient DWS CRUD Application</p>
        </div>
        <div className="space-y-3">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => signIn.social({ provider: provider.id, callbackURL: '/dashboard' })}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {provider.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/auth/signin/page.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Point the document list at the new client**

In `components/document-list.tsx`, change line 5 from:

```ts
import { useSession } from 'next-auth/react';
```

to:

```ts
import { useSession } from '@/lib/auth-client';
```

Change line 17 from:

```ts
  const { data: session, status } = useSession();
```

to:

```ts
  const { data: session, isPending } = useSession();
```

Change line 71 from:

```ts
    if (status === 'loading' || !session?.user) return false;
```

to:

```ts
    if (isPending || !session?.user) return false;
```

Leave line 77 alone — see "Out of scope" below.

- [ ] **Step 6: Drop the session provider**

In `app/layout.tsx`, delete line 5 (`import SessionProvider from '@/components/providers/session-provider';`) and change the body from:

```tsx
        <ThemeProvider>
          <SessionProvider>{children}</SessionProvider>
        </ThemeProvider>
```

to:

```tsx
        <ThemeProvider>{children}</ThemeProvider>
```

Then:

```bash
git rm components/providers/session-provider.tsx
```

- [ ] **Step 7: Verify the whole suite**

Run: `pnpm test`
Expected: PASS. Baseline 318 plus the new tests; no regressions.

- [ ] **Step 8: Commit**

```bash
biome check --write app/auth/signin components/document-list.tsx app/layout.tsx
git add app/auth/signin app/layout.tsx components/document-list.tsx components/providers
git commit -m "feat: offer Microsoft alongside Google on the sign-in page

BetterAuth's client keeps session state in a store rather than React context, so
the SessionProvider wrapper goes away entirely. useSession now reports isPending
rather than a status string.

The sign-in page had no tests; it now has five, covering both providers and the
already-signed-in redirect."
```

---

## Task 6: Retire the NextAuth type augmentation

**Files:**
- Delete: `types/next-auth.d.ts`
- Modify: `global.d.ts:1-23`

**Interfaces:**
- Consumes: nothing
- Produces: `SessionUser` in `lib/auth.ts` as the sole session type

- [ ] **Step 1: Delete the NextAuth-specific declarations**

```bash
git rm types/next-auth.d.ts
```

- [ ] **Step 2: Strip the augmentation from `global.d.ts`**

Delete lines 5–23 — the `// Extend NextAuth types` comment and the whole
`declare module 'next-auth' { ... }` block. Keep line 3's Prisma import only if
`ImpersonationMode` or `UserRole` is still referenced further down the file; if
neither is, delete the import too, because `noUnusedLocals` is on.

Verify what remains references those types:

```bash
grep -n "ImpersonationMode\|UserRole" global.d.ts
```

If that returns nothing after the edit, remove line 3.

- [ ] **Step 3: Verify types and tests**

Run: `pnpm typecheck && pnpm test`
Expected: both PASS. This is the first point at which `typecheck` should be fully clean.

- [ ] **Step 4: Commit**

```bash
biome check --write global.d.ts
git add global.d.ts types
git commit -m "refactor: drop the NextAuth session type augmentation

The session shape was declared twice, in global.d.ts and in the
NextAuth-specific types/next-auth.d.ts. SessionUser in lib/auth.ts is now the
single source of truth. global.d.ts keeps only the Nutrient viewer types."
```

---

## Task 7: Impersonation route returns 401, not 500

**Files:**
- Modify: `app/api/user/impersonation/route.ts:41-43,54-56`
- Create: `app/api/user/impersonation/route.test.ts`

**Interfaces:**
- Consumes: `requireAuth` from `@/lib/auth`
- Produces: nothing

- [ ] **Step 1: Write the failing test**

Create `app/api/user/impersonation/route.test.ts`:

```ts
// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const update = vi.fn();

vi.mock('@/lib/auth', () => ({ requireAuth: (...a: unknown[]) => requireAuth(...a) }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { update: (...a: unknown[]) => update(...a) } },
}));

const { GET, POST } = await import('@/app/api/user/impersonation/route');

const postRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/user/impersonation', {
    method: 'POST',
    body: JSON.stringify(body),
  });

beforeEach(() => {
  requireAuth.mockReset();
  update.mockReset();
});

describe('Impersonation status', () => {
  it('answers 401 when nobody is signed in', async () => {
    // Every other route under app/api/ answers 401 here. This one used to
    // answer 500, which reads as a server fault rather than a missing session.
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('reports the current mode for a signed-in admin', async () => {
    requireAuth.mockResolvedValue({
      user: { id: 'admin_1', role: 'ADMIN', currentImpersonationMode: 'SELF' },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ currentMode: 'SELF', canImpersonate: true });
  });
});

describe('Changing impersonation mode', () => {
  it('answers 401 when nobody is signed in', async () => {
    requireAuth.mockRejectedValue(new Error('Authentication required'));

    const response = await POST(postRequest({ mode: 'USER' }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
  });

  it('refuses a non-admin with 403', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'user_1', role: 'USER' } });

    const response = await POST(postRequest({ mode: 'USER' }));

    expect(response.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects a mode that is not offered', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } });

    const response = await POST(postRequest({ mode: 'SUPERUSER' }));

    expect(response.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it('records a valid mode against the signed-in admin', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } });
    update.mockResolvedValue({
      id: 'admin_1',
      role: 'ADMIN',
      currentImpersonationMode: 'USER',
    });

    const response = await POST(postRequest({ mode: 'USER' }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'admin_1' } })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run app/api/user/impersonation/route.test.ts`
Expected: FAIL on both 401 tests — the route currently answers 500.

- [ ] **Step 3: Adopt the 401 house pattern**

In `app/api/user/impersonation/route.ts`, replace the `POST` catch (lines 41–43):

```ts
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to update impersonation mode' }, { status: 500 });
  }
```

and the `GET` catch (lines 54–56):

```ts
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Failed to fetch impersonation status' }, { status: 500 });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run app/api/user/impersonation/route.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
biome check --write app/api/user/impersonation
git add app/api/user/impersonation
git commit -m "fix: answer 401 for an unauthenticated impersonation request

Both handlers caught every error into a bare 500, so an unauthenticated call
reported a server fault where the other eleven routes report a missing session.
Pre-existing; found by two reviewers during the SMS work and left out of scope
then. The route had no tests, and now has six."
```

---

## Task 8: Environment, documentation, and the full gate

**Files:**
- Modify: `.env.local` (local only, not committed)
- Modify: `.env.production`
- Modify: `CLAUDE.md`
- Modify: `TODO.md`

**Interfaces:**
- Consumes: everything above
- Produces: a green `pnpm pre-commit`

- [ ] **Step 1: Set the local environment**

Add to `.env.local`, reusing the existing `NEXTAUTH_SECRET` value for
`BETTER_AUTH_SECRET` so existing sessions are the only thing invalidated:

```bash
BETTER_AUTH_SECRET=<the current NEXTAUTH_SECRET value>
BETTER_AUTH_URL=http://localhost:3000
MICROSOFT_CLIENT_ID=<from the Entra app registration>
MICROSOFT_CLIENT_SECRET=<from the Entra app registration>
MICROSOFT_TENANT_ID=<the Nutrient tenant GUID>
```

Then remove `NEXTAUTH_URL` and `NEXTAUTH_SECRET`.

If the Microsoft values are not yet available, leave them empty. BetterAuth logs
`Social provider microsoft is missing clientId or clientSecret` and the Microsoft
button fails at the provider; Google is unaffected and every test still passes.

- [ ] **Step 2: Record the environment change in `CLAUDE.md`**

Add a section after the "SMS notifications (Twilio)" block:

```markdown
## Authentication (BetterAuth)

- **`lib/auth.ts`'s public surface is deliberately frozen.** Twelve routes under
  `app/api/` catch the error `requireAuth()` throws and compare
  `error.message === 'Authentication required'` **literally** to map it to a 401.
  Reword that string and every unauthenticated request becomes a 500. There is
  no `requireAdmin` any more — it was exported and called from nowhere.
- **`getSession()` re-reads `role` and `currentImpersonationMode` from Postgres
  on every call**, rather than using BetterAuth's session-cached
  `user.additionalFields`. The admin role switcher writes to the `users` row; a
  cached value makes the switcher appear to do nothing until the next sign-in.
  The extra query is the point, not an oversight.
- **`session.user.id` never varies with `currentImpersonationMode`.**
  Impersonation widens document *visibility* only. DWS records this id as a
  comment's author, so conflating the two would post comments as someone else
  and bind an admin's phone to another account. Asserted in
  `lib/auth-session.test.ts`.
- **`account.issuer` is required in BetterAuth 1.7.2** alongside `accountId` and
  `providerId`. Google declares a literal `accountIssuer` of
  `https://accounts.google.com`; Microsoft resolves its own from `profile.iss`.
  BetterAuth's synthetic `local:oauth:<id>` form applies only to providers that
  declare neither, so it is **not** what either of ours uses. The migration
  backfills the Google literal; getting it wrong makes an existing row stop
  matching at sign-in, fall through to linking-by-email, and quietly gain a
  duplicate account row.
- **`@better-auth/cli` lags the library** (1.4.21 against 1.7.2), so it is not
  the schema source. Read the truth from the installed package instead:
  `getAuthTables()` exported from `better-auth/db` is what the runtime itself
  uses.
- **The domain allowlist lives in `user.validateUserInfo`**, not a
  `databaseHooks.user.create.before` hook. `validateUserInfo` fires on
  `create-user`, `link-account` **and** `sign-in`; the create hook would guard
  only first sign-up and let a linking flow through. The predicate compares the
  segment after the **last** `@` for equality — a suffix test would admit
  `notnutrient.io`.
- **Account linking is on for Google and Microsoft** (`trustedProviders`). One
  person with both providers must be one user row, or document ownership splits
  and comments are misattributed.
- **Microsoft is single-tenant** via `MICROSOFT_TENANT_ID`. With a real tenant
  GUID the provider also pins expected-issuer validation, which `common` cannot
  do. The Entra redirect URI is `/api/auth/callback/microsoft`.
- **Google's callback path is unchanged** from the NextAuth era
  (`/api/auth/callback/google`), so no Google Cloud Console edit was needed.
- **`betterAuth()` constructs lazily.** It warns but does not throw with no
  secret, URL, or database, which is why `lib/auth.test.ts` imports cleanly with
  no auth environment set and needs no `vitest.setup.ts` shims.
```

- [ ] **Step 3: Update `TODO.md`**

Under "Authentication & Authorization", replace the NextAuth line:

```markdown
- ✅ BetterAuth with Google and Microsoft OAuth (single-tenant Entra)
```

- [ ] **Step 4: Run the full gate**

```bash
pnpm pre-commit
```

Expected: `biome check --write` clean, `typecheck` clean, all tests pass
(318 baseline + roughly 25 new), `build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md TODO.md .env.production
git commit -m "docs: record the BetterAuth migration's traps

Captures what would have saved time at the start: that lib/auth.ts's error
string is load-bearing across twelve routes, that the per-request database read
for impersonation mode is deliberate, that account.issuer is required in 1.7.2
and neither of our providers uses the synthetic local:oauth: form, and that the
published CLI lags the library so getAuthTables() is the schema source."
```

- [ ] **Step 6: Push and offer the PR**

```bash
git push -u origin worktree-betterauth-microsoft
```

Do **not** open the PR. Offer it.

---

## Out of scope

Two things found during planning that this plan deliberately does not change.

**A pre-existing impersonation-mode inconsistency.** `ImpersonationMode` has
three values (`SELF`, `ADMIN`, `USER`) and defaults to `SELF`.
`getEffectiveDocumentFilter` grants an admin everything when the mode is
anything other than `SELF`. But `app/api/user/impersonation/route.ts` only
accepts `['SELF', 'USER']`, so `ADMIN` is unreachable through the API, and
selecting `USER` — the mode whose label implies *narrower* access — is what
grants an admin every document. Meanwhile `components/document-list.tsx:77`
gates delete buttons on `currentImpersonationMode === 'ADMIN'`, a value the API
can never set, so that branch is dead. The behaviour is pinned by
`lib/auth.test.ts`, which this plan must not modify. Changing it is a separate
PR with its own decision about what the two modes should mean.

**The project rename.** `package.json` says `decrud` and `app/layout.tsx` says
`'Nutrient API CRUD App'`, while the app is publicly branded Bindery. That rides
with the restyle, which is the next piece of work and touches the same pages.
`PROGRAM_NAME` in `lib/sms-program.ts` must stay `'Bindery'` regardless — it is
filed with the A2P campaign.
