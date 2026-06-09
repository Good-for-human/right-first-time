import type { LLMModel } from '@/types';

/** Canonical list (must match `LLMModel` in types). */
export const SUPPORTED_LLM_MODELS: LLMModel[] = [
  'gpt-5.5',
];

const LEGACY_MAP: Record<string, LLMModel> = {
  'gpt-4o': 'gpt-5.5',
  'gpt-4.1': 'gpt-5.5',
  'gpt-4.1-mini': 'gpt-5.5',
  'o4-mini': 'gpt-5.5',
  'gpt-5.3-chat-latest': 'gpt-5.5',
  'gpt-5.4-pro': 'gpt-5.5',
  'claude-3-5-haiku': 'gpt-5.5',
  'claude-3-7-sonnet': 'gpt-5.5',
  'claude-3-5-sonnet': 'gpt-5.5',
  'gemini-2.5-flash': 'gpt-5.5',
  'gemini-2.5-pro': 'gpt-5.5',
  'gemini-1-5-flash': 'gpt-5.5',
  'gemini-1-5-pro': 'gpt-5.5',
  'gemini-1.5-flash': 'gpt-5.5',
  'gemini-1.5-pro': 'gpt-5.5',
  'gemini-2-0-flash': 'gpt-5.5',
  'gemini-2.0-flash': 'gpt-5.5',
  'gemini-2-5-flash': 'gpt-5.5',
  'gemini-2-5-pro': 'gpt-5.5',
  'gemini-3.1-flash': 'gpt-5.5',
  'gemini-3.1-pro': 'gpt-5.5',
  'gemini-3.1-flash-preview': 'gpt-5.5',
  'gemini-3.1-pro-preview': 'gpt-5.5',
};

const DEFAULT_MODEL: LLMModel = 'gpt-5.5';

/** Map Firestore / old clients to the current two-per-vendor model set. */
export function coerceLLMModel(raw: unknown): LLMModel {
  if (typeof raw !== 'string') return DEFAULT_MODEL;
  if (SUPPORTED_LLM_MODELS.includes(raw as LLMModel)) return raw as LLMModel;
  return LEGACY_MAP[raw] ?? DEFAULT_MODEL;
}
