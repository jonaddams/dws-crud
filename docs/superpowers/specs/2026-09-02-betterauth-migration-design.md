# Replacing NextAuth v4 with BetterAuth, adding Microsoft OAuth

Design approved 2026-09-02. Supersedes the planning notes that described this as
"the next session's work".

## Why

Two reasons, in order:

1. NextAuth v4 with the Prisma adapter is the last piece of the stack still on a
   v4-era API, and it is the thing every protected route funnels through.
2. Prospects are demoed on this app. Some of them are Microsoft shops, and
   "sign in with Google" is the only door.

BetterAuth is chosen over NextAuth v5 because the provider surface is plainer
(no `authOptions` object threaded through a `getServerSession` call), the Prisma
adapter is first-party rather than a separate package, and per-request session
shaping is a supported concept rather than a callback that fires at a moment you
have to reason about.

## The governing constraint

**`lib/auth.ts`'s public surface does not change.**

It exports `getSession`, `requireAuth`, `getEffectiveDocumentFilter`,
`getDocumentWriteFilter`, `canPerformAdminActions` and the `SessionUser` type.
After this work it exports exactly the same five functions and the same type,
with the same signatures, and `requireAuth` still throws an `Error` whose
message is the literal string `'Authentication required'`.

This is not stylistic. Twelve files under `app/api/` catch that error and match
the message **literally** to map it to a 401:

```ts
if (error instanceof Error && error.message === 'Authentication required') {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}
```

If the string changes and a catch block is missed, that route silently degrades
from 401 to 500. Holding the surface still means the twelve routes need no edit,
`lib/auth.test.ts` needs no edit, and the four route test files that
`vi.mock('@/lib/auth')` need no edit. The blast radius is nine files, not thirty.

The one intentional removal: `requireAdmin` is exported and called from nowhere.
It and its unmatched `'Admin access required'` string are deleted.

## The two failure modes that do not announce themselves

Both were identified before implementation started. Both get direct assertions,
because neither produces an error when it breaks.

### Comment attribution rides on `session.user.id`

The DWS session JWT carries `user_id`, which is how an emailed or texted reply
is attributed to a named person instead of rendering as "Anonymous". If user IDs
change shape, or the session stops populating `id` from the `users` row,
comments keep being written and are simply attributed to the wrong person.
Nothing throws.

Mitigation: user IDs are preserved by the migration (see below), and `id` is
still read from the `users` row on every `getSession()` call.

### Impersonation must widen visibility without touching identity

`currentImpersonationMode` exists to widen *document visibility* filters for an
admin. It must never change who the session says you are. Verified during the
SMS work: an admin impersonating a user still registers their own phone. If a
migration wired impersonation into session identity, an admin would bind their
phone to another account and post comments as them.

Mitigation: `id` is set from the signed-in account's own row and is never derived
from `currentImpersonationMode`. Asserted directly in tests.

### Consequence: keep the per-request database read

Today `role` and `currentImpersonationMode` are re-read from Postgres on every
`getSession()` call. BetterAuth offers `user.additionalFields`, which would carry
them on the session record instead — fewer queries, and the obvious-looking
choice.

**Rejected deliberately.** A session-cached `currentImpersonationMode` means the
admin role switcher appears to do nothing until the user logs out and back in.
The switcher writes to the `users` row; a cached session would not see it. The
per-request `findUnique` is the behaviour the feature depends on, so it stays.

`role` and `currentImpersonationMode` are still declared as
`user.additionalFields` so BetterAuth's types and the inferred client know about
them, but `getSession()` overwrites both from the fresh row. Where the two
disagree, the fresh row wins.

## Providers and sign-in policy

| Decision | Choice |
| --- | --- |
| Microsoft tenant scope | Single-tenant, `tenantId: process.env.MICROSOFT_TENANT_ID` |
| Same email via both providers | Link to one user |
| Email domain allowlist | Kept, enforced on both providers |

