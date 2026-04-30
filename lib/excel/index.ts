/**
 * Excel generator for the consolidated multi-month "Acumulados RDS" workbook.
 *
 * Layout matches the reference file at tests/fixtures/RDS_Casa_Real_Salta_Acumulados.xlsx.
 * Computed values only — no live Excel formulas. See docs/design/mvp.md §7.
 */
import type { ReportTypeId } from '@/lib/domain/types';

export interface BuildAcumuladosOpts {
  reportTypeId: ReportTypeId;
}

/**
 * Build the consolidated Acumulados workbook as a Buffer.
 * TODO: implement against the reference xlsx as the snapshot target.
 */
export async function buildAcumuladosXlsx(_opts: BuildAcumuladosOpts): Promise<Buffer> {
  throw new Error('buildAcumuladosXlsx: not implemented yet (see docs/design/mvp.md §7)');
}
