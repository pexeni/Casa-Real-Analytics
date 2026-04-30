/**
 * Concept normalizer.
 *
 * Maps raw row labels (from the PDF) to canonical Concept rows in the DB.
 *
 * V0 strategy (current): exact alias lookup → auto-create with needs_review=true.
 *   Fuzzy match (Levenshtein) and LLM classification are deferred — YAGNI until
 *   we observe duplicate concepts in production. The PDF is consistent enough
 *   that exact alias lookup catches everything across our 4-month fixture set.
 *
 * Auto-discovers report_groups too: if the parser yields a group not seeded
 * (e.g. EVENTOS, COMUNICACIONES), the normalizer creates it with kind='revenue'
 * by default. A human can re-classify via /conceptos later.
 *
 * See: docs/design/mvp.md §6 (step 6).
 */
import { db, schema } from '@/lib/db';
import type { Concept, MetricKind, ReportTypeId } from '@/lib/domain/types';
import { and, eq, sql } from 'drizzle-orm';

export interface NormalizeResult {
  concept: Concept;
  source: 'alias' | 'fuzzy' | 'llm' | 'unmapped';
}

type ConceptRow = typeof schema.concepts.$inferSelect;

function toConcept(row: ConceptRow): Concept {
  return {
    id: row.id,
    reportTypeId: row.reportTypeId as ReportTypeId,
    groupId: row.groupId,
    canonicalName: row.canonicalName,
    rawAliases: row.rawAliases,
    sortOrder: row.sortOrder,
    isSubtotal: row.isSubtotal,
    metricKind: row.metricKind as MetricKind,
    needsReview: row.needsReview,
  };
}

/**
 * Find or create a report_group for a given (reportTypeId, name).
 * Auto-created groups default to kind='revenue' and sortOrder=999.
 */
async function findOrCreateGroup(
  reportTypeId: ReportTypeId,
  name: string,
): Promise<{ id: string; name: string }> {
  const existing = await db
    .select({ id: schema.reportGroups.id, name: schema.reportGroups.name })
    .from(schema.reportGroups)
    .where(
      and(
        eq(schema.reportGroups.reportTypeId, reportTypeId),
        eq(schema.reportGroups.name, name),
      ),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  const [created] = await db
    .insert(schema.reportGroups)
    .values({
      reportTypeId,
      name,
      displayName: `Grupo ${name}`,
      kind: 'revenue',
      sortOrder: 999,
    })
    .returning({ id: schema.reportGroups.id, name: schema.reportGroups.name });
  return created;
}

/**
 * Map a raw row label to a canonical Concept. Idempotent: repeated calls with
 * the same `(rawName, groupHint)` resolve to the same concept via alias lookup.
 *
 * Lookup is scoped by group: the same name can legitimately appear in two
 * groups (e.g. "ANULACIONES Y DESCUENTOS" exists in both HOSPEDAJE and
 * LAVANDERIA/TINTORERIA), and they are semantically distinct concepts.
 */
export async function normalizeConcept(
  rawName: string,
  groupHint: string | null,
  reportTypeId: ReportTypeId,
): Promise<NormalizeResult> {
  const name = rawName.trim();
  if (!name) {
    throw new Error('normalizeConcept: rawName is empty');
  }

  // 1. Resolve (or auto-create) the group first, since alias lookup is scoped to it.
  const groupId = groupHint
    ? (await findOrCreateGroup(reportTypeId, groupHint)).id
    : null;

  // 2. Alias lookup — exact match against rawAliases, scoped by group.
  const aliasMatch = await db
    .select()
    .from(schema.concepts)
    .where(
      and(
        eq(schema.concepts.reportTypeId, reportTypeId),
        groupId === null
          ? sql`${schema.concepts.groupId} IS NULL`
          : eq(schema.concepts.groupId, groupId),
        sql`${schema.concepts.rawAliases} @> ARRAY[${name}]::text[]`,
      ),
    )
    .limit(1);
  if (aliasMatch.length > 0) {
    return { concept: toConcept(aliasMatch[0]), source: 'alias' };
  }

  // 3. Insert new concept. sortOrder = max within group + 10 so concepts
  // appear in discovery order (which matches the PDF's natural order if we
  // ingest months chronologically). needs_review=true surfaces it in /conceptos.
  const [{ maxOrder }] = await db
    .select({
      maxOrder: sql<number>`COALESCE(MAX(${schema.concepts.sortOrder}), 0)::int`,
    })
    .from(schema.concepts)
    .where(
      and(
        eq(schema.concepts.reportTypeId, reportTypeId),
        groupId === null
          ? sql`${schema.concepts.groupId} IS NULL`
          : eq(schema.concepts.groupId, groupId),
      ),
    );

  const [created] = await db
    .insert(schema.concepts)
    .values({
      reportTypeId,
      groupId,
      canonicalName: name,
      rawAliases: [name],
      sortOrder: maxOrder + 10,
      isSubtotal: false,
      metricKind: 'currency',
      needsReview: true,
    })
    .returning();

  return { concept: toConcept(created), source: 'unmapped' };
}
