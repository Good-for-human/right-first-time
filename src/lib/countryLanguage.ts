import type { BusinessCountryCode, LanguageCode } from '@/types';

export const COUNTRY_LANGUAGE_MAP: Record<BusinessCountryCode, LanguageCode> = {
  UK: 'en',
  DE: 'de',
  IT: 'it',
  ES: 'es',
  FR: 'fr',
  BE: 'fr',
  NL: 'nl',
  PL: 'pl',
  SE: 'sv',
};

export function getLanguageForCountry(countryCode: BusinessCountryCode): LanguageCode {
  return COUNTRY_LANGUAGE_MAP[countryCode];
}

const LANGUAGE_COUNTRY_FALLBACK: Partial<Record<LanguageCode, BusinessCountryCode>> = {
  en: 'UK',
  de: 'DE',
  it: 'IT',
  es: 'ES',
  fr: 'FR',
  nl: 'NL',
  pl: 'PL',
  sv: 'SE',
};

export function inferCountryFromLanguage(language: LanguageCode): BusinessCountryCode | null {
  return LANGUAGE_COUNTRY_FALLBACK[language] ?? null;
}
