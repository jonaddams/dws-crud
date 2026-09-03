'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signOut } from '@/lib/auth-client';

type SignOutButtonProps = {
  className?: string;
};

const DEFAULT_CLASS_NAME =
  'text-xs sm:text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer';

/**
 * Signs the current user out.
 *
 * Deliberately a button rather than a link. BetterAuth's sign-out endpoint is
 * `POST /api/auth/sign-out`, where NextAuth's was a GET page at
 * `/api/auth/signout`. Three pages carried an anchor to that old GET URL, so the
 * auth migration broke sign-out everywhere without breaking a build or a test —
 * a hardcoded URL is invisible to a search for `next-auth` imports. Routing this
 * through the client keeps the method right and keeps the URL out of the markup,
 * so the next auth change cannot repeat it.
 */
export function SignOutButton({ className }: SignOutButtonProps = {}) {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Swallowed on purpose. A failed revocation must not strand someone on a
      // page that still looks signed in; the cookie is very likely gone anyway,
      // and the next server request will settle it.
    } finally {
      router.push('/');
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className={className ?? DEFAULT_CLASS_NAME}
    >
      Sign out
    </button>
  );
}
