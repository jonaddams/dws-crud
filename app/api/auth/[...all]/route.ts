import { toNextJsHandler } from 'better-auth/next-js';
import { auth } from '@/lib/auth-config';

// The catch-all moved from [...nextauth] to [...all]. Provider callback paths
// are unchanged (/api/auth/callback/google), so no Google Cloud Console edit was
// needed; Microsoft's is /api/auth/callback/microsoft.
export const { GET, POST } = toNextJsHandler(auth);
