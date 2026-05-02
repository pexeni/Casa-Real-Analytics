'use client';
/**
 * Delete button for a single period row. Opens a Dialog with explicit
 * destructive copy, then DELETEs and refreshes. Uses useTransition so the
 * row visually fades while the request is in flight.
 */
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  periodId: string;
  periodLabel: string;
}

export function DeletePeriodButton({ periodId, periodLabel }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function onConfirm() {
    const toastId = toast.loading(`Eliminando ${periodLabel}...`);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/periods/${periodId}`, { method: 'DELETE' });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast.error(json.error ?? 'Error al eliminar', { id: toastId });
          return;
        }
        toast.success(`${periodLabel} eliminado`, { id: toastId });
        setOpen(false);
        router.refresh();
      } catch (err) {
        toast.error('Error de red', {
          id: toastId,
          description: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label={`Eliminar ${periodLabel}`}
        title={`Eliminar ${periodLabel}`}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <Trash2Icon />
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Eliminar {periodLabel}</DialogTitle>
          <DialogDescription>
            Se borrarán todos los valores cargados y el PDF original. Esta
            acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={pending}>
            {pending ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
