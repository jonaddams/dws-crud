'use client';

import Link from 'next/link';
import { RoleSwitcher } from '@/components/role-switcher';
import { ThemeToggle } from '@/components/theme-toggle';
import type { SessionUser } from '@/lib/auth';

type DashboardHeaderProps = {
  user: SessionUser;
};

export function DashboardHeader({ user }: DashboardHeaderProps) {
  return (
    <div className="bg-background shadow border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4 sm:py-6">
          <div className="flex items-center">
            <h1 className="text-lg sm:text-2xl font-bold text-foreground">Dashboard</h1>
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
              <Link
                href="/api/auth/signout"
                className="text-xs sm:text-sm text-primary hover:text-primary-hover transition-colors cursor-pointer"
              >
                Sign out
              </Link>
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
