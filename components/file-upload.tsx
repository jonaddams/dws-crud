'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useId, useState } from 'react';

type UploadState = {
  isUploading: boolean;
  progress: number;
  error: string | null;
  success: boolean;
};

export function FileUpload() {
  const router = useRouter();
  const fileUploadId = useId();
  const titleInputId = useId();
  const authorInputId = useId();

  const [uploadState, setUploadState] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    error: null,
    success: false,
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  const resetUploadState = useCallback(() => {
    setUploadState({
      isUploading: false,
      progress: 0,
      error: null,
      success: false,
    });
  }, []);

  const handleFileSelect = useCallback(
    (file: File) => {
      setSelectedFile(file);
      setTitle(file.name.replace(/\.[^/.]+$/, '')); // Use filename without extension as default title
      setAuthor('');
      resetUploadState();
    },
    [resetUploadState]
  );

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        handleFileSelect(file);
      }
    },
    [handleFileSelect]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragOver(false);

      const files = Array.from(event.dataTransfer.files);
      if (files.length > 0) {
        handleFileSelect(files[0]);
      }
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  }, []);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      document.getElementById('file-upload')?.click();
    }
  }, []);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploadState((prev) => ({ ...prev, isUploading: true, error: null }));

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', title);
        formData.append('author', author);

        const response = await fetch('/api/documents', {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Upload failed');
        }

        const data = await response.json();

        setUploadState({
          isUploading: false,
          progress: 100,
          error: null,
          success: true,
        });

        // Redirect to document view after successful upload
        setTimeout(() => {
          router.push(`/documents/${data.document.id}`);
        }, 1500);
      } catch (error) {
        setUploadState({
          isUploading: false,
          progress: 0,
          error: error instanceof Error ? error.message : 'Upload failed',
          success: false,
        });
      }
    },
    [router, title, author]
  );

  const handleUpload = useCallback(() => {
    if (selectedFile) {
      uploadFile(selectedFile);
    }
  }, [selectedFile, uploadFile]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${Math.round((bytes / k ** i) * 100) / 100} ${sizes[i]}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-foreground">Select a document to upload</h2>
        <p className="mt-1 text-sm text-muted">
          Supported formats: PDF, Word documents, images, and other common file types.
        </p>
      </div>

      {/* File drop zone */}
      <div
        role="button"
        tabIndex={0}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={handleKeyDown}
        className={`relative border-2 border-dashed rounded-lg p-6 transition-colors cursor-pointer ${
          dragOver
            ? 'border-primary bg-primary/10'
            : selectedFile
              ? 'border-success bg-success/10'
              : 'border-border hover:border-primary/50'
        }`}
      >
        <div className="text-center">
          {selectedFile ? (
            <div className="space-y-2">
              <svg
                className="mx-auto h-12 w-12 text-success"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <title>Document selected</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="text-sm text-foreground">
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-muted">{formatFileSize(selectedFile.size)}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedFile(null);
                  resetUploadState();
                }}
                className="text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer"
              >
                Choose different file
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                className="mx-auto h-12 w-12 text-subtle"
                stroke="currentColor"
                fill="none"
                viewBox="0 0 48 48"
                aria-hidden="true"
              >
                <title>Upload area</title>
                <path
                  d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="text-sm text-muted">
                <label htmlFor="file-upload" className="cursor-pointer">
                  <span className="font-medium text-primary hover:text-primary-hover transition-colors">
                    Click to upload
                  </span>
                  <span> or drag and drop</span>
                  <input
                    id={fileUploadId}
                    name="file-upload"
                    type="file"
                    className="sr-only"
                    onChange={handleFileChange}
                  />
                </label>
              </div>
              <p className="text-xs text-muted">Up to 250MB</p>
            </div>
          )}
        </div>
      </div>

      {/* Document metadata form */}
      {selectedFile && (
        <div className="space-y-4">
          <div>
            <label htmlFor={titleInputId} className="block text-sm font-medium text-foreground">
              Document Title *
            </label>
            <input
              type="text"
              id={titleInputId}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter a title for your document"
              className="mt-1 block w-full rounded-md border-border bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:ring-offset-background sm:text-sm border px-3 py-2 placeholder:text-muted"
              required
            />
          </div>
          <div>
            <label htmlFor={authorInputId} className="block text-sm font-medium text-foreground">
              Author (optional)
            </label>
            <input
              type="text"
              id={authorInputId}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Enter author name"
              className="mt-1 block w-full rounded-md border-border bg-background text-foreground shadow-sm focus:border-primary focus:ring-primary focus:ring-2 focus:ring-offset-2 focus:ring-offset-background sm:text-sm border px-3 py-2 placeholder:text-muted"
            />
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploadState.isUploading && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-foreground">
            <span>Uploading...</span>
            <span>{uploadState.progress}%</span>
          </div>
          <div className="w-full bg-surface rounded-full h-2">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${uploadState.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Success message */}
      {uploadState.success && (
        <div className="rounded-md bg-success/10 border border-success/20 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-success"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <title>Success</title>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.236 4.53L7.53 10.53a.75.75 0 00-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-success">Upload successful!</h3>
              <div className="mt-2 text-sm text-success/90">
                <p>Your document has been uploaded. Redirecting to document view...</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error message */}
      {uploadState.error && (
        <div className="rounded-md bg-error/10 border border-error/20 p-4">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-error"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <title>Error</title>
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-error">Upload failed</h3>
              <div className="mt-2 text-sm text-error/90">
                <p>{uploadState.error}</p>
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  onClick={resetUploadState}
                  className="bg-error/10 hover:bg-error/20 px-3 py-2 text-sm font-medium text-error rounded-md transition-colors cursor-pointer"
                >
                  Try again
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row justify-between gap-4 sm:gap-0">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center justify-center px-4 py-2 border border-border shadow-sm text-sm font-medium rounded-md text-foreground bg-background hover:bg-surface focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleUpload}
          disabled={
            !selectedFile || !title.trim() || uploadState.isUploading || uploadState.success
          }
          className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          {uploadState.isUploading ? 'Uploading...' : 'Upload Document'}
        </button>
      </div>
    </div>
  );
}
