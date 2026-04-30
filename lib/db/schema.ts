/**
 * Drizzle schema for Casa Real Analytics.
 * Mirrors docs/design/mvp.md §5.
 *
 * Includes:
 *   - Auth.js v5 standard tables (users, accounts, sessions, verification_tokens)
 *   - Domain tables (report_types, report_groups, concepts, periods, period_values)
 *   - Audit table (ingestion_events)
 */
import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  boolean,
  date,
  numeric,
  jsonb,
  primaryKey,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

// ─── Auth.js v5 tables (standard shape required by @auth/drizzle-adapter) ─────

export const users = pgTable('user', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'account',
  {
    userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ─── Domain tables ────────────────────────────────────────────────────────────

/** Catalog of report types. Seeded with 'RDS' for MVP; extensible. */
export const reportTypes = pgTable('report_types', {
  id: text('id').primaryKey(),                  // 'RDS'
  name: text('name').notNull(),                 // 'Resumen Diario de Situación - Modelo II'
  hotel: text('hotel').notNull(),               // 'Casa Real Salta'
});

/** Canonical sections within a report type. */
export const reportGroups = pgTable(
  'report_groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportTypeId: text('report_type_id')
      .notNull()
      .references(() => reportTypes.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),                 // 'HOSPEDAJE'
    displayName: text('display_name').notNull(),  // 'GRUPO HOSPEDAJE'
    kind: text('kind').notNull(),                 // 'revenue' | 'totals' | 'stats' | 'kpi'
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [uniqueIndex('report_groups_type_name_uq').on(t.reportTypeId, t.name)],
);

/** Auto-discovered canonical concepts (line items). */
export const concepts = pgTable(
  'concepts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportTypeId: text('report_type_id')
      .notNull()
      .references(() => reportTypes.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id').references(() => reportGroups.id, { onDelete: 'set null' }),
    canonicalName: text('canonical_name').notNull(),  // 'Alojamiento'
    rawAliases: text('raw_aliases').array().notNull().default([]),
    sortOrder: integer('sort_order').notNull().default(0),
    isSubtotal: boolean('is_subtotal').notNull().default(false),
    metricKind: text('metric_kind').notNull().default('currency'),
    needsReview: boolean('needs_review').notNull().default(false),
  },
  (t) => [
    // Scoped by group: the same canonical name can legitimately appear in
    // multiple groups (e.g. "ANULACIONES Y DESCUENTOS" exists in both
    // HOSPEDAJE and LAVANDERIA/TINTORERIA in real RDS exports).
    uniqueIndex('concepts_type_group_canonical_uq').on(
      t.reportTypeId,
      t.groupId,
      t.canonicalName,
    ),
  ],
);

/** One row per uploaded month. UNIQUE(reportTypeId, period) → re-upload replaces. */
export const periods = pgTable(
  'periods',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reportTypeId: text('report_type_id')
      .notNull()
      .references(() => reportTypes.id, { onDelete: 'cascade' }),
    period: date('period').notNull(),                  // first of month
    referenceDate: date('reference_date').notNull(),   // PDF's Fecha
    pdfBlobUrl: text('pdf_blob_url').notNull(),
    pdfFilename: text('pdf_filename').notNull(),
    uploadedBy: text('uploaded_by')
      .notNull()
      .references(() => users.id),
    uploadedAt: timestamp('uploaded_at', { mode: 'date' }).notNull().defaultNow(),
    parserVersion: text('parser_version').notNull(),
    status: text('status').notNull(),                  // 'success' | 'partial' | 'failed'
  },
  (t) => [uniqueIndex('periods_type_period_uq').on(t.reportTypeId, t.period)],
);

/** Long-format value table — the analytics surface. */
export const periodValues = pgTable(
  'period_values',
  {
    periodId: uuid('period_id')
      .notNull()
      .references(() => periods.id, { onDelete: 'cascade' }),
    conceptId: uuid('concept_id')
      .notNull()
      .references(() => concepts.id, { onDelete: 'cascade' }),
    valorAcumulado: numeric('valor_acumulado').notNull(),
    pctAcumulado: numeric('pct_acumulado'),
    valorHoy: numeric('valor_hoy'),
    pctHoy: numeric('pct_hoy'),
    source: text('source').notNull(),                  // 'deterministic' | 'llm-fallback'
  },
  (t) => [primaryKey({ columns: [t.periodId, t.conceptId] })],
);

/** Audit log for ingestion + LLM calls. */
export const ingestionEvents = pgTable('ingestion_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  periodId: uuid('period_id').references(() => periods.id, { onDelete: 'cascade' }),
  step: text('step').notNull(),                        // 'parse' | 'normalize' | 'llm-fallback'
  model: text('model'),                                // e.g. 'nvidia/nemotron-3-super:free'
  input: jsonb('input'),
  output: jsonb('output'),
  status: text('status').notNull(),
  durationMs: integer('duration_ms'),
  createdAt: timestamp('created_at', { mode: 'date' }).notNull().defaultNow(),
});
