import type { ImpersonationMode } from '@prisma/client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth-client';

type ImpersonationState = {
  currentMode: ImpersonationMode;
  canImpersonate: boolean;
  isLoading: boolean;
  error: string | null;
};

export function useImpersonation() {
  const { data: session, refetch } = useSession();
  const [state, setState] = useState<ImpersonationState>({
    currentMode: 'SELF',
    canImpersonate: false,
    isLoading: true,
    error: null,
  });

  const fetchStatus = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      const response = await fetch('/api/user/impersonation');
      if (!response.ok) {
        throw new Error('Failed to fetch impersonation status');
      }

      const data = await response.json();
      setState({
        currentMode: data.currentMode,
        canImpersonate: data.canImpersonate,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }));
    }
  }, []);

  const switchMode = useCallback(
    async (newMode: ImpersonationMode) => {
      try {
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        const response = await fetch('/api/user/impersonation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ mode: newMode }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to switch impersonation mode');
        }

        const data = await response.json();

        // Update local state
        setState((prev) => ({
          ...prev,
          currentMode: newMode,
          isLoading: false,
        }));

        // Invalidate the client's copy of the session rather than editing it.
        // The server re-reads currentImpersonationMode from the users row on
        // every request, so it is already authoritative; writing a value into
        // the session here would create a second source of truth that could
        // disagree with the database.
        await refetch();

        return data;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }));
        throw error;
      }
    },
    [refetch]
  );

  // Initialize on mount and when session changes
  useEffect(() => {
    if (session?.user) {
      fetchStatus();
    }
  }, [session?.user, fetchStatus]);

  return {
    ...state,
    switchMode,
    refreshStatus: fetchStatus,
  };
}
