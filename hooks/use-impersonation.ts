import type { ImpersonationMode } from '@prisma/client';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

type ImpersonationState = {
  currentMode: ImpersonationMode;
  canImpersonate: boolean;
  isLoading: boolean;
  error: string | null;
};

export function useImpersonation() {
  const { data: session, update } = useSession();
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

        // Update the session to reflect the new impersonation mode
        await update({
          ...session,
          user: {
            ...session?.user,
            currentImpersonationMode: newMode,
          },
        });

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
    [session, update]
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
