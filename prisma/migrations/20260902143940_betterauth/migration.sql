-- Migrate the NextAuth v4 auth tables to the shape BetterAuth 1.7.2 expects.
--
-- Hand-written rather than generated. `prisma migrate dev` emits DROP COLUMN /
-- ADD COLUMN pairs for what are really renames, which would discard every
-- existing account and force each user to re-link their provider. Renaming in
-- place keeps `users.id` and the account linkage intact; six tables carry
-- foreign keys to `users.id`.
--
-- Table names are unchanged (users, sessions, accounts): the Prisma models are
-- @@map-ed onto them, so nothing here renames a table.

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

-- BetterAuth types emailVerified as a boolean; NextAuth stored a nullable
-- timestamp. A row that carried any timestamp counts as verified.
ALTER TABLE "users" ADD COLUMN "email_verified_bool" BOOLEAN NOT NULL DEFAULT false;
UPDATE "users" SET "email_verified_bool" = ("email_verified" IS NOT NULL);
ALTER TABLE "users" DROP COLUMN "email_verified";
ALTER TABLE "users" RENAME COLUMN "email_verified_bool" TO "email_verified";

-- BetterAuth declares user.name as required. Backfill the few legacy rows that
-- have none from the email local-part; both providers always return a name.
UPDATE "users" SET "name" = split_part("email", '@', 1)
  WHERE "name" IS NULL OR btrim("name") = '';
ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL;

-- ---------------------------------------------------------------------------
-- accounts
-- ---------------------------------------------------------------------------

-- Only the two identity columns are renamed. access_token, refresh_token,
-- id_token and scope already carry the names the new Prisma fields @map to.
ALTER TABLE "accounts" RENAME COLUMN "provider_account_id" TO "account_id";
ALTER TABLE "accounts" RENAME COLUMN "provider" TO "provider_id";

-- `issuer` is new in this BetterAuth line and is part of an account's identity.
-- Google declares the literal issuer below; a provider that declares none would
-- fall back to BetterAuth's synthetic 'local:oauth:<id>' form, which is what the
-- second statement covers. Getting this string wrong makes the row fail to match
-- at sign-in: BetterAuth would treat the account as unknown, fall through to
-- linking-by-email, and silently create a duplicate account row.
ALTER TABLE "accounts" ADD COLUMN "issuer" TEXT;
UPDATE "accounts" SET "issuer" = 'https://accounts.google.com'
  WHERE "provider_id" = 'google';
UPDATE "accounts" SET "issuer" = 'local:oauth:' || "provider_id"
  WHERE "issuer" IS NULL;
ALTER TABLE "accounts" ALTER COLUMN "issuer" SET NOT NULL;

-- expires_at held unix seconds as an integer; BetterAuth wants a timestamp.
ALTER TABLE "accounts" ADD COLUMN "access_token_expires_at" TIMESTAMP(3);
UPDATE "accounts"
  SET "access_token_expires_at" = to_timestamp("expires_at")::timestamp(3)
  WHERE "expires_at" IS NOT NULL;
ALTER TABLE "accounts" DROP COLUMN "expires_at";

ALTER TABLE "accounts" ADD COLUMN "refresh_token_expires_at" TIMESTAMP(3);
ALTER TABLE "accounts" ADD COLUMN "password" TEXT;
ALTER TABLE "accounts" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "accounts" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- NextAuth-only columns with no BetterAuth equivalent.
ALTER TABLE "accounts" DROP COLUMN "type";
ALTER TABLE "accounts" DROP COLUMN "token_type";
ALTER TABLE "accounts" DROP COLUMN "session_state";

DROP INDEX IF EXISTS "accounts_provider_provider_account_id_key";
CREATE UNIQUE INDEX "accounts_issuer_account_id_key" ON "accounts"("issuer", "account_id");
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------

-- Sessions are disposable state and their token format changes here, so they are
-- emptied rather than converted. Everyone signs in once more after deploy.
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

-- ---------------------------------------------------------------------------
-- verification
-- ---------------------------------------------------------------------------

-- verification_tokens was never written to: there is no email/password,
-- magic-link or email-OTP provider configured. Replaced outright rather than
-- converted.
DROP TABLE IF EXISTS "verification_tokens";

CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");
