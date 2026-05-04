'use client';
/**
 * Estadísticas: dual-axis. Habs Disponibles + Habs Ocupadas as grouped bars
 * (left axis, count); % Ocupación as a line (right axis, 0–100).
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

const COL_DISP = '#94A3B8'; // slate-400
const COL_OCUP = '#6366F1'; // indigo-500
const COL_PCT = '#10B981';  // emerald-500

interface Datum {
  label: string;
  disponibles?: number;
  ocupadas?: number;
  ocupacion?: number;
}

const LEGEND: Record<string, string> = {
  disponibles: 'Habs Disponibles',
  ocupadas: 'Habs Ocupadas',
  ocupacion: '% Ocupación',
};

const INT = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export function StatsChart({ data }: { data: Datum[] }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="2 4" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
        />
        <YAxis
          yAxisId="rooms"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickFormatter={(v: number) => INT.format(v)}
          width={56}
        />
        <YAxis
          yAxisId="pct"
          orientation="right"
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 12, fill: COL_PCT }}
          tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          domain={[0, 100]}
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
            if (k === 'ocupacion') return [`${Number(v).toFixed(2)}%`, LEGEND[k]];
            return [INT.format(Number(v)), LEGEND[k] ?? k];
          }}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => (
            <span style={{ color: 'var(--foreground)' }}>{LEGEND[String(value)] ?? value}</span>
          )}
        />
        <Bar yAxisId="rooms" dataKey="disponibles" fill={COL_DISP} radius={[4, 4, 0, 0]} />
        <Bar yAxisId="rooms" dataKey="ocupadas" fill={COL_OCUP} radius={[4, 4, 0, 0]} />
        <Line
          yAxisId="pct"
          type="monotone"
          dataKey="ocupacion"
          stroke={COL_PCT}
          strokeWidth={2}
          dot={{ r: 3, fill: COL_PCT, strokeWidth: 0 }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
