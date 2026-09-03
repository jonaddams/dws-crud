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
 * The domain is compared for equality rather than by suffix: a suffix test would
 * admit `notnutrient.io` and `nutrient.io.example.com`. The address is split on
 * its **last** `@`, so a local part cannot smuggle an allowed domain past the
 * check (`nutrient.io@gmail.com` is refused).
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
      // Single-tenant. Given a real tenant GUID the provider also pins
      // expected-issuer validation on the id token, which the 'common' and
      // 'organizations' scopes cannot do.
      tenantId: process.env.MICROSOFT_TENANT_ID || '',
      prompt: 'select_account',
    },
  },
  account: {
    accountLinking: {
      // One person who signs in with Google and later with Microsoft must be one
      // user row. Two rows would split document ownership and misattribute
      // comments, since DWS records the session user ID as a comment's author.
      enabled: true,
      trustedProviders: ['google', 'microsoft'],
    },
  },
  user: {
    additionalFields: {
      // Declared so BetterAuth's types and the inferred browser client know
      // about them. getSession() in lib/auth.ts overwrites both from a fresh
      // database read; see the comment there for why.
      role: { type: 'string', required: false, input: false },
      currentImpersonationMode: { type: 'string', required: false, input: false },
    },
    /**
     * The port of NextAuth's `signIn` callback.
     *
     * This fires on `create-user`, `link-account` **and** `sign-in`, so a
     * disallowed domain cannot get in by linking onto an existing account, and a
     * user whose provider identity later moves out of bounds is refused too. A
     * `databaseHooks.user.create.before` hook would only guard first sign-up.
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
