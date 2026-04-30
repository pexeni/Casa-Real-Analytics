/**
 * Domain types for Casa Real Analytics.
 * Framework-agnostic — usable by parser, normalizer, excel, and any future dashboard code.
 *
 * See: docs/design/mvp.md §5 (Data Model) and §10 (Glossary).
 */

export type ReportTypeId = 'RDS';

export type GroupKind = 'revenue' | 'totals' | 'stats' | 'kpi';

export type MetricKind = 'currency' | 'count' | 'pct' | 'ratio';

export type IngestionStatus = 'success' | 'partial' | 'failed';

export type ValueSource = 'deterministic' | 'llm-fallback';

/** A canonical concept (line item) within a report group. */
export interface Concept {
  id: string;
  reportTypeId: ReportTypeId;
  groupId: string | null;
  canonicalName: string;
  rawAliases: string[];
  sortOrder: number;
  isSubtotal: boolean;
  metricKind: MetricKind;
  needsReview: boolean;
}

/** A canonical group (section) within a report type. */
export interface ReportGroup {
  id: string;
  reportTypeId: ReportTypeId;
  name: string;            // 'HOSPEDAJE'
  displayName: string;     // 'GRUPO HOSPEDAJE'
  kind: GroupKind;
  sortOrder: number;
}

/** One uploaded month of a report. */
export interface Period {
  id: string;
  reportTypeId: ReportTypeId;
  period: Date;            // first day of month
  referenceDate: Date;     // PDF's Fecha
  pdfBlobUrl: string;
  pdfFilename: string;
  uploadedBy: string;
  uploadedAt: Date;
  parserVersion: string;
  status: IngestionStatus;
}

/** A single (period × concept) value pair. */
export interface PeriodValue {
  periodId: string;
  conceptId: string;
  valorAcumulado: number;
  pctAcumulado: number | null;
  valorHoy: number | null;
  pctHoy: number | null;
  source: ValueSource;
}

/** Raw output from the deterministic parser, before normalization. */
export interface RawParsedRow {
  rawName: string;
  groupName: string;       // raw group name from PDF
  valorHoy: number | null;
  pctHoy: number | null;
  valorAcumulado: number;
  pctAcumulado: number | null;
}

export interface RawParsedReport {
  hotel: string;
  referenceDate: Date;
  rows: RawParsedRow[];
  warnings: string[];
}
