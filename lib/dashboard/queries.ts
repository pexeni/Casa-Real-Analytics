/**
 * Dashboard data layer. One round-trip pulls every value-with-context for the
 * report type; we pivot in memory into the shapes the chart components want.
 *
 * Special concepts pulled out by canonical name (set by the parser ROW_SPECS):
 *   - "Total de los Grupos"  → total monthly revenue
 *   - "% Ocupación"          → occupancy ratio (0–100)
 *   - "REVPAR"
 *   - "Diaria Media"
 *
 * Revenue group subtotals (HOSPEDAJE, A&B, EVENTOS, …) are computed by summing
 * each revenue group's concepts per period — same shape the Excel renders as
 * "Subtotal <Group>".
 */
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { ReportTypeId } from '@/lib/domain/types';

const MONTHS_ES_SHORT = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic',
];

export interface DashboardPeriod {
  id: string;
  period: string;        // 'YYYY-MM-DD' (first of month)
  referenceDate: string; // 'YYYY-MM-DD'
  label: string;         // 'Ene 26'
}

export interface RevenueGroup {
  groupName: string;
  displayName: string;
  sortOrder: number;
  /** periodId → subtotal */
  values: Record<string, number>;
}

export interface DashboardData {
  periods: DashboardPeriod[];
  /** periodId → value, for each special concept */
  totalRevenue: Record<string, number>;
  occupancy: Record<string, number>;
  revpar: Record<string, number>;
  diariaMedia: Record<string, number>;
  /** Sorted by group sortOrder, only revenue-kind groups. */
  revenueGroups: RevenueGroup[];
}

export async function getDashboardData(reportTypeId: ReportTypeId): Promise<DashboardData> {
  const periodsRows = await db
    .select({
      id: schema.periods.id,
      period: schema.periods.period,
      referenceDate: schema.periods.referenceDate,
    })
    .from(schema.periods)
    .where(eq(schema.periods.reportTypeId, reportTypeId))
    .orderBy(asc(schema.periods.period));

  const valueRows = await db
    .select({
      periodId: schema.periodValues.periodId,
      valor: schema.periodValues.valorAcumulado,
      canonicalName: schema.concepts.canonicalName,
      groupName: schema.reportGroups.name,
      groupDisplayName: schema.reportGroups.displayName,
      groupKind: schema.reportGroups.kind,
      groupSortOrder: schema.reportGroups.sortOrder,
    })
    .from(schema.periodValues)
    .innerJoin(schema.concepts, eq(schema.concepts.id, schema.periodValues.conceptId))
    .innerJoin(schema.reportGroups, eq(schema.reportGroups.id, schema.concepts.groupId))
    .where(eq(schema.concepts.reportTypeId, reportTypeId));

  const totalRevenue: Record<string, number> = {};
  const occupancy: Record<string, number> = {};
  const revpar: Record<string, number> = {};
  const diariaMedia: Record<string, number> = {};
  const groupSums = new Map<
    string,
    { displayName: string; sortOrder: number; values: Record<string, number> }
  >();

  for (const r of valueRows) {
    const v = Number(r.valor);

    switch (r.canonicalName) {
      case 'Total de los Grupos': totalRevenue[r.periodId] = v; break;
      case '% Ocupación':         occupancy[r.periodId] = v;    break;
      case 'REVPAR':              revpar[r.periodId] = v;       break;
      case 'Diaria Media':        diariaMedia[r.periodId] = v;  break;
    }

    if (r.groupKind === 'revenue') {
      let g = groupSums.get(r.groupName);
      if (!g) {
        g = { displayName: r.groupDisplayName, sortOrder: r.groupSortOrder, values: {} };
        groupSums.set(r.groupName, g);
      }
      g.values[r.periodId] = (g.values[r.periodId] ?? 0) + v;
    }
  }

  const revenueGroups: RevenueGroup[] = [...groupSums.entries()]
    .map(([groupName, g]) => ({ groupName, displayName: g.displayName, sortOrder: g.sortOrder, values: g.values }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const periods: DashboardPeriod[] = periodsRows.map((p) => {
    const d = new Date(p.period as unknown as string);
    return {
      id: p.id,
      period: p.period as unknown as string,
      referenceDate: p.referenceDate as unknown as string,
      label: `${MONTHS_ES_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
    };
  });

  return { periods, totalRevenue, occupancy, revpar, diariaMedia, revenueGroups };
}
