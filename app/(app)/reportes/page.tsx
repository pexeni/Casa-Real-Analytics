import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Reportes — Casa Real Analytics' };

export default function ReportesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Reportes RDS</h1>
        {/* TODO: Botón "Descargar Excel" → GET /api/excel */}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Cargar PDF</CardTitle>
          <CardDescription>
            Arrastrá o seleccioná un archivo .pdf del Resumen Diario de Situación.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* TODO: drop zone → POST /api/ingest */}
          <p className="text-sm text-muted-foreground">Pendiente de implementación.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Períodos cargados</CardTitle>
        </CardHeader>
        <CardContent>
          {/* TODO: tabla de periods */}
          <p className="text-sm text-muted-foreground">Sin reportes cargados.</p>
        </CardContent>
      </Card>
    </div>
  );
}
