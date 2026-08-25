// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  canPerformAdminActions,
  getDocumentWriteFilter,
  getEffectiveDocumentFilter,
  type SessionUser,
} from '@/lib/auth';

const getMockSessionUser = (overrides: Partial<SessionUser> = {}): SessionUser => ({
  id: 'user_123',
  email: 'someone@nutrient.io',
  name: 'Someone',
  role: 'USER',
  currentImpersonationMode: 'SELF',
  ...overrides,
});

describe('Document visibility', () => {
  it('limits a regular user to documents they own', () => {
    const user = getMockSessionUser({ id: 'user_abc', role: 'USER' });

    expect(getEffectiveDocumentFilter(user)).toEqual({
      OR: [{ ownerId: 'user_abc' }, { shares: { some: { userId: 'user_abc' } } }],
    });
  });

  it('limits an admin to their own documents while impersonating a user', () => {
    const user = getMockSessionUser({
      id: 'admin_abc',
      role: 'ADMIN',
      currentImpersonationMode: 'SELF',
    });

    expect(getEffectiveDocumentFilter(user)).toEqual({
      OR: [{ ownerId: 'admin_abc' }, { shares: { some: { userId: 'admin_abc' } } }],
    });
  });

  it('shows an admin every document when acting as an admin', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: 'ADMIN' });

    expect(getEffectiveDocumentFilter(user)).toEqual({});
  });

  it('shows an admin every document when no impersonation mode is recorded', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: undefined });

    expect(getEffectiveDocumentFilter(user)).toEqual({});
  });

  it('limits a regular user to their own documents regardless of impersonation mode', () => {
    const user = getMockSessionUser({
      id: 'user_xyz',
      role: 'USER',
      currentImpersonationMode: 'ADMIN',
    });

    expect(getEffectiveDocumentFilter(user)).toEqual({
      OR: [{ ownerId: 'user_xyz' }, { shares: { some: { userId: 'user_xyz' } } }],
    });
  });

  it('includes documents shared with the user, not only ones they own', () => {
    const user = getMockSessionUser({ id: 'user_carson', role: 'USER' });

    const filter = getEffectiveDocumentFilter(user);

    expect(filter.OR).toContainEqual({ shares: { some: { userId: 'user_carson' } } });
  });

  it('does not widen an admin filter with a share clause, since they see everything', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: 'ADMIN' });

    expect(getEffectiveDocumentFilter(user)).toEqual({});
  });
});

describe('Changing or deleting a document', () => {
  it('does not let someone edit a document merely shared with them', () => {
    const user = getMockSessionUser({ id: 'user_carson', role: 'USER' });

    // Read access is owned-or-shared; write access is ownership alone. A share
    // arrives by being mentioned, which must not confer rename or delete.
    expect(getDocumentWriteFilter(user)).toEqual({ ownerId: 'user_carson' });
    expect(JSON.stringify(getDocumentWriteFilter(user))).not.toContain('shares');
  });

  it('still lets an admin acting as an admin change any document', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: 'ADMIN' });

    expect(getDocumentWriteFilter(user)).toEqual({});
  });

  it('limits an admin impersonating a user to documents they own', () => {
    const user = getMockSessionUser({
      id: 'admin_abc',
      role: 'ADMIN',
      currentImpersonationMode: 'SELF',
    });

    expect(getDocumentWriteFilter(user)).toEqual({ ownerId: 'admin_abc' });
  });

  it('is narrower than read access for the same user', () => {
    const user = getMockSessionUser({ id: 'user_bob', role: 'USER' });

    expect(getDocumentWriteFilter(user)).not.toEqual(getEffectiveDocumentFilter(user));
  });
});

describe('Admin action permissions', () => {
  it('allows an admin acting as an admin to perform admin actions', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: 'ADMIN' });

    expect(canPerformAdminActions(user)).toBe(true);
  });

  it('denies admin actions to an admin who is impersonating a user', () => {
    const user = getMockSessionUser({ role: 'ADMIN', currentImpersonationMode: 'SELF' });

    expect(canPerformAdminActions(user)).toBe(false);
  });

  it('denies admin actions to a regular user', () => {
    const user = getMockSessionUser({ role: 'USER', currentImpersonationMode: 'ADMIN' });

    expect(canPerformAdminActions(user)).toBe(false);
  });
});
