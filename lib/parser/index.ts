/**
 * PDF parser for RDS reports.
 *
 * Strategy:
 *   - Body groups (HOSPEDAJE, A&B, …): line-based regex on the merged text.
 *   - Stats / Saldos / KPIs: positional extraction using PDF text item
 *     coordinates. The PDF lays these sections in two columns where unpdf's
 *     line extractor scrambles labels and values into separate text blocks;
 *     coords let us reconstruct visual rows by matching label_y ± Y_TOL with
 *     value items in known column X-ranges.
 *
 * See: docs/design/mvp.md §6 (Ingestion Pipeline).
 */
import { extractText, getDocumentProxy } from 'unpdf';
import type { RawParsedReport, RawParsedRow } from '@/lib/domain/types';

export const PARSER_VERSION = 'rds-v0.2.1';

/**
 * Argentine number format: thousands `.`, decimal `,`, 1 or 2 decimal places.
 * Most values come with 2 decimals, but the PMS occasionally truncates a
 * trailing zero (`505235780,9` instead of `505235780,90`), notably on some
 * Saldo rows.
 *   "1.293.462,42" → 1293462.42
 *   "-3.016,53"    → -3016.53
 *   "0,00"         → 0
 *   "505235780,9"  → 505235780.9
 */
const AR_NUMBER = String.raw`-?[\d.]+,\d{1,2}`;

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
  if (!input || !/^-?[\d.]+,\d{1,2}$/.test(input)) {
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
 *   - One row per concept line within a `Grupo X` section (deterministic,
 *     line-based)
 *   - One row per stat / saldo / KPI from the right-hand and bottom blocks
 *     (positional, coord-based)
 */
export async function parseRdsPdf(pdfBytes: Uint8Array): Promise<RawParsedReport> {
  const pdf = await getDocumentProxy(pdfBytes);

  // Two extraction modes from the same PDF:
  //   1. Merged text (mergePages: false → string[] per page) for the line-based
  //      regex pass over the body groups. unpdf strips inter-page newlines when
  //      mergePages is true.
  //   2. Positional items (page.getTextContent()) for the stats/KPI block.
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

  // ─── Body: rows + groups (line-based) ──────────────────────────────────────
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

  // ─── Stats + Saldos + KPIs (positional) ────────────────────────────────────
  // Page 1 carries the full stats block in our fixtures; if a future PDF moves
  // it, this loop covers all pages.
  const items: PositionedItem[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    for (const raw of content.items) {
      // unpdf's getTextContent() returns (TextItem | TextMarkedContent)[];
      // only TextItem has `str` + `transform`. Narrow with a runtime check.
      const it = raw as Partial<TextItemRaw>;
      if (typeof it.str !== 'string' || !it.transform) continue;
      const str = it.str.trim();
      if (!str) continue;
      items.push({
        str,
        x: it.transform[4],
        y: it.transform[5],
        width: it.width ?? 0,
      });
    }
  }

  const { rows: statsRows, warnings: statsWarnings } = extractStatsAndKpis(items);
  rows.push(...statsRows);
  warnings.push(...statsWarnings);

  return {
    hotel,
    referenceDate,
    rows,
    warnings,
  };
}

// ─── Positional helpers ──────────────────────────────────────────────────────

interface TextItemRaw {
  str: string;
  transform: [number, number, number, number, number, number];
  width?: number;
}

interface PositionedItem {
  str: string;
  x: number; // left edge
  y: number; // baseline (PDF coords: y grows upward)
  width: number;
}

/**
 * Y-tolerance for matching a label to its value items. PDF rows in the stats
 * block sit within ±3 units (some rows have a label baseline at y and the
 * decimal % values 2 units above). 3.0 is wide enough to catch them all
 * without crossing into the adjacent visual row (~10 unit pitch).
 */
const Y_TOL = 3.0;

/** Numeric token (Argentine format OR plain integer). */
const NUMERIC_RE = /^-?[\d.]+(?:,\d{1,2})?$/;

/** Right-aligned column descriptor: a value belongs to this column if its
 *  `x + width` falls within `[xRightEnd - tol, xRightEnd + tol]`. */
interface RightCol {
  xRightEnd: number;
  tol: number;
}

const COL = {
  // Estadísticas table (left half)
  statsHoy:    { xRightEnd: 188, tol: 8 },
  statsPctHoy: { xRightEnd: 211, tol: 6 },
  statsAcum:   { xRightEnd: 264, tol: 8 },
  statsPctAcum:{ xRightEnd: 290, tol: 6 },
  // Totales y Saldos table (right half)
  totalsHoy:   { xRightEnd: 458, tol: 8 },
  totalsAcum:  { xRightEnd: 567, tol: 8 },
} as const satisfies Record<string, RightCol>;

function inCol(item: PositionedItem, col: RightCol): boolean {
  const right = item.x + item.width;
  return Math.abs(right - col.xRightEnd) <= col.tol;
}

function findItemByText(items: PositionedItem[], needle: string): PositionedItem | null {
  // Exact match first; fallback to startsWith for labels with optional trailing ":"
  const exact = items.find((i) => i.str === needle);
  if (exact) return exact;
  return items.find((i) => i.str === needle.replace(/:$/, '')) ?? null;
}

function valuesNearY(items: PositionedItem[], y: number): PositionedItem[] {
  return items.filter(
    (i) => Math.abs(i.y - y) <= Y_TOL && NUMERIC_RE.test(i.str),
  );
}

function findValueInCol(
  items: PositionedItem[],
  labelY: number,
  col: RightCol,
): number | null {
  const candidates = valuesNearY(items, labelY).filter((i) => inCol(i, col));
  if (candidates.length === 0) return null;
  // Prefer the item closest in Y to the label baseline.
  candidates.sort((a, b) => Math.abs(a.y - labelY) - Math.abs(b.y - labelY));
  return parseLooseNumber(candidates[0].str);
}

/** AR format ("1.293.462,42") OR plain integer ("2697") → number. */
function parseLooseNumber(s: string): number {
  if (s.includes(',')) {
    return parseARNumber(s);
  }
  // Plain integer (possibly with thousand dots, e.g. "1.234").
  const cleaned = s.replace(/\./g, '');
  const n = Number(cleaned);
  if (Number.isNaN(n)) throw new Error(`parseLooseNumber: bad input ${JSON.stringify(s)}`);
  return n;
}

/**
 * Spec for one stats/KPI row: where to find its label, which column carries
 * the cumulative value, and the canonical name to emit.
 *
 * `valueCol` is the column that maps to `valorAcumulado` in `period_values`.
 * For stock/saldo rows the PDF puts the only value in the Hoy column — we
 * still store it in `valorAcumulado` because that's the column the Excel
 * generator reads. Acuerdo del usuario (decision A).
 */
interface RowSpec {
  groupName: string;
  canonicalName: string;
  labelText: string;
  valueCol: RightCol;
}

const ROW_SPECS: RowSpec[] = [
  // ─── TOTALES Y SALDOS (right-hand block) ─────────────────────────────────
  { groupName: 'TOTALES Y SALDOS', canonicalName: 'Total de los Grupos',
    labelText: 'Total de los Grupos:', valueCol: COL.totalsAcum },
  { groupName: 'TOTALES Y SALDOS', canonicalName: 'Saldo Anterior Huésped',
    labelText: 'Saldo Ant Huesp:', valueCol: COL.totalsHoy },
  { groupName: 'TOTALES Y SALDOS', canonicalName: 'Saldo Actual Huésped',
    labelText: 'Saldo Actual Huésp.', valueCol: COL.totalsHoy },

  // ─── ESTADISTICAS (left half) ────────────────────────────────────────────
  { groupName: 'ESTADISTICAS', canonicalName: 'Habitaciones del Hotel',
    labelText: 'Habs del Hotel:', valueCol: COL.statsAcum },
  { groupName: 'ESTADISTICAS', canonicalName: 'Habitaciones Disponibles',
    labelText: 'Habs Disponibles:', valueCol: COL.statsAcum },
  { groupName: 'ESTADISTICAS', canonicalName: 'Habitaciones Ocupadas',
    labelText: 'Habs Ocupadas:', valueCol: COL.statsAcum },
  // % Ocupación isn't a labeled row — derived from the %Acum column of "Habs Ocupadas".
  { groupName: 'ESTADISTICAS', canonicalName: '% Ocupación',
    labelText: 'Habs Ocupadas:', valueCol: COL.statsPctAcum },

  // ─── INDICADORES FINANCIEROS (bottom block) ──────────────────────────────
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: 'Diaria Media',
    labelText: 'Diaria Media', valueCol: COL.totalsHoy },
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: 'Diaria Media Huésped',
    labelText: 'Diaria Media Huésp', valueCol: COL.totalsHoy },
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: 'Diaria Media por Pernoctes',
    labelText: 'Diária Média por Pernoites', valueCol: COL.totalsHoy },
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: 'REVPAR',
    labelText: 'REVPAR:', valueCol: COL.totalsHoy },
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: '% Rec Huésped s/Rec TT',
    labelText: '%Rec Huesp sRec TT:', valueCol: COL.totalsHoy },
  { groupName: 'INDICADORES FINANCIEROS', canonicalName: '% Rec A&B s/Huésped',
    labelText: '% Rec A&B S/Huésp:', valueCol: COL.totalsHoy },
];

