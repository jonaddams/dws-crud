// @vitest-environment node

import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAuth = vi.fn();
const update = vi.fn();

vi.mock('@/lib/auth', () => ({ requireAuth: (...args: unknown[]) => requireAuth(...args) }));
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { update: (...args: unknown[]) => update(...args) } },
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

describe('Reading impersonation status', () => {
  it('answers 401 when nobody is signed in', async () => {
    // Every other route under app/api/ answers 401 here. This one answered a
    // bare 500, which reads as a server fault rather than a missing session.
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

  it('tells a regular user they cannot impersonate', async () => {
    requireAuth.mockResolvedValue({
      user: { id: 'user_1', role: 'USER', currentImpersonationMode: 'SELF' },
    });

    const response = await GET();

    expect(await response.json()).toEqual({ currentMode: 'SELF', canImpersonate: false });
  });

  it('still answers 500 for a genuine fault', async () => {
    requireAuth.mockRejectedValue(new Error('database is on fire'));

    const response = await GET();

    expect(response.status).toBe(500);
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

  it('records a valid mode against the signed-in admin, not the impersonated user', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } });
    update.mockResolvedValue({
      id: 'admin_1',
      role: 'ADMIN',
      currentImpersonationMode: 'USER',
    });

    const response = await POST(postRequest({ mode: 'USER' }));

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'admin_1' },
        data: { currentImpersonationMode: 'USER' },
      })
    );
  });

  it('still answers 500 for a genuine fault', async () => {
    requireAuth.mockResolvedValue({ user: { id: 'admin_1', role: 'ADMIN' } });
    update.mockRejectedValue(new Error('database is on fire'));

    const response = await POST(postRequest({ mode: 'USER' }));

    expect(response.status).toBe(500);
  });
});
