import type { LLMModel } from '@/types';

/** Canonical list (must match `LLMModel` in types). */
export const SUPPORTED_LLM_MODELS: LLMModel[] = [
  'gpt-5.3-chat-latest',
  'gpt-5.4-pro',
  'claude-3-5-haiku',
  'claude-3-7-sonnet',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

const LEGACY_MAP: Record<string, LLMModel> = {
  'gpt-4o': 'gpt-5.3-chat-latest',
  'gpt-4.1': 'gpt-5.4-pro',
  'gpt-4.1-mini': 'gpt-5.3-chat-latest',
  'o4-mini': 'gpt-5.3-chat-latest',
  'claude-3-5-sonnet': 'claude-3-7-sonnet',
  'gemini-1-5-flash': 'gemini-2.5-flash',
  'gemini-1-5-pro': 'gemini-2.5-pro',
  'gemini-1.5-flash': 'gemini-2.5-flash',
  'gemini-1.5-pro': 'gemini-2.5-pro',
  'gemini-2-0-flash': 'gemini-2.5-flash',
  'gemini-2.0-flash': 'gemini-2.5-flash',
  'gemini-2-5-flash': 'gemini-2.5-flash',
  'gemini-2-5-pro': 'gemini-2.5-pro',
  'gemini-3.1-flash': 'gemini-2.5-flash',
  'gemini-3.1-pro': 'gemini-2.5-pro',
  'gemini-3.1-flash-preview': 'gemini-2.5-flash',
  'gemini-3.1-pro-preview': 'gemini-2.5-pro',
};

const DEFAULT_MODEL: LLMModel = 'gpt-5.3-chat-latest';

/** Map Firestore / old clients to the current two-per-vendor model set. */
export function coerceLLMModel(raw: unknown): LLMModel {
  if (typeof raw !== 'string') return DEFAULT_MODEL;
  if (SUPPORTED_LLM_MODELS.includes(raw as LLMModel)) return raw as LLMModel;
  return LEGACY_MAP[raw] ?? DEFAULT_MODEL;
}
