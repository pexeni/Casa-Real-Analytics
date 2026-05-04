/**
 * Auth.js v5 — full server-side instance with Drizzle adapter + Credentials.
 *
 * Imported by:
 *   - app/api/auth/[...nextauth]/route.ts
 *   - any server component / server action needing the current session
 *
 * Credentials live in env `USER_CREDENTIALS` as a comma-separated list of
 * `email:password` pairs. authorize() upserts the user row on first sign-in
 * so foreign keys (e.g. periods.uploadedById) keep working with stable IDs.
 */
import { timingSafeEqual as cryptoTimingSafeEqual } from 'node:crypto';
import NextAuth from 'next-auth';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import Credentials from 'next-auth/providers/credentials';
import { eq } from 'drizzle-orm';
import { authConfig } from './auth.config';
import { db, schema } from '@/lib/db';

function parseUserCredentials(raw: string | undefined): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of (raw ?? '').split(',')) {
    const idx = pair.indexOf(':');
    if (idx <= 0) continue;
    const email = pair.slice(0, idx).trim().toLowerCase();
    const pass = pair.slice(idx + 1).trim();
    if (email && pass) map.set(email, pass);
  }
  return map;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return cryptoTimingSafeEqual(ab, bb);
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  // JWT strategy lets the edge proxy read sessions without DB access.
  // Adapter still persists users so userId FKs (e.g. periods.uploadedById)
  // resolve to a stable row.
  session: { strategy: 'jwt' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        const email = String(credentials?.email ?? '').toLowerCase().trim();
        const password = String(credentials?.password ?? '');
        if (!email || !password) return null;

        const creds = parseUserCredentials(process.env.USER_CREDENTIALS);
        const expected = creds.get(email);
        if (!expected || !safeEqual(expected, password)) return null;

        const [existing] = await db
          .select()
          .from(schema.users)
          .where(eq(schema.users.email, email))
          .limit(1);
        if (existing) {
          return { id: existing.id, email: existing.email, name: existing.name ?? undefined };
        }

        const id = crypto.randomUUID();
        await db.insert(schema.users).values({ id, email, emailVerified: new Date() });
        return { id, email };
      },
    }),
  ],
});
