/**
 * Dashboard data layer. One round-trip pulls every value-with-context for the
 * report type; we pivot in memory into the shapes the chart components want.
 *
 * Per-period derivations:
 *   - production       = Σ(per-group "Subtotal X" rows of revenue-kind groups)
 *                        Gross production — does NOT subtract FORMAS DE COBRO
 *                        or IMPUESTOS. The parser emits these as rows with
 *                        canonicalName "Subtotal {GroupName}".
 *   - charged          = Σ(FORMAS DE COBRO concepts) − Cuentas por Cobrar
 *                        − Subtotal FORMAS DE COBRO  (abs-valued)
 *   - cuentasPorCobrar = FORMAS DE COBRO → "Cuentas por Cobrar" (abs)
 *   - saldoActual      = TOTALES Y SALDOS → "Saldo Actual Huésped"
 *   - habsDisponibles, habsOcupadas, ocupacion = ESTADISTICAS
 *   - revpar, diariaMedia                     = INDICADORES FINANCIEROS
 */
import { and, asc, eq } from 'drizzle-orm';
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

export interface DashboardData {
  periods: DashboardPeriod[];
  /** Sum of revenue-kind group concepts. */
  production: Record<string, number>;
  /** Σ(FORMAS DE COBRO) − Cuentas por Cobrar, abs-valued. */
  charged: Record<string, number>;
  /** Cuentas por Cobrar, abs-valued. */
  cuentasPorCobrar: Record<string, number>;
  /** Saldo Actual Huésped — month-end accumulated guest balance. */
  saldoActual: Record<string, number>;
  /** Estadísticas. */
  habsDisponibles: Record<string, number>;
  habsOcupadas: Record<string, number>;
  ocupacion: Record<string, number>;
  /** Indicadores financieros (used by KPI cards). */
  revpar: Record<string, number>;
  diariaMedia: Record<string, number>;
}

function isCuentasPorCobrar(canonicalName: string): boolean {
  const n = canonicalName.toLowerCase();
  return n.includes('cuenta') && n.includes('cobrar');
}

function isGroupSubtotal(canonicalName: string): boolean {
  return canonicalName.trim().toLowerCase().startsWith('subtotal ');
}

export async function getDashboardData(reportTypeId: ReportTypeId): Promise<DashboardData> {
  const periodsRows = await db
    .select({
      id: schema.periods.id,
      period: schema.periods.period,
      referenceDate: schema.periods.referenceDate,
    })
    .from(schema.periods)
    .where(
      and(
        eq(schema.periods.reportTypeId, reportTypeId),
        eq(schema.periods.status, 'success'),
      ),
    )
    .orderBy(asc(schema.periods.period));

  const valueRows = await db
    .select({
      periodId: schema.periodValues.periodId,
      valor: schema.periodValues.valorAcumulado,
      canonicalName: schema.concepts.canonicalName,
      isSubtotal: schema.concepts.isSubtotal,
      groupName: schema.reportGroups.name,
      groupKind: schema.reportGroups.kind,
    })
    .from(schema.periodValues)
    .innerJoin(schema.concepts, eq(schema.concepts.id, schema.periodValues.conceptId))
    .innerJoin(schema.reportGroups, eq(schema.reportGroups.id, schema.concepts.groupId))
    .where(eq(schema.concepts.reportTypeId, reportTypeId));

  const production: Record<string, number> = {};
  const chargedSigned: Record<string, number> = {};
  const cuentasSigned: Record<string, number> = {};
  const saldoActual: Record<string, number> = {};
  const habsDisponibles: Record<string, number> = {};
  const habsOcupadas: Record<string, number> = {};
  const ocupacion: Record<string, number> = {};
  const revpar: Record<string, number> = {};
  const diariaMedia: Record<string, number> = {};

  for (const r of valueRows) {
    const v = Number(r.valor);
    const pid = r.periodId;
    const subtotalRow = isGroupSubtotal(r.canonicalName);

    // Production: gross — sum of per-group Subtotal rows in revenue-kind groups
    // only. Skips FORMAS DE COBRO and IMPUESTOS (those are kind='totals').
    if (r.groupKind === 'revenue' && subtotalRow) {
      production[pid] = (production[pid] ?? 0) + v;
    }

    // Cobrado: line items inside FORMAS DE COBRO except Cuentas por Cobrar
    // and except the group's own Subtotal row.
    if (r.groupName === 'FORMAS DE COBRO' && !subtotalRow) {
      if (isCuentasPorCobrar(r.canonicalName)) {
        cuentasSigned[pid] = (cuentasSigned[pid] ?? 0) + v;
      } else {
        chargedSigned[pid] = (chargedSigned[pid] ?? 0) + v;
      }
    }

    switch (r.canonicalName) {
      case 'Saldo Actual Huésped':     saldoActual[pid] = v; break;
      case 'Habitaciones Disponibles': habsDisponibles[pid] = v; break;
      case 'Habitaciones Ocupadas':    habsOcupadas[pid] = v; break;
      case '% Ocupación':              ocupacion[pid] = v; break;
      case 'REVPAR':                   revpar[pid] = v; break;
      case 'Diaria Media':             diariaMedia[pid] = v; break;
    }
  }

  // Cash-flow rows are stored signed; the dashboard wants positive magnitudes.
  const charged: Record<string, number> = {};
  const cuentasPorCobrar: Record<string, number> = {};
  for (const [pid, v] of Object.entries(chargedSigned)) charged[pid] = Math.abs(v);
  for (const [pid, v] of Object.entries(cuentasSigned)) cuentasPorCobrar[pid] = Math.abs(v);

  const periods: DashboardPeriod[] = periodsRows.map((p) => {
    const d = new Date(p.period as unknown as string);
    return {
      id: p.id,
      period: p.period as unknown as string,
      referenceDate: p.referenceDate as unknown as string,
      label: `${MONTHS_ES_SHORT[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`,
    };
  });

  return {
    periods,
    production,
    charged,
    cuentasPorCobrar,
    saldoActual,
    habsDisponibles,
    habsOcupadas,
    ocupacion,
    revpar,
    diariaMedia,
  };
}
