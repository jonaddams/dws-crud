import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const signOut = vi.fn();
const push = vi.fn();

vi.mock('@/lib/auth-client', () => ({ signOut: (...args: unknown[]) => signOut(...args) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { SignOutButton } = await import('@/components/sign-out-button');

beforeEach(() => {
  signOut.mockReset().mockResolvedValue(undefined);
  push.mockReset();
});

describe('Signing out', () => {
  it('is a button, not a link to an auth URL', () => {
    // This is the whole point of the component. BetterAuth's sign-out endpoint
    // is POST /api/auth/sign-out; NextAuth's was a GET page at
    // /api/auth/signout. Three pages carried an <a> to the old GET URL, which
    // the migration silently broke. A button that calls the client keeps the
    // method correct and the URL out of the markup entirely.
    render(<SignOutButton />);

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('signs the user out and returns them to the start', async () => {
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(signOut).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/');
  });

  it('still sends the user away when sign-out fails', async () => {
    // A failed revocation must not leave someone stranded on a page that looks
    // signed in. The session cookie may well be gone already.
    signOut.mockRejectedValue(new Error('network'));
    render(<SignOutButton />);

    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));

    expect(push).toHaveBeenCalledWith('/');
  });
});
