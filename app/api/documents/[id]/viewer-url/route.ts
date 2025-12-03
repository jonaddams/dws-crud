import { type NextRequest, NextResponse } from 'next/server';
import { getEffectiveDocumentFilter, requireAuth, type SessionUser } from '@/lib/auth';
import { nutrientAPIService } from '@/lib/nutrient-api';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/documents/[id]/viewer-url
 * Generate a Nutrient API viewer URL with session token
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const session = await requireAuth();
    const filter = getEffectiveDocumentFilter(session.user as SessionUser);

    // Check if document exists and user has access
    const document = await prisma.document.findFirst({
      where: {
        id,
        ...filter,
      },
      select: {
        id: true,
        documentEngineId: true,
        sessionToken: true,
        title: true,
      },
    });

    if (!document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    if (!document.documentEngineId) {
      return NextResponse.json(
        { error: 'Document upload incomplete - missing documentEngineId' },
        { status: 500 }
      );
    }

    // Use existing session token or create a new one if needed
    let sessionToken = document.sessionToken;

    if (!sessionToken) {
      // If no session token exists, create a new one
      const sessionData = await nutrientAPIService.createSession(document.documentEngineId);
      sessionToken = sessionData.sessionToken;

      // Update database with the new session token
      await prisma.document.update({
        where: { id },
        data: { sessionToken },
      });
    }

    return NextResponse.json({
      sessionToken,
      documentId: document.documentEngineId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes('Nutrient API')) {
      return NextResponse.json(
        { error: 'Failed to generate viewer access. Please check Nutrient API configuration.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ error: 'Failed to generate viewer URL' }, { status: 500 });
  }
}
