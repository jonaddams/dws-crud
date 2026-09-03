'use client';

import { inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import type { auth } from '@/lib/auth-config';

/**
 * The browser-side auth client.
 *
 * `inferAdditionalFields` carries `role` and `currentImpersonationMode` through
 * to `useSession()` so components need not re-declare them.
 *
 * Note the server's `getSession()` re-reads both from the database on every
 * call, so a value here can lag a role switch until the next refetch. Anything
 * that must be correct — a permission decision, a document filter — belongs on
 * the server, not on this value.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});

export const { signIn, signOut, useSession } = authClient;
