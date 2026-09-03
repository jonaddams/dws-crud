import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const social = vi.fn();
const useSession = vi.fn();

vi.mock('@/lib/auth-client', () => ({
  signIn: { social: (...args: unknown[]) => social(...args) },
  useSession: () => useSession(),
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { default: SignIn } = await import('@/app/auth/signin/page');

beforeEach(() => {
  social.mockReset();
  push.mockReset();
  useSession.mockReset().mockReturnValue({ data: null, isPending: false });
});

describe('Signing in', () => {
  it('offers both Google and Microsoft', () => {
    render(<SignIn />);

    expect(screen.getByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /microsoft/i })).toBeInTheDocument();
  });

  it('starts a Google sign-in when the Google button is used', async () => {
    render(<SignIn />);

    await userEvent.click(screen.getByRole('button', { name: /google/i }));

    expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/dashboard' });
  });

  it('starts a Microsoft sign-in when the Microsoft button is used', async () => {
    render(<SignIn />);

    await userEvent.click(screen.getByRole('button', { name: /microsoft/i }));

    expect(social).toHaveBeenCalledWith({ provider: 'microsoft', callbackURL: '/dashboard' });
  });

  it('sends an already-signed-in person to the dashboard', () => {
    useSession.mockReturnValue({ data: { user: { id: 'user_1' } }, isPending: false });

    render(<SignIn />);

    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('shows nothing actionable while the session is still loading', () => {
    useSession.mockReturnValue({ data: null, isPending: true });

    render(<SignIn />);

    expect(screen.queryByRole('button', { name: /google/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /microsoft/i })).not.toBeInTheDocument();
  });
});
