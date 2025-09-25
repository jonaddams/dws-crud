// Global TypeScript declarations for the Nutrient API CRUD App

import type { UserRole, ImpersonationMode } from '@prisma/client';

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
declare global {
  interface Window {
    NutrientViewer: {
      load(config: {
        container: HTMLElement;
        session: string;
        [key: string]: unknown;
      }): Promise<unknown>;
      unload(container: HTMLElement): Promise<void>;
    };
  }
}

export {};
