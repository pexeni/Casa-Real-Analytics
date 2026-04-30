/**
 * Next 16 proxy (formerly middleware) — protects everything outside `/login`
 * behind Auth.js. Uses the runtime-agnostic `auth.config` (no DB / Node-only
 * deps) so it can run on the edge.
 *
 * NB: Auth.js v5's `authorized` callback alone doesn't auto-redirect under
 * Next 16's proxy convention — we redirect explicitly here.
 */
import NextAuth from 'next-auth';
import { NextResponse } from 'next/server';
import { authConfig } from './auth.config';

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isOnLogin = req.nextUrl.pathname.startsWith('/login');
  if (!req.auth && !isOnLogin) {
    const loginUrl = new URL('/login', req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  return undefined;
});

export const config = {
  // Run on everything except Next internals + static assets + the auth API itself.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
