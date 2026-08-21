// Global TypeScript declarations for the Nutrient API CRUD App

import type { ImpersonationMode, UserRole } from '@prisma/client';

// Extend NextAuth types
declare module 'next-auth' {
  interface User {
    id: string;
    role?: UserRole;
    currentImpersonationMode?: ImpersonationMode;
  }

  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role?: UserRole;
      currentImpersonationMode?: ImpersonationMode;
    };
  }
}

// Nutrient Viewer API types

// This file is a module (it imports Prisma types), so these have to live inside
// `declare global` to be visible without an import.
declare global {
  /**
   * A person the mention menu can offer. `id` must be our own user ID: the SDK
   * hands the same value back through `Comment.getMentionedUserIds()`, so mentions
   * resolve to accounts without matching on names.
   */
  type NutrientMentionableUser = {
    id: string;
    name: string;
    displayName: string;
    description?: string;
    avatarUrl?: string;
  };

  /**
   * Only the pieces of the viewer instance this app uses.
   *
   * The `comments.mention` payload is deliberately typed as `unknown`. The browser
   * is not trusted to report who was mentioned — the event is a nudge to make the
   * server re-read DWS, nothing more — so nothing here should be tempted to read it.
   */
  type NutrientViewerInstance = {
    addEventListener(event: 'comments.mention', handler: (payload: unknown) => void): void;
    removeEventListener(event: 'comments.mention', handler: (payload: unknown) => void): void;
  };

  interface Window {
    NutrientViewer: {
      load(config: {
        container: HTMLElement;
        session: string;
        useCDN?: boolean; // Load assets from CDN instead of local. Requires viewer >= 1.9.1
        baseUrl?: string; // Custom base URL for self-hosted assets
        mentionableUsers?: NutrientMentionableUser[];
        [key: string]: unknown;
      }): Promise<NutrientViewerInstance>;
      unload(container: HTMLElement): Promise<void>;
    };
  }
}
