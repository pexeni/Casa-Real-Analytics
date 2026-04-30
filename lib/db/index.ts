/**
 * Database client.
 *
 * Uses @neondatabase/serverless (Vercel Postgres driver) + Drizzle ORM.
 * See: docs/design/mvp.md §5.
 */
import { drizzle } from 'drizzle-orm/neon-http';
import { neon } from '@neondatabase/serverless';
import * as schema from './schema';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL is not set');
}

const sql = neon(process.env.POSTGRES_URL);

export const db = drizzle(sql, { schema });
export { schema };
