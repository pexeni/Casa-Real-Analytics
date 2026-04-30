/**
 * PDF parser for RDS reports.
 *
 * Strategy: deterministic-first using `unpdf` for text extraction + regex/heuristics
 * tuned to the RDS template. LLM fallback is invoked from `lib/normalizer` and
 * (for failed sanity checks) from this module via `repairBlock`.
 *
 * See: docs/design/mvp.md §6 (Ingestion Pipeline).
 */
import type { RawParsedReport } from '@/lib/domain/types';

export const PARSER_VERSION = 'rds-v0.0.0-skeleton';

/**
 * Parse an RDS PDF buffer into a raw structured form.
 * TODO: implement against tests/fixtures/rds-2026-01.pdf as the golden fixture.
 */
export async function parseRdsPdf(_pdfBytes: Uint8Array): Promise<RawParsedReport> {
  throw new Error('parseRdsPdf: not implemented yet (see docs/design/mvp.md §6)');
}

/** Argentine number parser. `"1.293.462,42"` → `1293462.42`. */
export function parseARNumber(_input: string): number {
  throw new Error('parseARNumber: not implemented yet');
}
