/**
 * Edge middleware — protects everything outside `/login` behind Auth.js.
 * Uses the runtime-agnostic auth.config (no DB / Node-only deps).
 */
import NextAuth from 'next-auth';
import { authConfig } from './auth.config';

export const { auth: middleware } = NextAuth(authConfig);

export default middleware((req) => {
  // Authorized callback in authConfig handles the redirect logic.
  return undefined;
});

export const config = {
  // Run on everything except Next internals + static assets + the auth API itself.
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
