'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { signIn, useSession } from '@/lib/auth-client';

// Force dynamic rendering to prevent static generation issues
export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { id: 'google', label: 'Sign in with Google' },
  { id: 'microsoft', label: 'Sign in with Microsoft' },
] as const;

export default function SignIn() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (session) {
      router.push('/dashboard');
    }
  }, [session, router]);

  if (isPending || session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            Sign in to your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">Nutrient DWS CRUD Application</p>
        </div>
        <div className="space-y-3">
          {PROVIDERS.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => signIn.social({ provider: provider.id, callbackURL: '/dashboard' })}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              {provider.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