/**
 * For the KPI block at the bottom of page 1 the column geometry differs from
 * the right-hand totals block. The PDF stacks "Hoy" and "Acumulado" values at
 * roughly x=150 and x=229 (left-aligned, narrower numbers). Override the
 * column resolver for KPI rows by attempting both column shapes.
 */
const KPI_COL_HOY: RightCol = { xRightEnd: 186, tol: 10 };
const KPI_COL_ACUM: RightCol = { xRightEnd: 265, tol: 10 };

function resolveKpiValue(
  items: PositionedItem[],
  labelY: number,
): number | null {
  // Prefer the cumulative column (rightmost). Falls back to the hoy column
  // when the row only carries one value (stock-like KPIs are rare here).
  const acum = findValueInCol(items, labelY, KPI_COL_ACUM);
  if (acum !== null) return acum;
  return findValueInCol(items, labelY, KPI_COL_HOY);
}

function extractStatsAndKpis(items: PositionedItem[]): {
  rows: RawParsedRow[];
  warnings: string[];
} {
  const out: RawParsedRow[] = [];
  const warnings: string[] = [];

  for (const spec of ROW_SPECS) {
    const label = findItemByText(items, spec.labelText);
    if (!label) {
      warnings.push(`stats: label not found "${spec.labelText}"`);
      continue;
    }

    const value =
      spec.groupName === 'INDICADORES FINANCIEROS'
        ? resolveKpiValue(items, label.y)
        : findValueInCol(items, label.y, spec.valueCol);

    if (value === null) {
      warnings.push(
        `stats: no value found for "${spec.labelText}" near y=${label.y.toFixed(1)}`,
      );
      continue;
    }

    out.push({
      rawName: spec.canonicalName,
      groupName: spec.groupName,
      valorHoy: null,
      valorAcumulado: value,
      pctHoy: null,
      pctAcumulado: null,
    });
  }

  return { rows: out, warnings };
}
