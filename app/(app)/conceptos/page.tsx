import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const metadata = { title: 'Conceptos — Casa Real Analytics' };

export default function ConceptosPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Conceptos pendientes de revisión</h1>
      <Card>
        <CardHeader>
          <CardTitle>Sin conceptos pendientes</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Cuando se detecten líneas no clasificadas en un PDF, aparecerán acá para revisión.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
