'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

type DocumentViewerProps = {
  documentId: string;
  className?: string;
};

type ViewerError = {
  message: string;
  code?: string;
};

export function DocumentViewer({ documentId, className = '' }: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<ViewerError | null>(null);
  const [viewerData, setViewerData] = useState<{
    sessionToken: string;
  } | null>(null);

  // Fetch the viewer data from our API
  const fetchViewerData = useCallback(async () => {
    try {
      setError(null);

      const response = await fetch(`/api/documents/${documentId}/viewer-url`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to get viewer data');
      }

      const data = await response.json();

      const viewerDataToSet = {
        sessionToken: data.sessionToken,
      };

      setViewerData(viewerDataToSet);
    } catch (error) {
      setError({
        message: error instanceof Error ? error.message : 'Unknown error',
        code: 'FETCH_ERROR',
      });
    }
  }, [documentId]);

  // Initialize the Nutrient Viewer using NutrientViewer.load()
  const initializeViewer = useCallback(async () => {
    if (!viewerData || !containerRef.current) {
      return;
    }

    try {
      setError(null);

      // Unload any existing NutrientViewer instance first
      try {
        if (window?.NutrientViewer?.unload) {
          await window.NutrientViewer.unload(containerRef.current);
        }
      } catch (_error) {
        // Ignore unload errors if no instance exists
      }

      // Clear the container
      containerRef.current.innerHTML = '';

      // Check if NutrientViewer is available
      if (typeof window === 'undefined' || !window.NutrientViewer) {
        throw new Error('NutrientViewer library not loaded');
      }

      if (!viewerData.sessionToken || viewerData.sessionToken.trim() === '') {
        throw new Error('Empty session token received from API');
      }

      await window.NutrientViewer.load({
        container: containerRef.current,
        session: viewerData.sessionToken,
      });
    } catch (error) {
      setError({
        message: error instanceof Error ? error.message : 'Failed to load document viewer',
        code: 'VIEWER_ERROR',
      });
    }
  }, [viewerData]);

  // Cleanup function
  const cleanup = useCallback(async () => {
    if (containerRef.current) {
      try {
        // Properly unload the NutrientViewer instance before clearing container
        if (window?.NutrientViewer?.unload) {
          await window.NutrientViewer.unload(containerRef.current);
        }
      } catch (_error) {
        // If unload fails, just clear the container
      }

      // Clear the container as fallback
      containerRef.current.innerHTML = '';
    }
  }, []);

  // Effect to fetch viewer data
  useEffect(() => {
    fetchViewerData();
  }, [fetchViewerData]);

  // Effect to initialize viewer when data is available
  useEffect(() => {
    if (viewerData) {
      // Wait for container to be available
      let retryCount = 0;
      const maxRetries = 100; // 5 seconds max

      const checkAndInit = () => {
        if (containerRef.current) {
          // Also check that the container has computed dimensions
          const containerRect = containerRef.current.getBoundingClientRect();

          if (containerRect.width > 0 && containerRect.height > 0) {
            initializeViewer();
          } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(checkAndInit, 50);
          } else {
            setError({
              message: 'Failed to initialize document viewer: container has no dimensions',
              code: 'CONTAINER_SIZE_ERROR',
            });
          }
        } else if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(checkAndInit, 50);
        } else {
          setError({
            message: 'Failed to initialize document viewer: container not available',
            code: 'CONTAINER_ERROR',
          });
        }
      };
      checkAndInit();
    }
  }, [viewerData, initializeViewer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const handleRetry = useCallback(() => {
    setError(null);
    setViewerData(null);
    fetchViewerData();
  }, [fetchViewerData]);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-surface rounded-lg border-2 border-dashed border-border ${className}`}
      >
        <div className="text-center p-6">
          <svg
            className="mx-auto h-12 w-12 text-error"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <title>Error</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.316 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <h3 className="mt-2 text-sm font-medium text-foreground">Failed to load document</h3>
          <p className="mt-1 text-sm text-muted">{error.message}</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background cursor-pointer transition-colors"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`bg-background rounded-lg shadow-sm border border-border ${className}`}
      style={{ position: 'relative' }}
    >
      {/* NutrientViewer container - it handles its own loading state */}
      <div
        ref={containerRef}
        className="w-full h-full rounded-lg"
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
          minHeight: '600px', // Ensure minimum height for viewer
        }}
      />
    </div>
  );
}
