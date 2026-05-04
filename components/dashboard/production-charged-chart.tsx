'use client';
/**
 * Producción vs Cobrado por mes.
 *   - Producción (barra): suma de los Subtotal de los grupos de ingresos.
 *   - Cobrado    (barra): Σ(FORMAS DE COBRO) − Cuentas por Cobrar.
 *   - % Cobrado  (línea, eje derecho): cobrado / producción × 100.
 */
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const COL_PROD = '#10B981';    // emerald-500
const COL_CHARGED = '#6366F1'; // indigo-500
const COL_PCT = '#F97316';     // orange-500

/**
 * Compact ARS for axis ticks. `Intl` compact in es-AR emits verbose suffixes
 * ("150 mill.", "1,5 mil mill.") that overflow narrow tick labels — we want
 * short, predictable K / M / MM with comma decimal separator.
 */
function formatARSCompact(v: number): string {
  if (!Number.isFinite(v)) return '';
  const sign = v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs === 0) return '$0';
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} MM`;
  }
  if (abs >= 1_000_000) {
    return `${sign}$${Math.round(abs / 1_000_000)} M`;
  }
  if (abs >= 1_000) {
    return `${sign}$${Math.round(abs / 1_000)} K`;
  }
  return `${sign}$${Math.round(abs)}`;
}

interface Datum {
  label: string;
  produccion?: number;
  cobrado?: number;
  /** charged / produced × 100 — null when produccion is 0 or undefined. */
  pctCobrado?: number | null;
}

const LEGEND: Record<string, string> = {
  produccion: 'Producción',
  cobrado: 'Cobrado',
  pctCobrado: '% Cobrado',
};

export function ProductionChargedChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          yAxisId="ars"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickFormatter={formatARSCompact}
          width={72}
          domain={[0, 'auto']}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: COL_PCT }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          domain={[0, 110]}
          width={42}
        />
        <Tooltip
          cursor={{ fill: 'var(--accent)', opacity: 0.4 }}
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--popover-foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--muted-foreground)', fontSize: 11 }}
          formatter={(v, key) => {
            const k = String(key);
            if (k === 'pctCobrado') {
              return v == null ? ['—', LEGEND[k]] : [`${Number(v).toFixed(1)}%`, LEGEND[k]];
            }
            return [ARS.format(Number(v)), LEGEND[k] ?? k];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => (
            <span style={{ color: 'var(--foreground)' }}>{LEGEND[String(value)] ?? value}</span>
          )}
        />
        <Bar yAxisId="ars" dataKey="produccion" fill={COL_PROD} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="ars" dataKey="cobrado" fill={COL_CHARGED} radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="pctCobrado"
          stroke={COL_PCT}
          strokeWidth={2}
          dot={{ r: 3, fill: COL_PCT, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
