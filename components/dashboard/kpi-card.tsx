import { ArrowDownRightIcon, ArrowUpRightIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: string;
  /** Optional sublabel — e.g. "+12.4% MoM". */
  delta?: string | null;
  /** Tint the delta green (positive) or red (negative). */
  positive?: boolean | null;
}

export function KpiCard({ label, value, delta, positive }: Props) {
  const Icon =
    positive === null || positive === undefined
      ? null
      : positive
        ? ArrowUpRightIcon
        : ArrowDownRightIcon;

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        {delta && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-medium tabular-nums',
              positive ? 'text-emerald-600 dark:text-emerald-500' : 'text-rose-600 dark:text-rose-500',
            )}
          >
            {Icon && <Icon className="size-3.5" aria-hidden />}
            <span>{delta}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
