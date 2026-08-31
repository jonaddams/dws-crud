import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
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

const unauthorized = () => NextResponse.json({ error: 'Authentication required' }, { status: 401 });

export async function POST() {
  const session = await getSession();
  if (!session?.user?.id) return unauthorized();

  const { code, expiresAt } = await startPhoneVerification({ userId: session.user.id });

  return NextResponse.json({ code, expiresAt: expiresAt.toISOString() });
}

export async function GET() {
  const session = await getSession();
  if (!session?.user?.id) return unauthorized();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { phone: true, phoneVerifiedAt: true },
  });

  return NextResponse.json({
    phone: user?.phone ?? null,
    verified: Boolean(user?.phoneVerifiedAt),
  });
}

export async function DELETE() {
  const session = await getSession();
  if (!session?.user?.id) return unauthorized();

  await prisma.user.update({
    where: { id: session.user.id },
    data: { phone: null, phoneVerifiedAt: null },
  });

  return NextResponse.json({ ok: true });
}