**Single-tenant** means Microsoft refuses non-tenant accounts before our code
runs, which is a stronger gate than checking a domain after the fact. It costs a
tenant GUID in the environment.

**Account linking** is `accountLinking.enabled` with
`trustedProviders: ['google', 'microsoft']`. Both are verified corporate IdPs for
the allowed domains, so implicit linking on a matching email is safe. The
alternative — a second user row per provider — would split document ownership and
break comment attribution for the same human, which is precisely the silent
failure above. `allowDifferentEmails` stays off.

**The domain allowlist** (`nutrient.io`, `pspdfkit.com`) is today a NextAuth
`signIn` callback in `lib/auth-config.ts`. It ports to BetterAuth's
`user.validateUserInfo`, which fires on create-user, link-account *and* sign-in
— a truer analog of the NextAuth callback than a `databaseHooks.user.create.before`
hook, which would only guard first sign-up and let a linking flow through.

The predicate is extracted as a named exported pure function so the policy is
testable as behaviour rather than reached through internals:

```ts
export const ALLOWED_EMAIL_DOMAINS = ['nutrient.io', 'pspdfkit.com'] as const;
export function isAllowedEmailDomain(email: string | null | undefined): boolean;
```

Google's callback path is `/api/auth/callback/google` under both libraries, so
**no Google Cloud Console change is required.**

## Files

| File | Change |
| --- | --- |
| `lib/auth-config.ts` | Rewritten: exports `auth = betterAuth({...})`, `isAllowedEmailDomain`, `ALLOWED_EMAIL_DOMAINS` |
| `lib/auth.ts` | `getSession` reimplemented; exports otherwise unchanged; `requireAdmin` deleted |
| `lib/auth-client.ts` | New: `createAuthClient` with `inferAdditionalFields<typeof auth>()` |
| `app/api/auth/[...nextauth]/route.ts` | Replaced by `app/api/auth/[...all]/route.ts` using `toNextJsHandler(auth)` |
| `components/providers/session-provider.tsx` | Deleted — BetterAuth's client needs no React provider |
| `app/layout.tsx` | `<SessionProvider>` wrapper removed |
| `app/auth/signin/page.tsx` | Two provider buttons; `signIn.social`; `useSession` replaces the client `getSession` |
| `components/document-list.tsx` | `useSession()` returns `{ data, isPending }`, not `{ data, status }` |
| `types/next-auth.d.ts` | Deleted |
| `global.d.ts` | `declare module 'next-auth'` block removed; Nutrient viewer types untouched |
| `app/api/user/impersonation/route.ts` | Catch blocks adopt the 401 house pattern |
| `prisma/schema.prisma` | Auth models reshaped; application models untouched |

`SessionUser` in `lib/auth.ts` becomes the single source of truth for session
shape, replacing the augmentation that was duplicated across `global.d.ts` and
`types/next-auth.d.ts`.

## Session shape

BetterAuth's `auth.api.getSession()` returns `{ session, user }`. Callers in this
codebase expect `{ user }` and reach for `session.user.id`. `getSession()`
therefore normalises rather than passing BetterAuth's object through:

```ts
export async function getSession(): Promise<{ user: SessionUser } | null>
```

Returning the raw BetterAuth object would mean editing every call site and its
tests for no behavioural gain.

## Database migration

User IDs are preserved. Six tables carry foreign keys to `users.id`:
`documents`, `document_shares`, `comment_mentions`, `thread_reply_tokens`,
`observed_comments`, `phone_verifications`. Dropping and recreating users would
cascade-delete real documents.

Existing table names (`users`, `sessions`, `accounts`) are kept via `@@map`, so
BetterAuth's singular model naming costs no table rename.

### `users` — kept, two column changes

- `email_verified DateTime?` → `Boolean NOT NULL DEFAULT false`, set `true` where
  the timestamp was non-null. BetterAuth types this field as a boolean.
