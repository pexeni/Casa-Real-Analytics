/**
 * Database client.
 *
 * Uses @neondatabase/serverless (Vercel Postgres driver) + Drizzle ORM.
 * See: docs/design/mvp.md §5.
 *
 * NOTE: We deliberately don't throw on missing `POSTGRES_URL` at module load.
 * Next.js evaluates route modules during `next build` to collect page data,
 * and Auth.js' DrizzleAdapter introspects this `db` object eagerly at config
 * time. Throwing here would break builds whenever the env var isn't yet
 * provisioned (e.g. first deploy on Vercel before storage is wired).
 *
 * Queries against an empty URL will fail at request time, which is the
 * correct moment for a missing-env-var error to surface.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

// neon() is HTTP-based and only opens a connection when a query is actually
// run, so a placeholder URL is safe at build time. Real queries without a
// real POSTGRES_URL will fail at request time — exactly when we want them to.
const url = process.env.POSTGRES_URL ?? 'postgres://build-placeholder@localhost/db';
const sql = neon(url);

export const db = drizzle(sql, { schema });
export { schema };
