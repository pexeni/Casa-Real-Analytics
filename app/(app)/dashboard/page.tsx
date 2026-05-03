/**
 * /dashboard — analytics overview for RDS reports.
 * - 4 KPI cards (latest period): revenue, occupancy %, REVPAR, diaria media (with MoM delta)
 * - Revenue trend (line + area)
 * - Occupancy & REVPAR (dual-axis line)
 * - Revenue group breakdown (stacked bars)
 *
 * Empty state mirrors /reportes when no periods loaded yet.
 */
import Link from 'next/link';
import { ArrowRightIcon, BarChart3Icon } from 'lucide-react';
import { getDashboardData } from '@/lib/dashboard/queries';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/button';
import { KpiCard } from '@/components/dashboard/kpi-card';
import { RevenueTrendChart } from '@/components/dashboard/revenue-trend-chart';
import { OccupancyRevparChart } from '@/components/dashboard/occupancy-revpar-chart';
import { GroupBreakdownChart } from '@/components/dashboard/group-breakdown-chart';
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
  const { periods, totalRevenue, occupancy, revpar, diariaMedia, revenueGroups } = data;

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

  const revCurr = totalRevenue[latest.id];
  const revPrev = prev ? totalRevenue[prev.id] : undefined;
  const ocupCurr = occupancy[latest.id];
  const ocupPrev = prev ? occupancy[prev.id] : undefined;
  const revparCurr = revpar[latest.id];
  const revparPrev = prev ? revpar[prev.id] : undefined;
  const dmCurr = diariaMedia[latest.id];
  const dmPrev = prev ? diariaMedia[prev.id] : undefined;

  const revDelta = pctDelta(revCurr, revPrev);
  const ocupDelta =
    ocupCurr !== undefined && ocupPrev !== undefined
      ? {
          label: `${ocupCurr - ocupPrev >= 0 ? '+' : ''}${(ocupCurr - ocupPrev).toFixed(1)} pp MoM`,
          positive: ocupCurr - ocupPrev >= 0,
        }
      : { label: null, positive: null };
  const revparDelta = pctDelta(revparCurr, revparPrev);
  const dmDelta = pctDelta(dmCurr, dmPrev);

  // Time series for charts: one row per period, indexed by label.
  const trendSeries = periods.map((p) => ({
    label: p.label,
    total: totalRevenue[p.id],
  }));

  const ocupRevparSeries = periods.map((p) => ({
    label: p.label,
    ocup: occupancy[p.id],
    revpar: revpar[p.id],
  }));

  // Stacked-bar series: each row has one numeric field per revenue group.
  const groupBreakdownSeries = periods.map((p) => {
    const row: { label: string; [k: string]: string | number | undefined } = { label: p.label };
    for (const g of revenueGroups) row[g.groupName] = g.values[p.id] ?? 0;
    return row;
  });

  // Filter groups that are zero across the board (avoids empty stacks).
  const activeGroups = revenueGroups.filter((g) =>
    periods.some((p) => (g.values[p.id] ?? 0) !== 0),
  );

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
          label="Ingresos totales"
          value={revCurr !== undefined ? ARS.format(revCurr) : '—'}
          delta={revDelta.label}
          positive={revDelta.positive}
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
          <CardTitle>Evolución de ingresos</CardTitle>
          <CardDescription>Total mensual (Total de los Grupos).</CardDescription>
        </CardHeader>
        <CardContent>
          <RevenueTrendChart data={trendSeries} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ocupación &amp; REVPAR</CardTitle>
            <CardDescription>Porcentaje de ocupación y revenue per available room.</CardDescription>
          </CardHeader>
          <CardContent>
            <OccupancyRevparChart data={ocupRevparSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ingresos por grupo</CardTitle>
            <CardDescription>Composición de ingresos por familia (HOSPEDAJE, A&amp;B, EVENTOS, …).</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupBreakdownChart data={groupBreakdownSeries} groups={activeGroups} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
