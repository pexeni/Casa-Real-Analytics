/**
 * Excel generator for the consolidated multi-month "Acumulados RDS" workbook.
 *
 * Layout matches the reference file at tests/fixtures/RDS_Casa_Real_Salta_Acumulados.xlsx:
 *   - Title rows (3, merged across all columns)
 *   - Column headers ("Concepto", "Enero (al 31/01)", …)
 *   - For each group (sorted by sortOrder):
 *       - Group header ("GRUPO HOSPEDAJE")
 *       - One row per concept (sorted by sortOrder)
 *       - Subtotal row ("Subtotal Hospedaje")
 *       - Blank separator row
 *
 * Computed values only — no live Excel formulas. See docs/design/mvp.md §7.
 */
import ExcelJS from 'exceljs';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { ReportTypeId } from '@/lib/domain/types';

export interface BuildAcumuladosOpts {
  reportTypeId: ReportTypeId;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// Spanish words that stay lowercase in title case (when not the first word).
const TITLE_LOWER = new Set([
  'y', 'e', 'o', 'u', 'de', 'del', 'la', 'el', 'los', 'las',
  'por', 'a', 'al', 'en', 'con', 'sin', 'para',
]);

/**
 * Spanish-aware title case for concept names.
 * "ANULACIONES Y DESCUENTOS" → "Anulaciones y Descuentos"
 * "DEV. ANTICIPO" → "Devolución Anticipo"  ← we don't expand abbreviations,
 *   so this stays "Dev. Anticipo". The user can rename via /conceptos.
 * "NC EFECTIVO" → "NC Efectivo"  (NC stays uppercase as it's a known prefix)
 */
function titleCaseEs(s: string): string {
  const tokens = s.split(/(\s+)/);
  return tokens
    .map((tok, i) => {
      if (/^\s+$/.test(tok)) return tok;
      const lower = tok.toLowerCase();
      // Preserve known uppercase abbreviations
      if (/^NC$/i.test(tok)) return 'NC';
      // Lowercase function words (but not at position 0)
      if (i > 0 && TITLE_LOWER.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
}

/** "31/01/2026" formatted as "31/01" for the column header. */
function formatRefDateShort(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}`;
}

/** Spanish month name for a `period` (first-of-month date). */
function monthLabelEs(period: Date): string {
  return MONTHS_ES[period.getUTCMonth()] ?? '';
}

type GroupKind = 'revenue' | 'totals' | 'stats' | 'kpi';

/**
 * Pick a number format from the canonical concept name. The DB schema has a
 * `metric_kind` column for this, but auto-discovered concepts default to
 * 'currency' regardless of their real type, so the column isn't yet reliable.
 * Heuristic: room counts → integer, anything starting with `%` or named
 * `% Ocupación` → percentage, else currency.
 */
function pickNumFmt(canonicalName: string): string {
  const n = canonicalName.trim();
  if (/^%/.test(n)) return '0.00"%"'; // value is already in 0–100 (e.g. 50.91)
  if (/^Habitaciones\b/i.test(n)) return '#,##0';
  return '#,##0.00;[Red]-#,##0.00';
}

// Excel ARGB fills (AARRGGBB) — ExcelJS uses ARGB, not RGBA.
const FILL_HEADER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E293B' } }; // slate-900
const FILL_GROUP_REVENUE = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE0E7FF' } }; // indigo-100
const FILL_GROUP_OTHER = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF1F5F9' } }; // slate-100
const FILL_SUBTOTAL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEEF2FF' } }; // indigo-50
const BORDER_THIN_TOP = { top: { style: 'medium' as const, color: { argb: 'FF1E293B' } } };

interface GroupBlock {
  groupId: string;
  name: string;
  displayName: string;
  kind: GroupKind;
  sortOrder: number;
  concepts: ConceptRow[];
}

interface ConceptRow {
  conceptId: string;
  canonicalName: string;
  sortOrder: number;
  /** valorAcumulado per period index (parallel to periods[]). null = no value. */
  values: (number | null)[];
}

export async function buildAcumuladosXlsx(opts: BuildAcumuladosOpts): Promise<Buffer> {
  const { reportTypeId } = opts;

  // 1. Periods (chronological columns).
  const periodsRows = await db
    .select({
      id: schema.periods.id,
      period: schema.periods.period,
      referenceDate: schema.periods.referenceDate,
    })
    .from(schema.periods)
    .where(eq(schema.periods.reportTypeId, reportTypeId))
    .orderBy(asc(schema.periods.period));

  // 2. Groups for this report type.
  const groupsRows = await db
    .select({
      id: schema.reportGroups.id,
      name: schema.reportGroups.name,
      displayName: schema.reportGroups.displayName,
      kind: schema.reportGroups.kind,
      sortOrder: schema.reportGroups.sortOrder,
    })
    .from(schema.reportGroups)
    .where(eq(schema.reportGroups.reportTypeId, reportTypeId))
    .orderBy(asc(schema.reportGroups.sortOrder));

  // Render all four kinds (revenue, totals, stats, kpi). Subtotal rows are
  // suppressed for stats/kpi blocks below — summing %s or room counts is
  // meaningless. Empty groups (no concepts yet) are filtered out at block
  // construction time so legacy KPI rows from earlier seeds don't leak in.
  const renderableGroups = groupsRows;

  // 3. Concepts for this report type.
  const conceptsRows = await db
    .select({
      id: schema.concepts.id,
      groupId: schema.concepts.groupId,
      canonicalName: schema.concepts.canonicalName,
      sortOrder: schema.concepts.sortOrder,
    })
    .from(schema.concepts)
    .where(eq(schema.concepts.reportTypeId, reportTypeId))
    .orderBy(asc(schema.concepts.sortOrder), asc(schema.concepts.canonicalName));

  // 4. Period values — one read; pivot in memory.
  const valuesRows = await db
    .select({
      periodId: schema.periodValues.periodId,
      conceptId: schema.periodValues.conceptId,
      valorAcumulado: schema.periodValues.valorAcumulado,
    })
    .from(schema.periodValues)
    .innerJoin(
      schema.concepts,
      eq(schema.concepts.id, schema.periodValues.conceptId),
    )
    .where(eq(schema.concepts.reportTypeId, reportTypeId));

  // (periodId, conceptId) → number
  const valueMap = new Map<string, number>();
  for (const v of valuesRows) {
    valueMap.set(`${v.periodId}::${v.conceptId}`, Number(v.valorAcumulado));
  }

  // 5. Build group blocks. Drop empty groups so the workbook never shows a
  // header with no rows below it (e.g. an old "KPI" placeholder).
  const blocks: GroupBlock[] = renderableGroups
    .map((g): GroupBlock => {
      const groupConcepts = conceptsRows.filter((c) => c.groupId === g.id);
      return {
        groupId: g.id,
        name: g.name,
        displayName: g.displayName,
        kind: g.kind as GroupKind,
        sortOrder: g.sortOrder,
        concepts: groupConcepts.map((c) => ({
          conceptId: c.id,
          canonicalName: c.canonicalName,
          sortOrder: c.sortOrder,
          values: periodsRows.map((p) => {
            const v = valueMap.get(`${p.id}::${c.id}`);
            return v === undefined ? null : v;
          }),
        })),
      };
    })
    .filter((b) => b.concepts.length > 0);

  // 6. Render workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Casa Real Analytics';
  wb.created = new Date();

  const ws = wb.addWorksheet('Acumulados RDS');

  const totalCols = 1 + periodsRows.length;

  // Title rows (rows 1-3, merged).
  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell(1, 1).value = 'CASA REAL SALTA — Valores Acumulados (RDS)';
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF1E293B' } };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(2, 1, 2, totalCols);
  // Subtitle: months covered (range from first → last period).
  let subtitle = 'Períodos acumulados al cierre de cada mes';
  if (periodsRows.length > 0) {
    const first = new Date(periodsRows[0].period as unknown as string);
    const last = new Date(periodsRows[periodsRows.length - 1].period as unknown as string);
    const range =
      first.getTime() === last.getTime()
        ? `${monthLabelEs(first)} ${first.getUTCFullYear()}`
        : `${monthLabelEs(first)} ${first.getUTCFullYear()} — ${monthLabelEs(last)} ${last.getUTCFullYear()}`;
    subtitle = `${range} · ${periodsRows.length} período${periodsRows.length === 1 ? '' : 's'}`;
  }
  ws.getCell(2, 1).value = subtitle;
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF475569' } }; // slate-600
  ws.getCell(2, 1).alignment = { horizontal: 'center' };

  // Row 3 blank.

  // Row 4: column headers — dark fill + white text for contrast.
  const headerRow = ws.getRow(4);
  headerRow.height = 22;
  for (let col = 1; col <= totalCols; col++) {
    const cell = headerRow.getCell(col);
    cell.fill = FILL_HEADER;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
  }
  headerRow.getCell(1).value = 'Concepto';
  for (let i = 0; i < periodsRows.length; i++) {
    const p = periodsRows[i];
    const period = new Date(p.period as unknown as string);
    const refDate = new Date(p.referenceDate as unknown as string);
    headerRow.getCell(2 + i).value = `${monthLabelEs(period)} (al ${formatRefDateShort(refDate)})`;
  }

  // Body: groups → concepts → (subtotal) → blank.
  let rowIdx = 5;
  for (const block of blocks) {
    // Subtotals only make sense for monetary blocks. For stats (room counts,
    // %Ocupación) and kpi (REVPAR, ratios) summing across rows is misleading,
    // so we suppress the subtotal row entirely.
    const showSubtotal = block.kind === 'revenue' || block.kind === 'totals';

    // Group header — use displayName to keep the casing the seed already
    // chose ("Estadísticas", "Indicadores Financieros") instead of forcing
    // ALL CAPS like we do for revenue/totals legacy blocks.
    const groupHeaderName = showSubtotal
      ? `GRUPO ${block.name.toUpperCase()}`
      : block.displayName.toUpperCase();
    const groupFill = block.kind === 'revenue' ? FILL_GROUP_REVENUE : FILL_GROUP_OTHER;
    for (let col = 1; col <= totalCols; col++) {
      const cell = ws.getCell(rowIdx, col);
      cell.fill = groupFill;
      cell.font = { bold: true, color: { argb: 'FF1E293B' } };
    }
    ws.getCell(rowIdx, 1).value = groupHeaderName;
    rowIdx++;

    // Concept rows.
    const subtotals: number[] = new Array(periodsRows.length).fill(0);
    for (const c of block.concepts) {
      ws.getCell(rowIdx, 1).value = titleCaseEs(c.canonicalName);
      const fmt = pickNumFmt(c.canonicalName);
      for (let i = 0; i < periodsRows.length; i++) {
        const v = c.values[i];
        const cell = ws.getCell(rowIdx, 2 + i);
        if (v !== null) {
          cell.value = v;
          cell.numFmt = fmt;
          // Only sum currency rows into the subtotal — averaging room counts
          // or %s across line items is meaningless.
          if (fmt.includes('0.00;')) subtotals[i] += v;
        }
      }
      rowIdx++;
    }

    if (showSubtotal) {
      // Subtotal row. Round to 2 decimals to avoid float-accumulation drift
      // (e.g. 201572711.70000002).
      const subtotalLabel = `Subtotal ${titleCaseEs(block.name)}`;
      for (let col = 1; col <= totalCols; col++) {
        const cell = ws.getCell(rowIdx, col);
        cell.fill = FILL_SUBTOTAL;
        cell.font = { bold: true, color: { argb: 'FF1E293B' } };
        cell.border = BORDER_THIN_TOP;
      }
      ws.getCell(rowIdx, 1).value = subtotalLabel;
      for (let i = 0; i < periodsRows.length; i++) {
        const cell = ws.getCell(rowIdx, 2 + i);
        cell.value = Math.round(subtotals[i] * 100) / 100;
        cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      }
      rowIdx++;
    }

    // Blank separator.
    rowIdx++;
  }

  // Column widths.
  ws.getColumn(1).width = 36;
  for (let i = 0; i < periodsRows.length; i++) {
    ws.getColumn(2 + i).width = 22;
  }

  // Freeze panes: keep the header row and the concept column visible while
  // scrolling through the body.
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 4 }];

  // AutoFilter on the header row across all columns.
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: totalCols },
  };

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}
