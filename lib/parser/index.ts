/**
 * PDF parser for RDS reports.
 *
 * Strategy: deterministic-first using `unpdf` for text extraction + regex/heuristics
 * tuned to the RDS template. LLM fallback is invoked from `lib/normalizer` and
 * (for failed sanity checks) from this module via `repairBlock`.
 *
 * See: docs/design/mvp.md §6 (Ingestion Pipeline).
 */
import { extractText, getDocumentProxy } from 'unpdf';
import type { RawParsedReport, RawParsedRow } from '@/lib/domain/types';

export const PARSER_VERSION = 'rds-v0.1.0';

/**
 * Argentine number format: thousands `.`, decimal `,`, always 2 decimal places.
 *   "1.293.462,42" → 1293462.42
 *   "-3.016,53"    → -3016.53
 *   "0,00"         → 0
 */
const AR_NUMBER = String.raw`-?[\d.]+,\d{2}`;

/**
 * Concept row pattern. PDF text extraction concatenates `valorHoy` directly
 * with the concept name and `valorAcumulado` directly with `pctHoy`, e.g.:
 *
 *   "4.693.703,97ALOJAMIENTO 154.613.728,1865,53 71,65"
 *    └ valorHoy ┘└─ name ──┘└ valorAcum ┘└ pctH ┘ └pctA┘
 *
 * The lazy `(.+?)` for the name relies on the trailing space-then-number anchor
 * to disambiguate names that contain spaces ("ANULACIONES Y DESCUENTOS").
 */
const ROW_REGEX = new RegExp(
  `^(${AR_NUMBER})(.+?) (${AR_NUMBER})(${AR_NUMBER}) (${AR_NUMBER})$`,
);

const GROUP_REGEX = /^Grupo (.+)$/;
const FECHA_REGEX = /Fecha:\s*(\d{2})\/(\d{2})\/(\d{4})/;

/** `"1.293.462,42"` → `1293462.42`. Throws on malformed input. */
export function parseARNumber(input: string): number {
  if (!input || !/^-?[\d.]+,\d{2}$/.test(input)) {
    throw new Error(`Invalid Argentine number: ${JSON.stringify(input)}`);
  }
  const cleaned = input.replace(/\./g, '').replace(',', '.');
  const num = Number(cleaned);
  if (Number.isNaN(num)) {
    throw new Error(`Invalid Argentine number: ${JSON.stringify(input)}`);
  }
  return num;
}

/**
 * Parse an RDS PDF buffer into a raw structured form.
 *
 * Extracts:
 *   - Hotel name (first non-empty line)
 *   - Reference date (`Fecha: dd/mm/yyyy` in header)
 *   - One row per concept line within a `Grupo X` section
 *
 * Statistics and KPI sections are intentionally NOT parsed here — their layout
 * is irregular and is handled separately (LLM fallback or future iteration).
 */
export async function parseRdsPdf(pdfBytes: Uint8Array): Promise<RawParsedReport> {
  const pdf = await getDocumentProxy(pdfBytes);
  // mergePages: false returns string[] (one entry per page) preserving the
  // intra-page newlines that unpdf strips when merging.
  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  const fullText = pages.join('\n');

  const lines = fullText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // ─── Header ────────────────────────────────────────────────────────────────
  const hotel = lines[0] ?? 'UNKNOWN';

  let referenceDate: Date | null = null;
  for (const line of lines) {
    const m = line.match(FECHA_REGEX);
    if (m) {
      const [, dd, mm, yyyy] = m;
      referenceDate = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
      break;
    }
  }
  if (!referenceDate) {
    throw new Error('parseRdsPdf: could not extract Fecha from PDF header');
  }

  // ─── Body: rows + groups ───────────────────────────────────────────────────
  const rows: RawParsedRow[] = [];
  const warnings: string[] = [];
  let currentGroup = '';

  for (const line of lines) {
    const groupMatch = line.match(GROUP_REGEX);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      continue;
    }

    const rowMatch = line.match(ROW_REGEX);
    if (!rowMatch) continue;

    const [, vhRaw, nameRaw, vaRaw, phRaw, paRaw] = rowMatch;
    const rawName = nameRaw.trim();

    if (!currentGroup) {
      warnings.push(`Row "${rawName}" found before any group header — skipped`);
      continue;
    }

    rows.push({
      rawName,
      groupName: currentGroup,
      valorHoy: parseARNumber(vhRaw),
      valorAcumulado: parseARNumber(vaRaw),
      pctHoy: parseARNumber(phRaw),
      pctAcumulado: parseARNumber(paRaw),
    });
  }

  return {
    hotel,
    referenceDate,
    rows,
    warnings,
  };
}
