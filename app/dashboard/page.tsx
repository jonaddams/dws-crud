import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard-header';
import { DocumentList } from '@/components/document-list';
import { requireAuth } from '@/lib/auth';

export default async function Dashboard() {
  try {
    const session = await requireAuth();

    return (
      <div className="min-h-screen bg-surface">
        {/* Header */}
        <DashboardHeader user={session.user} />

        {/* Main content */}
        <div className="max-w-7xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0">
            {/* Action bar */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-6 space-y-4 sm:space-y-0">
              <h2 className="text-lg font-medium text-foreground">Your Documents</h2>
              <Link
                href="/upload"
                className="inline-flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-primary-foreground bg-primary hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary transition-colors cursor-pointer"
              >
                <svg
                  className="-ml-1 mr-2 h-5 w-5 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Upload Document
              </Link>
            </div>

            {/* Document list */}
            <DocumentList />
          </div>
        </div>
      </div>
    );
  } catch {
    redirect('/auth/signin');
  }
}
