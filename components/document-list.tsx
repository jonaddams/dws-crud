'use client';

import type { Document } from '@prisma/client';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useState } from 'react';

type DocumentWithOwner = Document & {
  ownerId: string;
  owner: {
    name: string | null;
    email: string;
  };
};

export function DocumentList() {
  const { data: session, status } = useSession();
  const [documents, setDocuments] = useState<DocumentWithOwner[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    documentId: string;
    documentTitle: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/documents');
      if (!response.ok) {
        throw new Error('Failed to fetch documents');
      }

      const data = await response.json();
      setDocuments(data.documents || []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const formatFileSize = (bytes: bigint | null) => {
    if (!bytes || bytes === BigInt(0)) return '0 Bytes';
    const bytesNumber = Number(bytes);
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytesNumber) / Math.log(k));
    return `${Math.round((bytesNumber / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  const canDeleteDocument = (document: DocumentWithOwner) => {
    // Don't show delete buttons if session is still loading
    if (status === 'loading' || !session?.user) return false;

    // User can delete if they own the document
    if (document.ownerId === session.user.id) return true;

    // Admin can delete any document when in ADMIN mode
    if (session.user.role === 'ADMIN' && session.user.currentImpersonationMode === 'ADMIN') {
      return true;
    }

    return false;
  };

  const handleDeleteClick = (document: DocumentWithOwner) => {
    setDeleteConfirmation({
      documentId: document.id,
      documentTitle: document.title,
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation) return;

    try {
      setIsDeleting(true);

      const response = await fetch(`/api/documents/${deleteConfirmation.documentId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete document');
      }

      // Remove the document from the local state
      setDocuments((prev) => prev.filter((doc) => doc.id !== deleteConfirmation.documentId));
      setDeleteConfirmation(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete document');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-md bg-error/10 border border-error/20 p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-error" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-error">Error loading documents</h3>
            <div className="mt-2 text-sm text-muted">
              <p>{error}</p>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={fetchDocuments}
                className="bg-error/10 hover:bg-error/20 px-3 py-2 text-sm font-medium text-error rounded-md transition-colors cursor-pointer"
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="mx-auto h-12 w-12 text-subtle"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-foreground">No documents</h3>
        <p className="mt-1 text-sm text-muted">Get started by uploading your first document.</p>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card layout */}
      <div className="block md:hidden">
        <div className="space-y-4">
          {documents.map((document) => (
            <div
              key={document.id}
              className="bg-background border border-border rounded-lg p-4 shadow-sm"
            >
              <div className="flex items-start justify-between mb-3">
                <h3 className="text-sm font-medium text-foreground truncate pr-2">
                  {document.title}
                </h3>
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <Link
                    href={`/documents/${document.id}`}
                    className="text-primary hover:text-primary-hover transition-colors cursor-pointer text-sm"
                  >
                    View
                  </Link>
                  {canDeleteDocument(document) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteClick(document)}
                      className="text-error hover:text-error/80 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed text-sm"
                      disabled={isDeleting}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Size</span>
                  <span className="text-foreground">{formatFileSize(document.fileSize)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Uploaded by</span>
                  <span className="text-foreground truncate ml-2">
                    {document.owner.name || document.owner.email}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted">Created</span>
                  <span className="text-foreground">{formatDate(document.createdAt)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Desktop table layout */}
      <div className="hidden md:block overflow-hidden shadow ring-1 ring-border md:rounded-lg">
        <table className="min-w-full divide-y divide-border">
          <thead className="bg-surface">
            <tr>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
              >
                Name
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
              >
                Size
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
              >
                Uploaded by
              </th>
              <th
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider"
              >
                Created
              </th>
              <th scope="col" className="relative px-6 py-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="bg-background divide-y divide-border">
            {documents.map((document) => (
              <tr key={document.id} className="hover:bg-surface-hover transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground">
                  {document.title}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                  {formatFileSize(document.fileSize)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                  {document.owner.name || document.owner.email}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                  {formatDate(document.createdAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  <div className="flex items-center justify-end space-x-4">
                    <Link
                      href={`/documents/${document.id}`}
                      className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
                    >
                      View
                    </Link>
                    {canDeleteDocument(document) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteClick(document)}
                        className="text-error hover:text-error/80 transition-colors disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        disabled={isDeleting}
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirmation && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-background border border-border rounded-lg max-w-md w-full p-6 shadow-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg
                  className="h-6 w-6 text-error"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth="1.5"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-lg font-medium text-foreground">Delete Document</h3>
                <div className="mt-2">
                  <p className="text-sm text-muted">
                    Are you sure you want to delete &ldquo;{deleteConfirmation.documentTitle}
                    &rdquo;? This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-5 sm:mt-4 sm:flex sm:flex-row-reverse">
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-error text-base font-medium text-primary-foreground hover:bg-error/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-error sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
              <button
                type="button"
                onClick={handleDeleteCancel}
                disabled={isDeleting}
                className="mt-3 w-full inline-flex justify-center rounded-md border border-border shadow-sm px-4 py-2 bg-surface text-base font-medium text-accent-foreground hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary sm:mt-0 sm:w-auto sm:text-sm disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
