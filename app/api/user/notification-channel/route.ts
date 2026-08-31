import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const CHANNELS = ['EMAIL', 'SMS', 'BOTH'] as const;

type Channel = (typeof CHANNELS)[number];

const isChannel = (value: unknown): value is Channel =>
  typeof value === 'string' && CHANNELS.some((channel) => channel === value);

export async function PATCH(request: Request) {
  try {
    const session = await requireAuth();

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Malformed body' }, { status: 400 });
    }

    const channel = (body as { channel?: unknown })?.channel;

    if (!isChannel(channel)) {
      return NextResponse.json({ error: 'Unknown channel' }, { status: 400 });
    }

    // Choosing SMS without a verified number would silently drop every
    // notification: the notifier has nowhere to send, and the user sees
    // nothing at all. Refuse the state rather than create it.
    if (channel !== 'EMAIL') {
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { phoneVerifiedAt: true },
      });

      if (!user?.phoneVerifiedAt) {
        return NextResponse.json({ error: 'Verify a phone number first' }, { status: 409 });
      }
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { notificationChannel: channel },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to update notification channel' }, { status: 500 });
  }
}
