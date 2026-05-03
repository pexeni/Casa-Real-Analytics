'use client';
/**
 * Stacked bar chart: revenue by group, per period. One stacked bar per month,
 * colored segments per revenue group (HOSPEDAJE, A&B, EVENTOS, …).
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

// Categorical palette; cycled if there are more groups than colors.
const PALETTE = [
  '#10B981', // emerald-500
  '#6366F1', // indigo-500
  '#F97316', // orange-500
  '#A855F7', // purple-500
  '#06B6D4', // cyan-500
  '#F59E0B', // amber-500
  '#EC4899', // pink-500
  '#84CC16', // lime-500
  '#14B8A6', // teal-500
];

interface Datum {
  label: string;
  [groupKey: string]: string | number | undefined;
}

interface Group {
  groupName: string;
  displayName: string;
}

export function GroupBreakdownChart({ data, groups }: { data: Datum[]; groups: Group[] }) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} />
        <YAxis
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => ARS_COMPACT.format(v)}
          width={56}
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
            const g = groups.find((g) => g.groupName === key);
            return [ARS.format(Number(v)), g?.displayName ?? String(key)];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => {
            const g = groups.find((g) => g.groupName === value);
            return <span style={{ color: 'var(--foreground)' }}>{g?.displayName ?? value}</span>;
          }}
        />
        {groups.map((g, i) => (
          <Bar
            key={g.groupName}
            dataKey={g.groupName}
            stackId="rev"
            fill={PALETTE[i % PALETTE.length]}
            radius={i === groups.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
