import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FileUpload } from '@/components/file-upload';
import { ThemeToggle } from '@/components/theme-toggle';
import { requireAuth } from '@/lib/auth';

export default async function Upload() {
  try {
    const session = await requireAuth();

    return (
      <div className="min-h-screen bg-surface">
        {/* Header */}
        <div className="bg-background shadow border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 sm:py-6 space-y-4 sm:space-y-0">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link
                  href="/dashboard"
                  className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
                  aria-label="Back to dashboard"
                >
                  <svg
                    className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <title>Back arrow</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 19l-7-7m0 0l7-7m-7 7h18"
                    />
                  </svg>
                </Link>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground">Upload Document</h1>
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <ThemeToggle />
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <span className="text-xs sm:text-sm text-muted truncate max-w-32 sm:max-w-none">
                    {session.user.name || session.user.email}
                  </span>
                  <Link
                    href="/api/auth/signout"
                    className="text-xs sm:text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer"
                  >
                    Sign out
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="max-w-3xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            <div className="bg-background shadow rounded-lg border border-border p-6">
              <FileUpload />
            </div>
          </div>
        </div>
      </div>
    );
  } catch {
    redirect('/auth/signin');
  }
}
