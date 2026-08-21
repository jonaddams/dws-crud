import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/mentionable-users
 *
 * The directory the viewer's mention menu is populated from, shaped as the Web
 * SDK's `MentionableUser`.
 *
 * `id` is the app's own user ID on purpose. The SDK hands that same value back
 * through `Comment.getMentionedUserIds()`, so a mention resolves to an account
 * with no name matching anywhere.
 *
 * Everyone with an account is mentionable — the feature is scoped to existing
 * users, so there is no guest to represent here.
 */
export async function GET() {
  try {
    await requireAuth();

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, image: true },
      orderBy: { name: 'asc' },
    });

    const mentionableUsers = users.map((user) => ({
      id: user.id,
      name: user.name ?? user.email,
      displayName: user.name ?? user.email,
      // The SDK shows this under the name in the mention list.
      description: user.email,
      ...(user.image ? { avatarUrl: user.image } : {}),
    }));

    return NextResponse.json({ mentionableUsers });
  } catch (error) {
    if (error instanceof Error && error.message === 'Authentication required') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Failed to load mentionable users' }, { status: 500 });
  }
}
