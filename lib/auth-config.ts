import { PrismaAdapter } from '@next-auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from './prisma';

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user }) {
      // Only allow users with nutrient.io or pspdfkit.com email domains
      if (!user.email) {
        return false;
      }

      const allowedDomains = ['nutrient.io', 'pspdfkit.com'];
      const emailDomain = user.email.split('@')[1];

      return allowedDomains.includes(emailDomain);
    },
    async session({ session, user }) {
      if (session.user) {
        // Add user ID and role to session
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email || '' },
          select: {
            id: true,
            role: true,
            currentImpersonationMode: true,
          },
        });

        if (dbUser) {
          session.user.id = dbUser.id;
          session.user.role = dbUser.role;
          session.user.currentImpersonationMode = dbUser.currentImpersonationMode;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
  session: {
    strategy: 'database',
  },
};
