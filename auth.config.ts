/**
 * Auth.js v5 — runtime-agnostic config (safe for Edge middleware).
 *
 * Allowlist-based access: only emails in env `ALLOWED_EMAILS` (comma-separated)
 * can sign in. No admin UI for MVP — adding/removing a user is a deploy.
 *
 * See: docs/design/mvp.md §8 (Auth + UI).
 */
import type { NextAuthConfig } from 'next-auth';

const allowedEmails = (process.env.ALLOWED_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const authConfig = {
  pages: {
    signIn: '/login',
    verifyRequest: '/login/verify',
  },
  callbacks: {
    signIn({ user }) {
      if (!user.email) return false;
      return allowedEmails.includes(user.email.toLowerCase());
    },
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp = !request.nextUrl.pathname.startsWith('/login');
      if (isOnApp) return isLoggedIn;
      return true;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
