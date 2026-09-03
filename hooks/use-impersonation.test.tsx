import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const useSession = vi.fn();
const refetch = vi.fn();

vi.mock('@/lib/auth-client', () => ({ useSession: () => useSession() }));

const { useImpersonation } = await import('@/hooks/use-impersonation');

const signedIn = () => ({
  data: { user: { id: 'admin_1', currentImpersonationMode: 'SELF' } },
  isPending: false,
  refetch,
});

beforeEach(() => {
  useSession.mockReset().mockReturnValue(signedIn());
  refetch.mockReset();
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ currentMode: 'SELF', canImpersonate: true }),
      })
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Reading impersonation status', () => {
  it('reports the mode the server says the signed-in person is in', async () => {
    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.currentMode).toBe('SELF');
    expect(result.current.canImpersonate).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('surfaces a failure to read the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }))
    );

    const { result } = renderHook(() => useImpersonation());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe('Failed to fetch impersonation status');
  });

  it('does not ask the server anything when nobody is signed in', async () => {
    useSession.mockReturnValue({ data: null, isPending: false, refetch });

    renderHook(() => useImpersonation());

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('Switching impersonation mode', () => {
  it('posts the new mode and refetches the session rather than editing it', async () => {
    // The server re-reads currentImpersonationMode from the users row on every
    // request, so the client only needs to invalidate its own copy. Pushing a
    // value into the session — as the NextAuth version did with update() —
    // would be a second source of truth that could disagree with the database.
    const { result } = renderHook(() => useImpersonation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ success: true, user: { currentImpersonationMode: 'USER' } }),
        })
      )
    );

    await act(async () => {
      await result.current.switchMode('USER');
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/user/impersonation',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ mode: 'USER' }) })
    );
    expect(refetch).toHaveBeenCalled();
    expect(result.current.currentMode).toBe('USER');
  });

  it('reports the server’s reason when a switch is refused', async () => {
    const { result } = renderHook(() => useImpersonation());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: 'Only admins can change impersonation mode' }),
        })
      )
    );

    await act(async () => {
      await expect(result.current.switchMode('USER')).rejects.toThrow(
        'Only admins can change impersonation mode'
      );
    });

    expect(result.current.error).toBe('Only admins can change impersonation mode');
  });
});