- `name String?` → `String NOT NULL`. BetterAuth declares `user.name` required,
  so a null row would break inserts. Backfilled from the email local-part where
  null. Both providers always return a name, so this only affects legacy rows.

Application columns (`role`, `current_impersonation_mode`, `phone`,
`phone_verified_at`, `sms_opted_out_at`, `notification_channel`) are untouched.

### `accounts` — migrated in place, not dropped

Column renames plus one type conversion:

| From | To |
| --- | --- |
| `provider_account_id` | `account_id` |
| `provider` | `provider_id` |
| `access_token`, `refresh_token`, `id_token` | same columns, Prisma fields renamed to camelCase |
| `expires_at Int?` | `access_token_expires_at TIMESTAMP`, via `to_timestamp()` |
| — | `created_at`, `updated_at`, `password` (null) added |
| `type`, `session_state` | dropped |

Unique constraint becomes `[provider_id, account_id]`.

**Why migrate rather than drop:** if the rows were dropped, the next Google
sign-in would have to be rescued by account-linking matching on email. That
works, but it makes a correctness property depend on a config flag. Migrating the
rows means the existing Google identity resolves to the same user directly.

### `sessions` — truncated and restructured

`session_token` → `token`, `expires` → `expires_at`, plus `created_at`,
`updated_at`, `ip_address`, `user_agent`. Sessions are disposable state; everyone
signs in once more after deploy. This is the one user-visible cost of the
migration and is accepted.

### `verification_tokens` → `verification`

Reshaped to `id`, `identifier`, `value`, `expires_at`, `created_at`,
`updated_at`. The table is unused in practice — there is no email/password or
magic-link provider — so it is dropped and recreated rather than converted.

### Ground truth for the schema — verified against 1.7.2

The version is pinned at `better-auth@1.7.2`. `@better-auth/cli` is only
published at 1.4.21, so its generator is a version behind the library and was
**not** used. The schema below was read out of the installed package by calling
`getAuthTables()` from `better-auth/db` directly, which is what the runtime
itself uses.

`account` carries **three** identity columns in 1.7.2, not two:

| field | type | notes |
| --- | --- | --- |
| `issuer` | string, required | new in this line; see below |
| `accountId` | string, required | the provider's subject claim |
| `providerId` | string, required | `'google'`, `'microsoft'` |

`issuer` is resolved per provider by `resolveOAuthAccountKey`. A provider may
declare `accountIssuer`; only if it does not does BetterAuth fall back to
`createOAuthAccountIssuer(id)`, which returns `` `local:oauth:${id}` ``. Both
providers here declare one, so the fallback never applies:

| provider | `id` | `accountSubject` | `accountIssuer` |
| --- | --- | --- | --- |
| Google | `google` | `profile.sub` | `"https://accounts.google.com"` (literal) |
| Microsoft | `microsoft` | `profile.oid` | `profile.iss` (dynamic) |

**This is what the `accounts` backfill turns on.** Existing NextAuth rows have no
`issuer`, and their `provider_account_id` holds the Google `sub`. So the backfill
is `issuer = 'https://accounts.google.com'` for every row where
`provider = 'google'`, and `account_id = provider_account_id`. Get the issuer
string wrong and the row does not match at sign-in: BetterAuth treats it as an
unknown account, falls through to linking-by-email, and quietly creates a second
account row. No Microsoft rows exist yet, so nothing to backfill there.

Microsoft's dynamic issuer resolves to `${authority}/${tid}/v2.0`. With a real
tenant GUID the provider additionally pins expected-issuer validation, which is
the concrete reason single-tenant is stronger than a post-hoc domain check.

Migrations are produced with `prisma migrate dev --create-only`, the SQL is
reviewed, then applied with `prisma migrate deploy`. Bare `prisma migrate dev`
can offer to reset the database on drift. `--create-only` may still block on an
interactive confirmation when a migration carries a warning; answer it rather
than falling back.

## Testing

TDD, red first. `signin/page.tsx`, `components/document-list.tsx` and
`app/api/user/impersonation/route.ts` currently have no tests at all.

