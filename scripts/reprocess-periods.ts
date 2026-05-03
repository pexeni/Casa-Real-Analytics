/**
 * One-shot backfill: re-parse every uploaded period with the current parser
 * and rewrite its period_values. Use after a parser version bump that
 * extracts new rows (e.g. v0.1 → v0.2 added stats / saldos / KPIs).
 *
 * Skips periods whose pdf_blob_url is not an https:// Blob URL (legacy
 * local-fixture rows can't be re-fetched here).
 *
 * Run: npm run db:reprocess
 */
import { eq } from 'drizzle-orm';
import { get } from '@vercel/blob';
import { db, schema } from '@/lib/db';
import { parseRdsPdf, PARSER_VERSION } from '@/lib/parser';
import { normalizeConcept } from '@/lib/normalizer';
import type { IngestionStatus, ReportTypeId } from '@/lib/domain/types';

const REPORT_TYPE: ReportTypeId = 'RDS';

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchBlobBytes(url: string): Promise<Uint8Array> {
  const result = await get(url, { access: 'private' });
  if (!result || result.statusCode !== 200) {
    throw new Error(`blob get failed (status=${result?.statusCode ?? 'null'})`);
  }
  const reader = result.stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

async function reprocessPeriod(p: {
  id: string;
  period: string;
  pdfBlobUrl: string;
  pdfFilename: string;
}): Promise<'done' | 'skipped' | 'failed'> {
  if (!p.pdfBlobUrl.startsWith('https://')) {
    console.log(`  skip: non-Blob URL (${p.pdfBlobUrl})`);
    return 'skipped';
  }

  const startedAt = Date.now();
  const bytes = await fetchBlobBytes(p.pdfBlobUrl);
  const parsed = await parseRdsPdf(bytes);

  if (parsed.rows.length === 0) {
    console.log(`  skip: parser produced 0 rows`);
    return 'skipped';
  }

  // Normalize sequentially — concept auto-creation is not transaction-safe
  // under the HTTP driver. Mirrors /api/ingest.
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

  // Replace period_values for this period (FK-cascade-safe: period_values has
  // no incoming FKs).
  await db.delete(schema.periodValues).where(eq(schema.periodValues.periodId, p.id));
  await db.insert(schema.periodValues).values(
    normalized.map((n) => ({
      periodId: p.id,
      conceptId: n.conceptId,
      valorAcumulado: n.valorAcumulado.toString(),
      pctAcumulado: n.pctAcumulado === null ? null : n.pctAcumulado.toString(),
      valorHoy: n.valorHoy === null ? null : n.valorHoy.toString(),
      pctHoy: n.pctHoy === null ? null : n.pctHoy.toString(),
      source: 'deterministic' as const,
    })),
  );

  await db
    .update(schema.periods)
    .set({
      referenceDate: isoDate(parsed.referenceDate),
      parserVersion: PARSER_VERSION,
      status,
    })
    .where(eq(schema.periods.id, p.id));

  await db.insert(schema.ingestionEvents).values({
    periodId: p.id,
    step: 'parse',
    model: null,
    input: { reprocess: true, filename: p.pdfFilename },
    output: {
      hotel: parsed.hotel,
      rowCount: parsed.rows.length,
      warnings: parsed.warnings,
    },
    status,
    durationMs: Date.now() - startedAt,
  });

  console.log(
    `  ok: ${normalized.length} rows, status=${status}, warnings=${parsed.warnings.length}`,
  );
  return 'done';
}

async function main() {
  const periods = await db
    .select({
      id: schema.periods.id,
      period: schema.periods.period,
      pdfBlobUrl: schema.periods.pdfBlobUrl,
      pdfFilename: schema.periods.pdfFilename,
    })
    .from(schema.periods)
    .where(eq(schema.periods.reportTypeId, REPORT_TYPE));

  console.log(`Reprocessing ${periods.length} period(s) with ${PARSER_VERSION}...\n`);

  let done = 0, skipped = 0, failed = 0;
  for (const p of periods) {
    console.log(`→ ${p.period} (${p.pdfFilename})`);
    try {
      const r = await reprocessPeriod(p);
      if (r === 'done') done++;
      else if (r === 'skipped') skipped++;
    } catch (err) {
      failed++;
      console.error(`  ERROR:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n✓ Done — ${done} reprocessed, ${skipped} skipped, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Reprocess failed:', err);
  process.exit(1);
});
