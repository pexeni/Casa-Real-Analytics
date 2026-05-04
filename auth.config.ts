/**
 * Auth.js v5 — runtime-agnostic config (safe for Edge middleware).
 *
 * Access control: only emails listed in env `USER_CREDENTIALS` (parsed in
 * auth.ts authorize()) can sign in. Adding/removing a user is a deploy.
 *
 * See: docs/design/mvp.md §8 (Auth + UI).
 */
import type { NextAuthConfig } from 'next-auth';

export const authConfig = {
  pages: {
    signIn: '/login',
  },
  callbacks: {
    authorized({ auth, request }) {
      const isLoggedIn = !!auth?.user;
      const isOnApp = !request.nextUrl.pathname.startsWith('/login');
      if (isOnApp) return isLoggedIn;
      return true;
    },
    // With JWT strategy the adapter still creates the user row, but the
    // user.id only reaches the JWT during sign-in. Persist it on `token.sub`
    // and rehydrate it onto session.user.id on every read so API routes
    // (which check `session.user.id`) can authorize correctly.
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
