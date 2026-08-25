import type { ImpersonationMode, Prisma, UserRole } from '@prisma/client';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth-config';

export type SessionUser = {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  role?: UserRole;
  currentImpersonationMode?: ImpersonationMode;
};

export async function getSession() {
  return await getServerSession(authOptions);
}

/**
 * Validates that a user session exists and returns the session.
 * Throws an error if no valid session is found.
 * Use this in API routes and server components to ensure authentication.
 */
export async function requireAuth() {
  const session = await getSession();

  if (!session?.user?.id) {
    throw new Error('Authentication required');
  }

  return session;
}

/**
 * Validates that a user has admin role.
 * Throws an error if user is not an admin.
 */
export async function requireAdmin() {
  const session = await requireAuth();

  if (session.user.role !== 'ADMIN') {
    throw new Error('Admin access required');
  }

  return session;
}

/**
 * Which documents a user may read: their own, plus any shared with them.
 *
 * Admins acting as admins see everything and need no clause at all.
 *
 * **This returns an `OR`, so never assign to `.OR` on a where-clause built from
 * it** — that replaces the access rule instead of narrowing it, and every
 * document becomes visible. Combine with `AND`, as the list route does.
 */
export function getEffectiveDocumentFilter(user: SessionUser): Prisma.DocumentWhereInput {
  if (user.role === 'ADMIN' && user.currentImpersonationMode !== 'SELF') {
    return {}; // ADMIN mode, or no mode recorded: every document.
  }

  // Owned or shared. A mention grants a share, so a notification cannot point
  // someone at a document they would then be refused.
  return {
    OR: [{ ownerId: user.id }, { shares: { some: { userId: user.id } } }],
  };
}

/**
 * Which documents a user may change or delete: their own only.
 *
 * Deliberately narrower than {@link getEffectiveDocumentFilter}. A share is read
 * access, and it is handed out automatically to anyone who gets mentioned — so
 * reusing the read filter here would mean mentioning someone let them rename or
 * delete the document they were invited to look at.
 *
 * Admins acting as admins can still change anything.
 */
export function getDocumentWriteFilter(user: SessionUser): Prisma.DocumentWhereInput {
  if (user.role === 'ADMIN' && user.currentImpersonationMode !== 'SELF') {
    return {};
  }

  return { ownerId: user.id };
}

/**
 * Checks if a user can perform admin actions (create admin users, etc.)
 */
export function canPerformAdminActions(user: SessionUser) {
  return user.role === 'ADMIN' && user.currentImpersonationMode !== 'SELF';
}
