/**
 * /reportes — main MVP page.
 * - Upload PDF card (drop zone)
 * - List of uploaded periods (chronological), with delete + open original PDF
 * - "Descargar Excel" button → GET /api/excel
 *
 * See: docs/design/mvp.md §8.
 */
import Link from 'next/link';
import { asc, eq, sql } from 'drizzle-orm';
import { DownloadIcon, FileTextIcon, InboxIcon } from 'lucide-react';
import { db, schema } from '@/lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { UploadPdfCard } from '@/components/upload-pdf-card';
import { DeletePeriodButton } from '@/components/delete-period-button';
import { cn } from '@/lib/utils';
import type { IngestionStatus } from '@/lib/domain/types';

export const metadata = { title: 'Reportes — Casa Real Analytics' };
export const dynamic = 'force-dynamic';

const REPORT_TYPE = 'RDS' as const;

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function periodLabel(period: string): string {
  // `period` is 'YYYY-MM-DD' from Postgres (drizzle date column with mode default).
  const [yyyy, mm] = period.split('-');
  return `${MONTHS_ES[Number(mm) - 1] ?? mm} ${yyyy}`;
}

function formatRefDate(refDate: string): string {
  const [yyyy, mm, dd] = refDate.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function formatUploadedAt(d: Date): string {
  // Localize as es-AR; falls back gracefully.
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(d);
}

const STATUS_LABEL: Record<IngestionStatus, string> = {
  success: 'OK',
  partial: 'Parcial',
  failed: 'Fallido',
};

function statusVariant(status: IngestionStatus): 'default' | 'secondary' | 'destructive' {
  switch (status) {
    case 'success': return 'default';
    case 'partial': return 'secondary';
    case 'failed': return 'destructive';
  }
}

export default async function ReportesPage() {
  // Periods + row count (subquery aggregation in a single round-trip).
  const periods = await db
    .select({
      id: schema.periods.id,
      period: schema.periods.period,
      referenceDate: schema.periods.referenceDate,
      pdfBlobUrl: schema.periods.pdfBlobUrl,
      pdfFilename: schema.periods.pdfFilename,
      uploadedAt: schema.periods.uploadedAt,
      status: schema.periods.status,
      rowCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${schema.periodValues}
        WHERE ${schema.periodValues.periodId} = ${schema.periods.id}
      )`,
    })
    .from(schema.periods)
    .where(eq(schema.periods.reportTypeId, REPORT_TYPE))
    .orderBy(asc(schema.periods.period));

  const hasPeriods = periods.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes RDS</h1>
          <p className="text-sm text-muted-foreground">
            {hasPeriods
              ? `${periods.length} período${periods.length === 1 ? '' : 's'} cargado${periods.length === 1 ? '' : 's'}.`
              : 'Cargá el primer PDF para empezar.'}
          </p>
        </div>
        {hasPeriods ? (
          <a
            href="/api/excel"
            download
            className={cn(buttonVariants({ variant: 'default' }), 'gap-2')}
          >
            <DownloadIcon className="size-4" />
            Descargar Excel
          </a>
        ) : (
          <span
            aria-disabled="true"
            title="Cargá al menos un período para habilitar la descarga"
            className={cn(
              buttonVariants({ variant: 'default' }),
              'pointer-events-none gap-2 opacity-50',
            )}
          >
            <DownloadIcon className="size-4" />
            Descargar Excel
          </span>
        )}
      </div>

      <UploadPdfCard />

      <Card>
        <CardHeader>
          <CardTitle>Períodos cargados</CardTitle>
        </CardHeader>
        <CardContent>
          {!hasPeriods ? (
            <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 px-6 py-12 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <InboxIcon className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Sin reportes cargados</p>
                <p className="text-xs text-muted-foreground">
                  Subí un PDF arriba — los períodos aparecerán acá ordenados cronológicamente.
                </p>
              </div>
            </div>
          ) : (
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead>Fecha referencia</TableHead>
                    <TableHead className="text-right">Filas</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Subido</TableHead>
                    <TableHead>Archivo</TableHead>
                    <TableHead className="w-12 text-right" aria-label="Acciones" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {periods.map((p) => {
                    const label = periodLabel(p.period);
                    // Always go through the authenticated proxy — the blob is
                    // private and not directly browser-readable. Local fixture
                    // rows use `local://...`; we still fall back to plain text.
                    const isHttp = p.pdfBlobUrl.startsWith('https://');
                    const pdfHref = isHttp ? `/api/pdf/${p.id}` : null;
                    return (
                      <TableRow key={p.id} className="group transition-colors hover:bg-muted/40">
                        <TableCell className="font-medium">{label}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatRefDate(p.referenceDate)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{p.rowCount}</TableCell>
                        <TableCell>
                          <Badge variant={statusVariant(p.status as IngestionStatus)}>
                            {STATUS_LABEL[p.status as IngestionStatus] ?? p.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatUploadedAt(p.uploadedAt)}
                        </TableCell>
                        <TableCell className="max-w-[20ch] truncate">
                          {pdfHref ? (
                            <Link
                              href={pdfHref}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                              title={p.pdfFilename}
                            >
                              <FileTextIcon className="size-3.5 shrink-0" />
                              <span className="truncate">{p.pdfFilename}</span>
                            </Link>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 text-muted-foreground"
                              title={p.pdfFilename}
                            >
                              <FileTextIcon className="size-3.5 shrink-0" />
                              <span className="truncate">{p.pdfFilename}</span>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <DeletePeriodButton periodId={p.id} periodLabel={label} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
