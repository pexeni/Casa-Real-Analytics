/**
 * DELETE /api/periods/:id — remove a period and its values + Blob PDF.
 * See: docs/design/mvp.md §8 (UI Acciones).
 *
 * period_values cascades automatically (FK ON DELETE CASCADE).
 * ingestion_events are kept (period_id is nullable on cascade).
 * The Blob is deleted best-effort — a failure there doesn't roll back the row.
 */
import { NextResponse } from 'next/server';
import { del } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const [period] = await db
    .select({ id: schema.periods.id, pdfBlobUrl: schema.periods.pdfBlobUrl })
    .from(schema.periods)
    .where(eq(schema.periods.id, id))
    .limit(1);

  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  }

  await db.delete(schema.periods).where(eq(schema.periods.id, id));

  // Best-effort Blob cleanup — local fixtures use `local://...` and won't be
  // valid Blob URLs, so swallow errors.
  if (period.pdfBlobUrl.startsWith('https://')) {
    try {
      await del(period.pdfBlobUrl);
    } catch {
      // ignore — the DB row is gone, that's the source of truth.
    }
  }

  return NextResponse.json({ deleted: id });
}
