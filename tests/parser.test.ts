/**
 * Parser tests against the fixture PDFs in tests/fixtures/.
 * Golden fixture: rds-2026-01.pdf (January 2026).
 */
import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseRdsPdf, parseARNumber } from '@/lib/parser';

const FIXTURES = path.resolve(__dirname, 'fixtures');

async function loadPdf(name: string): Promise<Uint8Array> {
  const buf = await readFile(path.join(FIXTURES, name));
  return new Uint8Array(buf);
}

describe('parseARNumber', () => {
  it('parses positive Argentine numbers', () => {
    expect(parseARNumber('1.293.462,42')).toBeCloseTo(1293462.42);
    expect(parseARNumber('100,00')).toBe(100);
    expect(parseARNumber('0,00')).toBe(0);
    expect(parseARNumber('5,53')).toBeCloseTo(5.53);
    expect(parseARNumber('154.613.728,18')).toBeCloseTo(154613728.18);
  });

  it('parses negative numbers', () => {
    expect(parseARNumber('-3.016,53')).toBeCloseTo(-3016.53);
    expect(parseARNumber('-0,04')).toBeCloseTo(-0.04);
    expect(parseARNumber('-902.440,04')).toBeCloseTo(-902440.04);
  });

  it('throws on invalid input', () => {
    expect(() => parseARNumber('not a number')).toThrow();
    expect(() => parseARNumber('')).toThrow();
  });
});

describe('parseRdsPdf — January 2026 fixture', () => {
  it('extracts header (hotel + reference date)', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    expect(result.hotel).toBe('CASA REAL SALTA');
    expect(result.referenceDate.toISOString().slice(0, 10)).toBe('2026-01-31');
  });

  it('extracts ALOJAMIENTO row in HOSPEDAJE group', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const row = result.rows.find((r) => r.rawName === 'ALOJAMIENTO');
    expect(row).toBeDefined();
    expect(row!.groupName).toBe('HOSPEDAJE');
    expect(row!.valorHoy).toBeCloseTo(4693703.97);
    expect(row!.valorAcumulado).toBeCloseTo(154613728.18);
    expect(row!.pctHoy).toBeCloseTo(65.53);
    expect(row!.pctAcumulado).toBeCloseTo(71.65);
  });

  it('handles negative numbers (DESAYUNO)', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const row = result.rows.find((r) => r.rawName === 'DESAYUNO (-)');
    expect(row).toBeDefined();
    expect(row!.valorHoy).toBeCloseTo(-3016.53);
    expect(row!.valorAcumulado).toBeCloseTo(-110454.55);
  });

  it('handles names with multiple words (ANULACIONES Y DESCUENTOS)', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const row = result.rows.find(
      (r) => r.rawName === 'ANULACIONES Y DESCUENTOS' && r.groupName === 'HOSPEDAJE',
    );
    expect(row).toBeDefined();
    expect(row!.valorAcumulado).toBeCloseTo(-555687.25);
  });

  it('extracts FORMAS DE COBRO group with 14 rows', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const cobro = result.rows.filter((r) => r.groupName === 'FORMAS DE COBRO');
    expect(cobro).toHaveLength(14);

    const anticipo = cobro.find((r) => r.rawName === 'ANTICIPO');
    expect(anticipo!.valorAcumulado).toBeCloseTo(49707111.07);

    const devAnticipo = cobro.find((r) => r.rawName === 'DEV. ANTICIPO');
    expect(devAnticipo!.valorAcumulado).toBeCloseTo(-49304010.33);
  });

  it('extracts IMPUESTOS group', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const iva = result.rows.find(
      (r) => r.rawName === 'IVA' && r.groupName === 'IMPUESTOS',
    );
    expect(iva!.valorAcumulado).toBeCloseTo(38374745.66);
  });

  it('discovers all 7 revenue/totals groups', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    const groups = new Set(result.rows.map((r) => r.groupName));
    expect(groups).toEqual(
      new Set([
        'HOSPEDAJE',
        'ALIMENTOS Y BEBIDAS',
        'SPA CLUB',
        'LAVANDERIA/TINTORERIA',
        'CARGOS VARIOS',
        'FORMAS DE COBRO',
        'IMPUESTOS',
      ]),
    );
  });

  it('extracts ~32 concept rows with no warnings', async () => {
    const result = await parseRdsPdf(await loadPdf('rds-2026-01.pdf'));
    expect(result.rows.length).toBeGreaterThanOrEqual(32);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseRdsPdf — multi-fixture invariants', () => {
  const fixtures = [
    { file: 'rds-2026-01.pdf', expectedDate: '2026-01-31' },
    { file: 'rds-2026-02.pdf', expectedDate: null },  // Feb date unknown — assert valid
    { file: 'rds-2026-03.pdf', expectedDate: null },
    { file: 'rds-2026-04.pdf', expectedDate: null },
  ];

  for (const { file, expectedDate } of fixtures) {
    it(`parses ${file} successfully`, async () => {
      const result = await parseRdsPdf(await loadPdf(file));

      expect(result.hotel).toBe('CASA REAL SALTA');
      expect(result.referenceDate).toBeInstanceOf(Date);
      expect(Number.isNaN(result.referenceDate.getTime())).toBe(false);

      if (expectedDate) {
        expect(result.referenceDate.toISOString().slice(0, 10)).toBe(expectedDate);
      }

      // The 7 core groups are always present; additional groups (e.g. EVENTOS)
      // may appear in some months and are auto-discovered by the parser.
      const groups = new Set(result.rows.map((r) => r.groupName));
      const coreGroups = [
        'HOSPEDAJE',
        'ALIMENTOS Y BEBIDAS',
        'SPA CLUB',
        'LAVANDERIA/TINTORERIA',
        'CARGOS VARIOS',
        'FORMAS DE COBRO',
        'IMPUESTOS',
      ];
      for (const g of coreGroups) {
        expect(groups.has(g), `Expected group "${g}" in ${file}`).toBe(true);
      }
      expect(result.rows.length).toBeGreaterThanOrEqual(30);
      expect(result.warnings).toEqual([]);
    });
  }
});
