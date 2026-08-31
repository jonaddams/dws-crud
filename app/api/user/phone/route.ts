import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { startPhoneVerification } from '@/lib/phone-verification';
import { prisma } from '@/lib/prisma';

/**
 * The registration surface for SMS notifications.
 *
 * `POST` hands back a short code for the reader to text to our number. Nothing
 * comes back through the browser when that message arrives, so the page polls
 * `GET` to notice. That poll is the cost option B accepted in exchange for
 * never sending SMS to a number nobody has consented to.
 */

export async function POST() {
  try {
    const session = await requireAuth();

    const { code, expiresAt } = await startPhoneVerification({ userId: session.user.id });

    return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to start phone verification' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, phoneVerifiedAt: true },
    });

    return NextResponse.json({
      phone: user?.phone ?? null,
      verified: Boolean(user?.phoneVerifiedAt),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to load phone status' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const session = await requireAuth();

    await prisma.user.update({
      where: { id: session.user.id },
      data: { phone: null, phoneVerifiedAt: null },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to forget phone number' }, { status: 500 });
  }
}
