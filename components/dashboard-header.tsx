'use client';

import Link from 'next/link';
import { RoleSwitcher } from '@/components/role-switcher';
import { SignOutButton } from '@/components/sign-out-button';
import { ThemeToggle } from '@/components/theme-toggle';
import type { SessionUser } from '@/lib/auth';

type DashboardHeaderProps = {
  user: SessionUser;
  /** Defaults to "Dashboard"; set by pages that reuse this header. */
  title?: string;
};

export function DashboardHeader({ user, title = 'Dashboard' }: DashboardHeaderProps) {
  return (
    <div className="bg-background shadow border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 sm:py-6">
          <div className="flex items-center">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">{title}</h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-4">
            <div className="hidden sm:block">
              <RoleSwitcher />
            </div>
            <ThemeToggle />
            <div className="flex items-center space-x-2 sm:space-x-4">
              <span className="text-xs sm:text-sm text-muted truncate max-w-20 sm:max-w-none">
                {user.name || user.email}
              </span>
              {/* Reachable from every page on purpose: the A2P filing tells a
                  carrier reviewer to open Settings → Notifications, so the route
                  has to be findable without knowing the URL. */}
              <Link
                href="/settings"
                className="text-xs sm:text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer"
              >
                Settings
              </Link>
              <SignOutButton />
            </div>
          </div>
        </div>
        {/* Mobile role switcher */}
        <div className="block sm:hidden pb-4">
          <RoleSwitcher />
        </div>
      </div>
    </div>
  );
}
