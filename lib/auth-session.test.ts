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
      email: 'alice@nutrient.io',
      name: 'Alice',
      image: null,
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

  it('looks the user up by id rather than by email', async () => {
    getSessionFromBetterAuth.mockResolvedValue({
      session: { id: 'sess_1', userId: 'user_alice' },
      user: { id: 'user_alice', email: 'alice@nutrient.io', name: 'Alice', image: null },
    });
    findUnique.mockResolvedValue({
      id: 'user_alice',
      email: 'alice@nutrient.io',
      name: 'Alice',
      image: null,
      role: 'USER',
      currentImpersonationMode: 'SELF',
    });

    await getSession();

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user_alice' } })
    );
  });
});

describe('Role and impersonation mode are read fresh, not cached', () => {
  it('prefers the current database row over whatever the session carried', async () => {
    // The admin role switcher writes to the users row. A session-cached value
    // would make it appear to do nothing until the next sign-in.
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
      email: 'admin@nutrient.io',
      name: 'Admin',
      image: null,
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
    // Comment attribution rides on this id: DWS records it as the comment's
    // author, so an admin impersonating a user must still post as themselves.
    // It is also what binds a verified phone number to an account.
    for (const mode of ['SELF', 'ADMIN', 'USER'] as const) {
      getSessionFromBetterAuth.mockResolvedValue({
        session: { id: 'sess_1', userId: 'admin_real' },
        user: { id: 'admin_real', email: 'admin@nutrient.io', name: 'Admin', image: null },
      });
      findUnique.mockResolvedValue({
        id: 'admin_real',
        email: 'admin@nutrient.io',
        name: 'Admin',
        image: null,
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

    // The literal string is load-bearing: handlers under app/api/ compare
    // error.message to it and map that to a 401. Reword it and every
    // unauthenticated request becomes a 500. Assert the exact message, and that
    // the thrown value is a real Error, because those handlers guard on
    // `error instanceof Error` before reading `.message`.
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
      email: 'bob@nutrient.io',
      name: 'Bob',
      image: null,
      role: 'USER',
      currentImpersonationMode: 'SELF',
    });

    const session = await requireAuth();

    expect(session.user.id).toBe('user_bob');
  });
});
