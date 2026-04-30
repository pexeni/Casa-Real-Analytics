/**
 * POST /api/ingest — accept an RDS PDF, parse, persist, return summary.
 *
 * Flow:
 *   1. Auth + multipart parse (file field, ≤10MB, application/pdf).
 *   2. Read into buffer, parse FIRST (cheap fail before Blob upload).
 *   3. Upload PDF to Vercel Blob.
 *   4. Normalize each parsed row → conceptId.
 *   5. Upsert period (ON CONFLICT on (reportTypeId, period) replaces metadata
 *      while preserving the row id, so FKs from period_values + audit stay valid).
 *   6. Replace period_values for that periodId.
 *   7. Insert ingestion_events audit row.
 *
 * See: docs/design/mvp.md §6.
 */
import { NextResponse } from 'next/server';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { auth } from '@/auth';
import { db, schema } from '@/lib/db';
import { parseRdsPdf, PARSER_VERSION } from '@/lib/parser';
import { normalizeConcept } from '@/lib/normalizer';
import type { IngestionStatus, ReportTypeId } from '@/lib/domain/types';

export const runtime = 'nodejs';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB
const REPORT_TYPE: ReportTypeId = 'RDS';

function firstOfMonth(d: Date): string {
  // Drizzle's `date` column accepts 'YYYY-MM-DD' strings.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}-01`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  const startedAt = Date.now();

  // 1. Parse multipart form
  let file: File;
  try {
    const form = await req.formData();
    const f = form.get('file');
    if (!(f instanceof File)) {
      return NextResponse.json(
        { error: 'Missing or invalid `file` field' },
        { status: 400 },
      );
    }
    file = f;
  } catch {
    return NextResponse.json(
      { error: 'Invalid multipart form' },
      { status: 400 },
    );
  }

  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json(
      { error: `File too large (max ${MAX_PDF_BYTES / 1024 / 1024} MB)` },
      { status: 413 },
    );
  }
  if (file.type && file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'File must be application/pdf' },
      { status: 415 },
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // 2. Parse first — cheaper to fail before persisting anything.
  let parsed;
  try {
    parsed = await parseRdsPdf(bytes);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'Could not parse PDF',
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 422 },
    );
  }

  if (parsed.rows.length === 0) {
    return NextResponse.json(
      { error: 'PDF parsed but contained no concept rows', warnings: parsed.warnings },
      { status: 422 },
    );
  }

  // 3. Upload to Vercel Blob.
  const periodKey = firstOfMonth(parsed.referenceDate);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const blob = await put(`rds/${periodKey}/${Date.now()}-${safeName}`, file, {
    access: 'public',
    contentType: 'application/pdf',
  });

  // 4. Normalize rows → conceptIds (sequential to keep concept auto-creation safe
  // under the HTTP driver, which has no real transactions).
  const normalized: Array<{
    conceptId: string;
    valorAcumulado: number;
    pctAcumulado: number | null;
    valorHoy: number | null;
    pctHoy: number | null;
  }> = [];
  for (const row of parsed.rows) {
    const { concept } = await normalizeConcept(row.rawName, row.groupName, REPORT_TYPE);
    normalized.push({
      conceptId: concept.id,
      valorAcumulado: row.valorAcumulado,
      pctAcumulado: row.pctAcumulado,
      valorHoy: row.valorHoy,
      pctHoy: row.pctHoy,
    });
  }

  const status: IngestionStatus = parsed.warnings.length > 0 ? 'partial' : 'success';

  // 5. Upsert period.
  const [period] = await db
    .insert(schema.periods)
    .values({
      reportTypeId: REPORT_TYPE,
      period: periodKey,
      referenceDate: isoDate(parsed.referenceDate),
      pdfBlobUrl: blob.url,
      pdfFilename: file.name,
      uploadedBy: userId,
      parserVersion: PARSER_VERSION,
      status,
    })
    .onConflictDoUpdate({
      target: [schema.periods.reportTypeId, schema.periods.period],
      set: {
        referenceDate: isoDate(parsed.referenceDate),
        pdfBlobUrl: blob.url,
        pdfFilename: file.name,
        uploadedBy: userId,
        uploadedAt: new Date(),
        parserVersion: PARSER_VERSION,
        status,
      },
    })
    .returning({ id: schema.periods.id });

  // 6. Replace period_values for this period.
  await db.delete(schema.periodValues).where(eq(schema.periodValues.periodId, period.id));

  // Insert in chunks just in case row counts grow (currently ~32 per fixture).
  if (normalized.length > 0) {
    await db.insert(schema.periodValues).values(
      normalized.map((n) => ({
        periodId: period.id,
        conceptId: n.conceptId,
        valorAcumulado: n.valorAcumulado.toString(),
        pctAcumulado: n.pctAcumulado === null ? null : n.pctAcumulado.toString(),
        valorHoy: n.valorHoy === null ? null : n.valorHoy.toString(),
        pctHoy: n.pctHoy === null ? null : n.pctHoy.toString(),
        source: 'deterministic' as const,
      })),
    );
  }

  // 7. Audit.
  await db.insert(schema.ingestionEvents).values({
    periodId: period.id,
    step: 'parse',
    model: null,
    input: { filename: file.name, size: file.size },
    output: {
      hotel: parsed.hotel,
      rowCount: parsed.rows.length,
      warnings: parsed.warnings,
    },
    status,
    durationMs: Date.now() - startedAt,
  });

  return NextResponse.json({
    periodId: period.id,
    period: periodKey,
    referenceDate: isoDate(parsed.referenceDate),
    rowCount: normalized.length,
    warnings: parsed.warnings,
    status,
  });
}
