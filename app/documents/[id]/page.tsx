import { PrismaClient } from '@prisma/client';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { DocumentViewer } from '@/components/document-viewer';
import { ThemeToggle } from '@/components/theme-toggle';
import { getEffectiveDocumentFilter, requireAuth } from '@/lib/auth';

const prisma = new PrismaClient();

type Params = {
  id: string;
};

export default async function DocumentView({ params }: { params: Promise<Params> }) {
  try {
    const session = await requireAuth();
    const { id } = await params;

    // Get the document with owner info
    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        owner: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    });

    if (!document) {
      notFound();
    }

    // Check if user can access this document based on role and impersonation
    const filter = getEffectiveDocumentFilter(session.user);
    const canAccess = await prisma.document.findFirst({
      where: {
        id,
        ...filter,
      },
    });

    if (!canAccess) {
      notFound();
    }

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
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(date));
    };

    return (
      <div className="min-h-screen bg-surface">
        {/* Header */}
        <div className="bg-background shadow border-b border-border">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center py-4 sm:py-6">
              <div className="flex items-center space-x-2 sm:space-x-4">
                <Link
                  href="/dashboard"
                  className="text-primary hover:text-primary-hover transition-colors cursor-pointer"
                  aria-label="Back to dashboard"
                >
                  <svg
                    className="h-5 w-5 sm:h-6 sm:w-6"
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
              </div>
              <div className="flex items-center space-x-2 sm:space-x-4">
                <ThemeToggle />
                <div className="flex items-center space-x-2 sm:space-x-4">
                  <span className="text-xs sm:text-sm text-muted truncate max-w-20 sm:max-w-none">
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
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
          <div className="px-4 sm:px-0">
            {/* Document metadata - Compact table format */}
            <div className="bg-background shadow rounded-lg border border-border p-3 mb-3">
              <table className="w-full text-xs">
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-1.5 font-medium text-muted w-20">Title</td>
                    <td className="py-1.5 text-foreground font-medium" colSpan={3}>
                      {document.title}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-medium text-muted w-20">Size</td>
                    <td className="py-1.5 text-foreground w-20">
                      {formatFileSize(document.fileSize)}
                    </td>
                    <td className="py-1.5 font-medium text-muted w-24">Uploaded by</td>
                    <td className="py-1.5 text-foreground">
                      {document.owner.name || document.owner.email}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-medium text-muted">Created</td>
                    <td className="py-1.5 text-foreground" colSpan={3}>
                      {formatDate(document.createdAt)}
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1.5 font-medium text-muted">Type</td>
                    <td className="py-1.5 text-foreground break-all" colSpan={3}>
                      {document.fileType}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Document viewer */}
            <DocumentViewer documentId={document.id} className="h-[calc(100vh-240px)]" />
          </div>
        </div>
      </div>
    );
  } catch {
    redirect('/auth/signin');
  }
}
