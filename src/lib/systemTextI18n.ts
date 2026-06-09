import type { SystemLanguage, SystemLanguageTextMap } from '@/types';

export const GLOBAL_CATEGORY_KEYS = ['general', '通用'] as const;

export function isGlobalCategory(category: string | undefined | null): boolean {
  if (!category) return false;
  return GLOBAL_CATEGORY_KEYS.some((key) => key.toLowerCase() === category.trim().toLowerCase());
}

export function localizeSystemText(
  fallback: string,
  map: SystemLanguageTextMap | undefined,
  lang: SystemLanguage,
): string {
  const trimmedFallback = fallback?.trim() ?? '';
  const mapped = map?.[lang]?.trim();
  return mapped || trimmedFallback;
}

export function inferSystemLanguageFromText(text: string): SystemLanguage {
  return /[\u4e00-\u9fa5]/.test(text) ? 'cn' : 'en';
}
