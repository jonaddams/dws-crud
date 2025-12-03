import type { Prisma } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';
import { getEffectiveDocumentFilter, requireAuth, type SessionUser } from '@/lib/auth';
import { nutrientAPIService } from '@/lib/nutrient-api';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/documents
 * List all documents for the current user (with role-based filtering)
 * Supports search, filtering, and sorting query parameters
 */
export async function GET(request: NextRequest) {
  try {
    const session = await requireAuth();
    const baseFilter = getEffectiveDocumentFilter(session.user as SessionUser);

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search')?.trim();
    const fileType = searchParams.get('fileType')?.trim();
    const author = searchParams.get('author')?.trim();
    const sortBy = searchParams.get('sortBy') || 'createdAt';
    const sortOrder = searchParams.get('sortOrder') || 'desc';

    // Build where clause with search and filters
    const whereClause: Prisma.DocumentWhereInput = { ...baseFilter };

    // Add search functionality - search across title, filename, and author
    if (search) {
      whereClause.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } },
        { author: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Add file type filter
    if (fileType && fileType !== 'all') {
      whereClause.fileType = { contains: fileType, mode: 'insensitive' };
    }

    // Add author filter
    if (author && author !== 'all') {
      whereClause.author = { contains: author, mode: 'insensitive' };
    }

    // Validate and set sort parameters
    const validSortFields = [
      'title',
      'filename',
      'fileType',
      'fileSize',
      'author',
      'createdAt',
      'updatedAt',
    ];
    const validSortOrders = ['asc', 'desc'];

    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
    const finalSortOrder = validSortOrders.includes(sortOrder) ? sortOrder : 'desc';

    const documents = await prisma.document.findMany({
      where: whereClause,
      select: {
        id: true,
        documentEngineId: true,
        sessionToken: true,
        title: true,
        filename: true,
        fileType: true,
        fileSize: true,
        author: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        [finalSortBy]: finalSortOrder,
      },
    });

    // Convert BigInt fileSize to string for JSON serialization
    const serializedDocuments = documents.map((doc) => ({
      ...doc,
      fileSize: doc.fileSize?.toString(),
    }));

    return NextResponse.json({ documents: serializedDocuments });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
  }
}

/**
 * POST /api/documents
 * Upload a new document
 */
export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const title = formData.get('title') as string;
    const author = formData.get('author') as string;

    if (!file) {
      return NextResponse.json({ error: 'File is required' }, { status: 400 });
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    // Validate file size (250MB limit)
    const MAX_FILE_SIZE = 250 * 1024 * 1024; // 250MB
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File size must be less than 250MB' }, { status: 400 });
    }

    // Upload to Nutrient API with retry logic
    const nutrientResult = await nutrientAPIService.withRetry(() =>
      nutrientAPIService.uploadDocument(file)
    );

    // Store metadata in database
    const document = await prisma.document.create({
      data: {
        documentEngineId: nutrientResult.documentId,
        sessionToken: nutrientResult.sessionToken,
        title,
        filename: file.name,
        fileType: file.type,
        fileSize: BigInt(file.size),
        author: author || session.user.name || session.user.email || 'Unknown',
        ownerId: session.user.id,
      },
      select: {
        id: true,
        documentEngineId: true,
        sessionToken: true,
        title: true,
        filename: true,
        fileType: true,
        fileSize: true,
        author: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Convert BigInt to string for JSON serialization
    const serializedDocument = {
      ...document,
      fileSize: document.fileSize?.toString(),
    };

    return NextResponse.json({ document: serializedDocument }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof Error && error.message.includes('Nutrient API')) {
      return NextResponse.json(
        { error: 'Document upload failed. Please try again.' },
        { status: 503 }
      );
    }

    return NextResponse.json({ error: 'Failed to upload document' }, { status: 500 });
  }
}
