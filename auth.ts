/**
 * Auth.js v5 — full server-side instance with Drizzle adapter + Resend provider.
 *
 * Imported by:
 *   - app/api/auth/[...nextauth]/route.ts
 *   - any server component / server action needing the current session
 */
import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Resend from 'next-auth/providers/resend';
import { authConfig } from './auth.config';
import { db } from '@/lib/db';

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  session: { strategy: 'database' },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM ?? 'noreply@example.com',
    }),
  ],
});
