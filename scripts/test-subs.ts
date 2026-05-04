import { parseRdsPdf } from '../lib/parser/index.ts';
import { readFileSync } from 'node:fs';

async function main() {
  for (const m of ['01','02','03','04']) {
    const r = await parseRdsPdf(new Uint8Array(readFileSync(`tests/fixtures/rds-2026-${m}.pdf`)));
    const subs = r.rows.filter((x) => x.rawName.startsWith('Subtotal '));
    console.log(`-- 2026-${m} --`);
    for (const s of subs) console.log('  ', s.rawName.padEnd(38), s.valorAcumulado);
    const sum = subs
      .filter((s) => !s.rawName.includes('FORMAS') && !s.rawName.includes('IMPUESTOS'))
      .reduce((a, s) => a + (s.valorAcumulado ?? 0), 0);
    console.log('  Σ revenue subtotals =', sum);
  }
}
main();
