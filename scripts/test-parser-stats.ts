/* Smoke test: run parser on all fixtures, dump stats/totals/kpi rows. */
import { readFileSync } from 'fs';
import { parseRdsPdf } from '@/lib/parser';

async function main() {
  for (const f of ['rds-2026-01', 'rds-2026-02', 'rds-2026-03', 'rds-2026-04']) {
    const bytes = new Uint8Array(readFileSync(`tests/fixtures/${f}.pdf`));
    const out = await parseRdsPdf(bytes);
    console.log(`\n=== ${f} ===`);
    console.log('refDate:', out.referenceDate.toISOString().slice(0, 10));
    console.log('row count:', out.rows.length);
    const stats = out.rows.filter((r) =>
      ['TOTALES Y SALDOS', 'ESTADISTICAS', 'INDICADORES FINANCIEROS'].includes(r.groupName),
    );
    console.log('stats/totals/kpi rows:', stats.length);
    for (const r of stats) {
      console.log(`  [${r.groupName}] ${r.rawName} = ${r.valorAcumulado}`);
    }
    if (out.warnings.length) {
      console.log('warnings:');
      for (const w of out.warnings) console.log('  -', w);
    }
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