**Contract tests — these protect the twelve routes**

- `requireAuth` throws an `Error` whose message is exactly `'Authentication required'`
- `getSession()` returns `null` when there is no session
- `getSession()` returns `{ user: { id, email, name, image, role, currentImpersonationMode } }` when there is

**Invariant tests — these guard the silent failures**

- `session.user.id` is the `users` row id and does not vary with
  `currentImpersonationMode`
- `role` and `currentImpersonationMode` reflect the current database row, not a
  value captured at sign-in

**Policy tests**

- `isAllowedEmailDomain`: accepts `nutrient.io` and `pspdfkit.com`, rejects
  `gmail.com`, rejects a lookalike suffix such as `notnutrient.io`, rejects
  null/undefined/empty
- both providers are configured; Microsoft carries a `tenantId` from the
  environment

**Route and UI tests**

- unauthenticated call to the impersonation route answers 401 (currently 500 —
  red before the fix)
- sign-in page renders a Google and a Microsoft button and dispatches the
  matching provider for each

Server-side test files declare `// @vitest-environment node` on the first line.
The existing 27 test files must stay green, with `lib/auth.test.ts` as the
untouched regression guard for the three filter functions — they are pure
functions of `SessionUser` and are unaffected by which library produces it.

The gate is `pnpm pre-commit` (`biome check --write` → `typecheck` → `test` →
`build`). Typecheck, not vitest, is what catches a dropped `@unique`: a bare
`{ field: value }` literal only type-checks against a model's generated
`WhereUniqueInput` when that field actually carries `@unique`/`@id`.

### Module-load-time initialisation — checked, not a problem

`lib/auth.test.ts` imports `@/lib/auth`, which imports `lib/auth-config.ts`,
which calls `betterAuth({...})` at module scope. Had that constructor validated
eagerly, importing the module would throw and a test file exercising three pure
functions would fail for reasons unrelated to them — which would have falsified
the claim that `lib/auth.test.ts` needs no edit.

**Verified against 1.7.2 before planning:** `betterAuth()` constructs lazily. With
no `BETTER_AUTH_SECRET`, no `BETTER_AUTH_URL`, no database and empty provider
credentials it returns a working object with `api.getSession` and `handler`
present, emitting warnings only. So no dummy environment variables are needed in
`vitest.setup.ts` and the containment strategy holds as written.

Should this change on a future upgrade, the fix is dummy auth environment
variables in `vitest.setup.ts` — **not** moving the filter functions to another
module, which would change the import path in every route and forfeit the
containment.

## Environment

Added: `BETTER_AUTH_SECRET` (reuse the existing `NEXTAUTH_SECRET` value),
`BETTER_AUTH_URL`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`,
`MICROSOFT_TENANT_ID`.

Retired: `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.

**Manual step, owner: Jon.** An Entra app registration is required, with redirect
URIs `https://bindery.jonaddams.com/api/auth/callback/microsoft` and
`http://localhost:3000/api/auth/callback/microsoft`, and the three `MICROSOFT_*`
values set locally and in Vercel. Tests reach no network, so implementation and
verification proceed without it; only the live Microsoft round-trip is blocked.

## Out of scope

- **The project rename** (`decrud` → Bindery in `package.json`, the
  `'Nutrient API CRUD App'` title in `app/layout.tsx`). Belongs with the restyle,
  which is the next piece of work and touches the same pages.
- **`PROGRAM_NAME` in `lib/sms-program.ts` stays `'Bindery'`.** It is filed with
  the A2P 10DLC campaign and published on the public `/sms` page. Changing it
  breaks a three-way match a carrier reviewer checks, which is what got the first
  submission rejected.
- The group-based document security model (TODO section 18).
- Client-side search UI and the broader test backlog (TODO sections 16, 17).

## Sequencing

This lands **before** the restyle. Both touch the same pages, and rebasing a
large visual diff over an auth migration is the worse ordering.
