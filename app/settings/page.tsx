import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DashboardHeader } from '@/components/dashboard-header';
import { NotificationSettings } from '@/components/notification-settings';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatProgramNumber } from '@/lib/sms-program';

/**
 * Settings → Notifications.
 *
 * This route exists because the A2P 10DLC filing describes it. The campaign's
 * published Call-to-Action tells a reviewer to sign in and "open Settings →
 * Notifications", where a single-use code is displayed — and until now that
 * screen did not exist, which is why the CTA could not be verified. The
 * registration backend was already complete; only this was missing.
 *
 * Data is read here rather than in the client component, following the house
 * split: server components fetch, client components handle interaction.
 */
export default async function SettingsPage() {
  try {
    const session = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { phone: true, phoneVerifiedAt: true, notificationChannel: true },
    });

    return (
      <div className="min-h-screen bg-surface">
        <DashboardHeader user={session.user} title="Settings" />

        <div className="max-w-3xl mx-auto sm:px-6 lg:px-8">
          <div className="px-4 py-6 sm:px-0 space-y-6">
            <nav className="text-sm">
              <Link href="/dashboard" className="text-primary hover:text-primary-hover">
                &larr; Back to documents
              </Link>
            </nav>

            <h2 className="text-lg font-medium text-foreground">Notifications</h2>

            <NotificationSettings
              initialPhone={user?.phone ?? null}
              initialVerified={Boolean(user?.phoneVerifiedAt)}
              initialChannel={user?.notificationChannel ?? 'EMAIL'}
              // The digits come from the environment so the screen always shows
              // the number the app actually receives on; the punctuation matches
              // what jonaddams.com/sms publishes.
              programNumber={formatProgramNumber(process.env.TWILIO_PHONE_NUMBER ?? '')}
            />
          </div>
        </div>
      </div>
    );
  } catch {
    redirect('/auth/signin');
  }
}
