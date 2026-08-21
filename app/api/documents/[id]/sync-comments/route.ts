import { type NextRequest, NextResponse } from 'next/server';
import { getEffectiveDocumentFilter, requireAuth, type SessionUser } from '@/lib/auth';
import { notifyPendingMentions } from '@/lib/notify-mentions';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/documents/[id]/sync-comments
 *
 * The client hint. DWS has no webhooks, so the browser tells us a document's
 * comments changed and the server goes and looks.
 *
 * The request body is deliberately ignored. The browser says only "this document
 * changed" and is never believed about what changed or who was mentioned — the
 * server re-reads DWS and decides for itself. A caller can therefore cause extra
 * work, but cannot invent a mention or send an email to someone of their
 * choosing.
 *
 * Access is still checked: the caller must be able to see the document under the
 * same filter used everywhere else, so this cannot be used to probe for documents
 * belonging to other people.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const filter = getEffectiveDocumentFilter(session.user as SessionUser);

    const document = await prisma.document.findFirst({
      where: { id, ...filter },
      select: { id: true },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const result = await notifyPendingMentions({ documentId: document.id });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to sync comments' }, { status: 500 });
  }
}
