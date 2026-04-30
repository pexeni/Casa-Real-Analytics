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

interface GroupBlock {
  groupId: string;
  name: string;
  displayName: string;
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

  // We only render revenue/totals groups in the Acumulados sheet for MVP.
  // Stats and KPI groups (auto-discovered later) get their own future treatment.
  const renderableGroups = groupsRows.filter(
    (g) => g.kind === 'revenue' || g.kind === 'totals',
  );

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

  // 5. Build group blocks.
  const blocks: GroupBlock[] = renderableGroups.map((g) => {
    const groupConcepts = conceptsRows.filter((c) => c.groupId === g.id);
    return {
      groupId: g.id,
      name: g.name,
      displayName: g.displayName,
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
  });

  // 6. Render workbook.
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Casa Real Analytics';
  wb.created = new Date();

  const ws = wb.addWorksheet('Acumulados RDS');

  const totalCols = 1 + periodsRows.length;

  // Title rows (rows 1-3, merged).
  ws.mergeCells(1, 1, 1, totalCols);
  ws.getCell(1, 1).value = 'CASA REAL SALTA - Valores Acumulados (RDS)';
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(1, 1).alignment = { horizontal: 'center' };

  ws.mergeCells(2, 1, 2, totalCols);
  ws.getCell(2, 1).value = 'Períodos acumulados al cierre de cada mes';
  ws.getCell(2, 1).font = { italic: true };
  ws.getCell(2, 1).alignment = { horizontal: 'center' };

  // Row 3 blank.

  // Row 4: column headers.
  const headerRow = ws.getRow(4);
  headerRow.getCell(1).value = 'Concepto';
  headerRow.getCell(1).font = { bold: true };
  for (let i = 0; i < periodsRows.length; i++) {
    const p = periodsRows[i];
    const period = new Date(p.period as unknown as string);
    const refDate = new Date(p.referenceDate as unknown as string);
    headerRow.getCell(2 + i).value = `${monthLabelEs(period)} (al ${formatRefDateShort(refDate)})`;
    headerRow.getCell(2 + i).font = { bold: true };
    headerRow.getCell(2 + i).alignment = { horizontal: 'center' };
  }

  // Body: groups → concepts → subtotal → blank.
  let rowIdx = 5;
  for (const block of blocks) {
    // Group header.
    const groupHeaderName = `GRUPO ${block.name.toUpperCase()}`;
    ws.getCell(rowIdx, 1).value = groupHeaderName;
    ws.getCell(rowIdx, 1).font = { bold: true };
    rowIdx++;

    // Concept rows.
    const subtotals: number[] = new Array(periodsRows.length).fill(0);
    for (const c of block.concepts) {
      ws.getCell(rowIdx, 1).value = titleCaseEs(c.canonicalName);
      for (let i = 0; i < periodsRows.length; i++) {
        const v = c.values[i];
        const cell = ws.getCell(rowIdx, 2 + i);
        if (v !== null) {
          cell.value = v;
          cell.numFmt = '#,##0.00;[Red]-#,##0.00';
          subtotals[i] += v;
        }
      }
      rowIdx++;
    }

    // Subtotal row. Round to 2 decimals to avoid float-accumulation drift
    // (e.g. 201572711.70000002).
    const subtotalLabel = `Subtotal ${titleCaseEs(block.name)}`;
    const subtotalRowCell = ws.getCell(rowIdx, 1);
    subtotalRowCell.value = subtotalLabel;
    subtotalRowCell.font = { bold: true };
    for (let i = 0; i < periodsRows.length; i++) {
      const cell = ws.getCell(rowIdx, 2 + i);
      cell.value = Math.round(subtotals[i] * 100) / 100;
      cell.numFmt = '#,##0.00;[Red]-#,##0.00';
      cell.font = { bold: true };
    }
    rowIdx++;

    // Blank separator.
    rowIdx++;
  }

  // Column widths.
  ws.getColumn(1).width = 36;
  for (let i = 0; i < periodsRows.length; i++) {
    ws.getColumn(2 + i).width = 22;
  }

  const arrayBuf = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuf);
}
