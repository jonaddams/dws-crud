import { UserRole, ImpersonationMode } from '@prisma/client';

declare module 'next-auth' {
  interface User {
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

declare module 'next-auth/jwt' {
  interface JWT {
    role?: UserRole;
    currentImpersonationMode?: ImpersonationMode;
  }
}
