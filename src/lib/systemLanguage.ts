import type { SystemLanguage } from '@/types';

export function normalizeSystemLanguage(raw: string | null | undefined): SystemLanguage {
  if (raw === 'en') return 'en';
  return 'cn';
}

export function toI18nLanguage(lang: SystemLanguage): 'zh' | 'en' {
  return lang === 'cn' ? 'zh' : 'en';
}
