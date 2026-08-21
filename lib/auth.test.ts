// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { canPerformAdminActions, getEffectiveDocumentFilter, type SessionUser } from '@/lib/auth';

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

    expect(getEffectiveDocumentFilter(user)).toEqual({ ownerId: 'user_abc' });
  });

  it('limits an admin to their own documents while impersonating a user', () => {
    const user = getMockSessionUser({
      id: 'admin_abc',
      role: 'ADMIN',
      currentImpersonationMode: 'SELF',
    });

    expect(getEffectiveDocumentFilter(user)).toEqual({ ownerId: 'admin_abc' });
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

    expect(getEffectiveDocumentFilter(user)).toEqual({ ownerId: 'user_xyz' });
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
