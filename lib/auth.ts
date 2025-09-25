import type { ImpersonationMode, UserRole } from '@prisma/client';
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
 * Gets the effective viewing mode for document queries.
 * Admins can see all documents when in ADMIN mode, otherwise only their own.
 */
export function getEffectiveDocumentFilter(user: SessionUser) {
  if (user.role === 'ADMIN' && user.currentImpersonationMode === 'SELF') {
    return { ownerId: user.id }; // Admin viewing as user - only their own documents
  }

  if (user.role === 'ADMIN') {
    return {}; // No filter - see all documents (ADMIN mode or no impersonation mode set)
  }

  return { ownerId: user.id }; // Only user's own documents
}

/**
 * Checks if a user can perform admin actions (create admin users, etc.)
 */
export function canPerformAdminActions(user: SessionUser) {
  return user.role === 'ADMIN' && user.currentImpersonationMode !== 'SELF';
}
