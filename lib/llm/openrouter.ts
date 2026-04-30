/**
 * OpenRouter LLM client with model-fallback chain.
 *
 * Primary:  nvidia/nemotron-3-super:free
 * Fallback: openai/gpt-oss-120b:free
 *
 * Both models are free tier. OpenRouter handles per-model provider routing
 * automatically when `provider.allow_fallbacks=true` is passed.
 *
 * Verify exact model slugs at https://openrouter.ai/api/v1/models before shipping.
 *
 * See: docs/design/mvp.md §6 (LLM layer).
 */
import OpenAI from 'openai';
import { z } from 'zod';

if (!process.env.OPENROUTER_API_KEY) {
  // Don't throw at import time — LLM is optional for some flows (e.g. tests).
  // Functions below check for the key and throw a clear error if invoked without it.
}

export const MODELS = [
  'nvidia/nemotron-3-super:free',
  'openai/gpt-oss-120b:free',
] as const;

export type OpenRouterModel = (typeof MODELS)[number];

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  if (!_client) {
    _client = new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': process.env.APP_URL ?? 'http://localhost:3000',
        'X-Title': 'Casa Real Analytics',
      },
    });
  }
  return _client;
}

export interface CallOpts<T> {
  prompt: string;
  schema: z.ZodType<T>;
  models?: readonly OpenRouterModel[];
  temperature?: number;
}

/**
 * Call OpenRouter with a model-fallback chain.
 * Tries each model in order; returns the first one that yields schema-valid JSON.
 * Throws if all models fail.
 *
 * TODO: implement (response_format json_object, validate via zod, retry-on-parse-fail).
 */
export async function callOpenRouterWithFallback<T>(_opts: CallOpts<T>): Promise<T> {
  // Reference client() so the import isn't dead code in the skeleton.
  void client;
  throw new Error('callOpenRouterWithFallback: not implemented yet');
}
