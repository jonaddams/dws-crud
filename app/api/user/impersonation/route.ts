import type { ImpersonationMode } from '@prisma/client';
import { type NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const session = await requireAuth();

    // Only admins can change impersonation mode
    if (session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Only admins can change impersonation mode' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { mode }: { mode: ImpersonationMode } = body;

    // Validate the impersonation mode
    if (!['SELF', 'USER'].includes(mode)) {
      return NextResponse.json({ error: 'Invalid impersonation mode' }, { status: 400 });
    }

    // Update the user's impersonation mode
    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: { currentImpersonationMode: mode },
      select: {
        id: true,
        role: true,
        currentImpersonationMode: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to update impersonation mode' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await requireAuth();

    return NextResponse.json({
      currentMode: session.user.currentImpersonationMode || 'SELF',
      canImpersonate: session.user.role === 'ADMIN',
    });
  } catch (_error) {
    return NextResponse.json({ error: 'Failed to fetch impersonation status' }, { status: 500 });
  }
}
