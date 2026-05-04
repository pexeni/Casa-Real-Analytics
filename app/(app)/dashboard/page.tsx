/**
 * /dashboard — analytics overview for RDS reports.
 *
 * Layout (top → bottom):
 *   1. 4 KPI cards (latest period, with MoM delta)
 *   2. Producción vs Cobrado — grouped bars per month
 *   3. Cuentas por Cobrar    — line trend
 *   4. Estadísticas          — habs disp/ocup bars + % ocupación line
 *   5. Saldo Actual Huésped  — line trend
 */
import Link from 'next/link';
import { ArrowRightIcon, BarChart3Icon } from 'lucide-react';
import { getDashboardData } from '@/lib/dashboard/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { ProductionChargedChart } from '@/components/dashboard/production-charged-chart';
import { AccountsReceivableChart } from '@/components/dashboard/accounts-receivable-chart';
import { StatsChart } from '@/components/dashboard/stats-chart';
import { SaldoHuespedChart } from '@/components/dashboard/saldo-huesped-chart';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Dashboard — Casa Real Analytics' };
export const dynamic = 'force-dynamic';

const REPORT_TYPE = 'RDS' as const;

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const PCT = new Intl.NumberFormat('es-AR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function pctDelta(curr: number | undefined, prev: number | undefined): {
  label: string | null;
  positive: boolean | null;
} {
  if (curr === undefined || prev === undefined || prev === 0) return { label: null, positive: null };
  const diff = (curr - prev) / Math.abs(prev);
  const sign = diff >= 0 ? '+' : '';
  return { label: `${sign}${PCT.format(diff)} MoM`, positive: diff >= 0 };
}

export default async function DashboardPage() {
  const data = await getDashboardData(REPORT_TYPE);
  const {
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
  } = data;

  if (periods.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Vista general de los reportes RDS.
          </p>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BarChart3Icon className="size-6" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Aún no hay datos</p>
              <p className="text-xs text-muted-foreground">
                Subí el primer PDF en la sección Reportes para ver métricas acá.
              </p>
            </div>
            <Link
              href="/reportes"
              className={cn(buttonVariants({ variant: 'default', size: 'sm' }), 'gap-2')}
            >
              Ir a Reportes
              <ArrowRightIcon className="size-4" />
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latest = periods[periods.length - 1];
  const prev = periods.length > 1 ? periods[periods.length - 2] : undefined;

  const prodCurr = production[latest.id];
  const prodPrev = prev ? production[prev.id] : undefined;
  const ocupCurr = ocupacion[latest.id];
  const ocupPrev = prev ? ocupacion[prev.id] : undefined;
  const revparCurr = revpar[latest.id];
  const revparPrev = prev ? revpar[prev.id] : undefined;
  const dmCurr = diariaMedia[latest.id];
  const dmPrev = prev ? diariaMedia[prev.id] : undefined;

  const prodDelta = pctDelta(prodCurr, prodPrev);
  const ocupDelta =
    ocupCurr !== undefined && ocupPrev !== undefined
      ? {
          label: `${ocupCurr - ocupPrev >= 0 ? '+' : ''}${(ocupCurr - ocupPrev).toFixed(1)} pp MoM`,
          positive: ocupCurr - ocupPrev >= 0,
        }
      : { label: null, positive: null };
  const revparDelta = pctDelta(revparCurr, revparPrev);
  const dmDelta = pctDelta(dmCurr, dmPrev);

  // Chart series — one row per period, indexed by short month label.
  const productionChargedSeries = periods.map((p) => {
    const prod = production[p.id];
    const cobr = charged[p.id];
    const pct =
      prod !== undefined && prod !== 0 && cobr !== undefined ? (cobr / prod) * 100 : null;
    return {
      label: p.label,
      produccion: prod,
      cobrado: cobr,
      pctCobrado: pct,
    };
  });

  const cuentasSeries = periods.map((p) => ({
    label: p.label,
    cuentas: cuentasPorCobrar[p.id],
  }));

  const statsSeries = periods.map((p) => ({
    label: p.label,
    disponibles: habsDisponibles[p.id],
    ocupadas: habsOcupadas[p.id],
    ocupacion: ocupacion[p.id],
  }));

  const saldoSeries = periods.map((p) => ({
    label: p.label,
    saldo: saldoActual[p.id],
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            {periods.length} período{periods.length === 1 ? '' : 's'} · último: {latest.label}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Producción"
          value={prodCurr !== undefined ? ARS.format(prodCurr) : '—'}
          delta={prodDelta.label}
          positive={prodDelta.positive}
        />
        <KpiCard
          label="Ocupación"
          value={ocupCurr !== undefined ? `${ocupCurr.toFixed(2)}%` : '—'}
          delta={ocupDelta.label}
          positive={ocupDelta.positive}
        />
        <KpiCard
          label="REVPAR"
          value={revparCurr !== undefined ? ARS.format(revparCurr) : '—'}
          delta={revparDelta.label}
          positive={revparDelta.positive}
        />
        <KpiCard
          label="Diaria media"
          value={dmCurr !== undefined ? ARS.format(dmCurr) : '—'}
          delta={dmDelta.label}
          positive={dmDelta.positive}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Producción vs Cobrado</CardTitle>
          <CardDescription>
            Producción mensual (suma de los 7 grupos de ingresos) comparada con lo efectivamente
            cobrado (Formas de Cobro sin Cuentas por Cobrar).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProductionChargedChart data={productionChargedSeries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cuentas por Cobrar</CardTitle>
          <CardDescription>Evolución mensual del saldo a cobrar.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountsReceivableChart data={cuentasSeries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Estadísticas</CardTitle>
          <CardDescription>
            Habitaciones disponibles vs ocupadas y % de ocupación por mes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <StatsChart data={statsSeries} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saldo Actual Huésped</CardTitle>
          <CardDescription>Acumulación al cierre de cada mes.</CardDescription>
        </CardHeader>
        <CardContent>
          <SaldoHuespedChart data={saldoSeries} />
        </CardContent>
      </Card>
    </div>
  );
}
