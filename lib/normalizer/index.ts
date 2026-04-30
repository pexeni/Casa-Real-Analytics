/**
 * Concept normalizer.
 *
 * Maps raw row labels (from the PDF) to canonical Concept rows in the DB.
 * Pipeline: alias lookup → fuzzy match (Levenshtein ≤ 2) → LLM classification (OpenRouter).
 * Unknown concepts are inserted with `needs_review = true` and surface in /conceptos.
 *
 * See: docs/design/mvp.md §6 (step 6).
 */
import type { Concept, ReportTypeId } from '@/lib/domain/types';

export interface NormalizeResult {
  concept: Concept;
  source: 'alias' | 'fuzzy' | 'llm' | 'unmapped';
}

export async function normalizeConcept(
  _rawName: string,
  _groupHint: string | null,
  _reportTypeId: ReportTypeId,
): Promise<NormalizeResult> {
  throw new Error('normalizeConcept: not implemented yet');
}
