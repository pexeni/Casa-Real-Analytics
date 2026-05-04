'use client';
/**
 * Evolución de Saldo Actual Huésped: month-end accumulated guest balance.
 * Single-series line + soft area, distinct color from Cuentas por Cobrar.
 */
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
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

const COL = '#A855F7'; // purple-500

interface Datum {
  label: string;
  saldo?: number;
}

export function SaldoHuespedChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="saldoFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COL} stopOpacity={0.3} />
            <stop offset="100%" stopColor={COL} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
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
          formatter={(v) => [ARS.format(Number(v)), 'Saldo Actual Huésped']}
        />
        <Area type="monotone" dataKey="saldo" stroke="none" fill="url(#saldoFill)" />
        <Line
          type="monotone"
          dataKey="saldo"
          stroke={COL}
          strokeWidth={2}
          dot={{ r: 3, fill: COL, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
