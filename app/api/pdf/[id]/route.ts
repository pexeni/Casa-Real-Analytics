/**
 * GET /api/pdf/:id — authenticated proxy for the period's PDF stored in
 * Vercel Blob (private store). The blob URL is never exposed to the
 * browser; we look it up by period id, fetch via the Blob SDK, and stream
 * the bytes back inline so the browser opens it in a tab.
 */
import { NextResponse } from 'next/server';
import { get } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;

  const [period] = await db
    .select({
      pdfBlobUrl: schema.periods.pdfBlobUrl,
      pdfFilename: schema.periods.pdfFilename,
    })
    .from(schema.periods)
    .where(eq(schema.periods.id, id))
    .limit(1);

  if (!period) {
    return NextResponse.json({ error: 'Period not found' }, { status: 404 });
  }
  // Local-fixture rows use `local://...` URLs; nothing to stream.
  if (!period.pdfBlobUrl.startsWith('https://')) {
    return NextResponse.json({ error: 'PDF not stored in Blob' }, { status: 410 });
  }

  const result = await get(period.pdfBlobUrl, { access: 'private' });
  if (!result || result.statusCode !== 200) {
    return NextResponse.json({ error: 'PDF not found in Blob' }, { status: 404 });
  }

  // Inline disposition lets the browser render it in a tab; the filename is
  // still set so "Save as..." picks it up.
  const safeName = period.pdfFilename.replace(/"/g, '');
  return new NextResponse(result.stream, {
    status: 200,
    headers: {
      'Content-Type': result.blob.contentType ?? 'application/pdf',
      'Content-Length': String(result.blob.size),
      'Content-Disposition': `inline; filename="${safeName}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
