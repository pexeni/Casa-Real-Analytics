/**
 * DELETE /api/periods/:id — remove a period and cascade its values.
 * POST   /api/periods/:id/reprocess — re-run ingestion from the kept Blob URL.
 * See: docs/design/mvp.md §8 (UI Acciones).
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export const runtime = 'nodejs';

export async function DELETE(
  _req: Request,
  _ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({ error: 'Not implemented yet' }, { status: 501 });
}
