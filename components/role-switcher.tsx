'use client';

import type { ImpersonationMode } from '@prisma/client';
import { useState } from 'react';
import { useImpersonation } from '@/hooks/use-impersonation';

export function RoleSwitcher() {
  const { currentMode, canImpersonate, isLoading, error, switchMode } = useImpersonation();
  const [isSwitching, setIsSwitching] = useState(false);

  const handleModeSwitch = async (newMode: ImpersonationMode) => {
    if (newMode === currentMode || isSwitching) return;

    setIsSwitching(true);
    try {
      await switchMode(newMode);
    } catch (_error) {
      // Handle error silently
    } finally {
      setIsSwitching(false);
    }
  };

  if (!canImpersonate) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="flex items-center space-x-2">
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-4">
      <span className="text-sm font-medium text-gray-700">View as:</span>
      <div className="flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          type="button"
          onClick={() => handleModeSwitch('SELF')}
          disabled={isSwitching}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            currentMode === 'SELF'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          Admin
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('USER')}
          disabled={isSwitching}
          className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
            currentMode === 'USER'
              ? 'bg-blue-100 text-blue-700'
              : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          } ${isSwitching ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          User
        </button>
      </div>
      {error && (
        <span className="text-sm text-red-600" title={error}>
          Error switching roles
        </span>
      )}
    </div>
  );
}
