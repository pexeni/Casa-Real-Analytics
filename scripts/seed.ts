/**
 * Seed report_types and report_groups for the RDS report.
 *
 * Idempotent: re-runs are no-ops thanks to ON CONFLICT clauses keyed on
 * (id) for report_types and (report_type_id, name) for report_groups.
 *
 * Run: npm run db:seed
 */
import { db, schema } from '@/lib/db';
import { sql } from 'drizzle-orm';

const REPORT_TYPE_ID = 'RDS';

/**
 * Groups discovered in tests/fixtures/rds-2026-01.pdf (Modelo II).
 * `kind` follows design §5: 'revenue' | 'totals' | 'stats' | 'kpi'.
 * `sortOrder` matches PDF appearance order.
 */
const GROUPS = [
  { name: 'HOSPEDAJE',            displayName: 'Grupo HOSPEDAJE',            kind: 'revenue', sortOrder: 10 },
  { name: 'ALIMENTOS Y BEBIDAS',  displayName: 'Grupo ALIMENTOS Y BEBIDAS',  kind: 'revenue', sortOrder: 20 },
  { name: 'SPA CLUB',             displayName: 'Grupo SPA CLUB',             kind: 'revenue', sortOrder: 30 },
  { name: 'LAVANDERIA/TINTORERIA',displayName: 'Grupo LAVANDERIA/TINTORERIA',kind: 'revenue', sortOrder: 40 },
  { name: 'CARGOS VARIOS',        displayName: 'Grupo CARGOS VARIOS',        kind: 'revenue', sortOrder: 50 },
  { name: 'FORMAS DE COBRO',      displayName: 'Grupo FORMAS DE COBRO',      kind: 'totals',  sortOrder: 60 },
  { name: 'IMPUESTOS',            displayName: 'Grupo IMPUESTOS',            kind: 'totals',  sortOrder: 70 },
  { name: 'ESTADISTICAS',         displayName: 'Estadísticas',               kind: 'stats',   sortOrder: 80 },
  { name: 'KPI',                  displayName: 'KPIs',                       kind: 'kpi',     sortOrder: 90 },
] as const;

async function main() {
  console.log('Seeding report_types...');
  await db
    .insert(schema.reportTypes)
    .values({
      id: REPORT_TYPE_ID,
      name: 'Resumen Diario de Situación - Modelo II',
      hotel: 'Casa Real Salta',
    })
    .onConflictDoNothing({ target: schema.reportTypes.id });

  console.log('Seeding report_groups...');
  for (const g of GROUPS) {
    await db
      .insert(schema.reportGroups)
      .values({
        reportTypeId: REPORT_TYPE_ID,
        name: g.name,
        displayName: g.displayName,
        kind: g.kind,
        sortOrder: g.sortOrder,
      })
      .onConflictDoUpdate({
        target: [schema.reportGroups.reportTypeId, schema.reportGroups.name],
        set: {
          displayName: g.displayName,
          kind: g.kind,
          sortOrder: g.sortOrder,
        },
      });
  }

  const [{ count: typeCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.reportTypes);
  const [{ count: groupCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.reportGroups);

  console.log(`✓ Seed complete: ${typeCount} report_types, ${groupCount} report_groups`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
