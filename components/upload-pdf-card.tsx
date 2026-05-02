'use client';
/**
 * Upload card for RDS PDFs — drag-and-drop or click to select.
 * POSTs the file to /api/ingest, toasts result, and refreshes the page so
 * the periods list re-renders with the new row.
 */
import { useRef, useState, type DragEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CloudUploadIcon, Loader2Icon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface IngestResponse {
  periodId?: string;
  period?: string;
  rowCount?: number;
  warnings?: string[];
  status?: 'success' | 'partial' | 'failed';
  error?: string;
  detail?: string;
}

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function periodLabel(periodKey: string): string {
  // periodKey is 'YYYY-MM-01'.
  const [yyyy, mm] = periodKey.split('-');
  const idx = Number(mm) - 1;
  return `${MONTHS_ES[idx] ?? mm} ${yyyy}`;
}

export function UploadPdfCard() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  async function uploadFile(file: File) {
    if (file.type && file.type !== 'application/pdf') {
      toast.error('Solo se aceptan archivos PDF.');
      return;
    }
    setIsUploading(true);
    const fd = new FormData();
    fd.append('file', file);

    const toastId = toast.loading(`Procesando ${file.name}...`);
    try {
      const res = await fetch('/api/ingest', { method: 'POST', body: fd });
      // The server sometimes returns an HTML error page (Next dev overlay) when
      // an exception escapes the route handler — read text first, then try
      // JSON. This way the toast shows *something* useful instead of crashing
      // the parser.
      const text = await res.text();
      let json: IngestResponse = {};
      try {
        json = text ? (JSON.parse(text) as IngestResponse) : {};
      } catch {
        // Non-JSON body. Surface a clipped preview so the user can report it.
        const preview = text.slice(0, 200).replace(/\s+/g, ' ').trim();
        toast.error(`Error ${res.status}`, {
          id: toastId,
          description: preview || 'Respuesta vacía del servidor. Mirá la consola del server.',
        });
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? `Error ${res.status} al ingestar`, {
          id: toastId,
          description: json.detail,
        });
        return;
      }
      const label = json.period ? periodLabel(json.period) : 'período';
      const description =
        json.warnings && json.warnings.length > 0
          ? `${json.rowCount} filas. ${json.warnings.length} advertencia(s).`
          : `${json.rowCount} filas cargadas.`;
      toast.success(`${label} ingestado`, { id: toastId, description });
      router.refresh();
    } catch (err) {
      toast.error('Error de red', {
        id: toastId,
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cargar PDF</CardTitle>
        <CardDescription>
          Arrastrá o seleccioná un archivo .pdf del Resumen Diario de Situación.
          Si el período ya existe, se reemplaza.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div
          role="button"
          tabIndex={isUploading ? -1 : 0}
          aria-label="Soltar PDF aquí o presionar para seleccionar archivo"
          aria-disabled={isUploading}
          onDragOver={(e) => {
            e.preventDefault();
            if (!isUploading) setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
          onClick={() => !isUploading && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (isUploading) return;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={cn(
            'group flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed p-10 text-center',
            'transition-colors duration-200 outline-none',
            'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/50',
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-muted-foreground/50 hover:bg-muted/30',
            isUploading ? 'pointer-events-none opacity-60' : 'cursor-pointer',
          )}
        >
          <div
            className={cn(
              'flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors',
              isDragging && 'bg-primary/10 text-primary',
            )}
          >
            {isUploading ? (
              <Loader2Icon className="size-6 animate-spin" />
            ) : (
              <CloudUploadIcon className="size-6" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground">
              {isUploading
                ? 'Procesando...'
                : isDragging
                  ? 'Soltá el archivo'
                  : 'Arrastrá el PDF acá o hacé click'}
            </p>
            <p className="text-xs text-muted-foreground">Máx. 10 MB · application/pdf</p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={isUploading}
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
          >
            Seleccionar archivo
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onChange}
          />
        </div>
      </CardContent>
    </Card>
  );
}
