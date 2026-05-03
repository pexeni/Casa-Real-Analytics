'use client';
/**
 * Dual-axis chart: occupancy % (left) + REVPAR (right). Different scales,
 * two y-axes. Two thin lines, distinct colors.
 */
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const ARS_COMPACT = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const COL_OCUP = '#6366F1';   // indigo-500
const COL_REVPAR = '#F97316'; // orange-500

interface Datum {
  label: string;
  ocup?: number;
  revpar?: number;
}

export function OccupancyRevparChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
        <YAxis
          yAxisId="ocup"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: COL_OCUP }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          domain={[0, 100]}
          width={42}
        />
        <YAxis
          yAxisId="revpar"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: COL_REVPAR }}
          tickFormatter={(v: number) => ARS_COMPACT.format(v)}
          width={56}
        />
        <Tooltip
          cursor={{ stroke: 'var(--border)' }}
          contentStyle={{
            background: 'var(--popover)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--popover-foreground)',
            fontSize: 12,
          }}
          labelStyle={{ color: 'var(--muted-foreground)', fontSize: 11 }}
          formatter={(v, key) =>
            key === 'ocup'
              ? [`${Number(v).toFixed(2)}%`, 'Ocupación']
              : [ARS.format(Number(v)), 'REVPAR']
          }
        />
        <Line
          yAxisId="ocup"
          type="monotone"
          dataKey="ocup"
          stroke={COL_OCUP}
          strokeWidth={2}
          dot={{ r: 3, fill: COL_OCUP, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
        <Line
          yAxisId="revpar"
          type="monotone"
          dataKey="revpar"
          stroke={COL_REVPAR}
          strokeWidth={2}
          dot={{ r: 3, fill: COL_REVPAR, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
