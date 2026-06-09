import type { CountryCode } from '@/types';

type NullableString = string | null | undefined;
type MatchedKeyType = 'env' | 'manual' | 'route' | 'none';

const KEY_ROUTING_DEBUG_CACHE = new Set<string>();

/**
 * Sentinel returned to the frontend when no client-visible API key exists.
 * The same-origin proxy (/.netlify/functions/openai-proxy) interprets this
 * token, then resolves the real key from server-side env vars by country
 * (with DE fallback). This keeps provider keys off the browser entirely.
 *
 * Format: `__RFT_ROUTE__:<COUNTRY>` (country may be empty → server uses DE/global).
 */
export const COUNTRY_ROUTE_PREFIX = '__RFT_ROUTE__:';

export function isCountryRouteToken(value: NullableString): boolean {
  return typeof value === 'string' && value.startsWith(COUNTRY_ROUTE_PREFIX);
}

export function parseCountryRouteToken(value: NullableString): string | null {
  if (!isCountryRouteToken(value)) return null;
  const country = (value as string).slice(COUNTRY_ROUTE_PREFIX.length).trim().toUpperCase();
  return country || null;
}

function normalizeKey(value: NullableString): string {
  const raw = (value ?? '').trim();
  if (!raw) return '';
  // Reject masked secret displays (e.g. "••••••••bSgA" or "*******bSgA") that get
  // pasted by accident. Real provider keys only contain [A-Za-z0-9_-]; any bullet or
  // asterisk glyph means this is a masked placeholder, not a usable key.
  if (/[•*]/.test(raw)) return '';
  // Prevent fully punctuation/placeholder strings from being treated as real keys.
  if (/^[.\-_\s]{8,}$/.test(raw)) return '';
  // Accept accidental "Bearer sk-..." paste in env/manual settings.
  const withoutBearer = raw.replace(/^Bearer\s+/i, '').trim();
  // Accept accidental quote wrapping from env UI copy/paste.
  const unquoted = withoutBearer.replace(/^['"]|['"]$/g, '').trim();
  // Provider API keys (OpenAI sk-..., Anthropic sk-ant-..., Google AIza...) never
  // contain whitespace. Netlify multiline paste can inject stray spaces/newlines
  // that make an otherwise-correct key fail with `invalid_api_key`, so strip them.
  return unquoted.replace(/\s+/g, '');
}

function readEnv(env: Record<string, string | undefined>, name: string): string {
  return normalizeKey(env[name]);
}

function normalizeCountryCode(input: NullableString): string {
  return (input ?? '').toString().trim().toUpperCase();
}

function buildCountryCandidates(params: {
  countryCode?: CountryCode | NullableString;
  fallbackCountryCodes?: Array<CountryCode | NullableString>;
}): string[] {
  const seen = new Set<string>();
  const push = (candidate: NullableString) => {
    const country = normalizeCountryCode(candidate);
    if (!country || country === 'GLOBAL' || seen.has(country)) return;
    seen.add(country);
  };
  push(params.countryCode);
  (params.fallbackCountryCodes ?? []).forEach(push);
  return [...seen];
}

function candidateCountryKeys(country: string): string[] {
  const base = [
    `VITE_OPENAI_API_KEY_${country}`,
    `VITE_LLM_API_KEY_${country}`,
    `VITE_API_KEY_${country}`,
    `VITE_IMAGE_API_KEY_${country}`,
    `VITE_RFT_${country}`,
    `RFT_${country}`,
  ];
  // Some teams manage Belgium+Netherlands together under BNL.
  if (country === 'BE' || country === 'NL') {
    base.push('VITE_RFT_BNL', 'RFT_BNL');
  }
  return base;
}

function candidateLocalCountryKeys(country: string): string[] {
  const base = [
    `RFT_LOCAL_${country}`,
    `VITE_RFT_LOCAL_${country}`,
  ];
  if (country === 'BE' || country === 'NL') {
    base.push('RFT_LOCAL_BNL', 'VITE_RFT_LOCAL_BNL');
  }
  return base;
}

function candidateLocalFallbackKeys(): string[] {
  return [
    'RFT_LOCAL_TEST_API_KEY',
    'VITE_RFT_LOCAL_TEST_API_KEY',
    'RFT_LOCAL_DEFAULT',
    'VITE_RFT_LOCAL_DEFAULT',
  ];
}

function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  keys.forEach((k) => {
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  });
  return out;
}

function keySuffix(value: string): string {
  const normalized = normalizeKey(value);
  return normalized ? normalized.slice(-4) : '';
}

function inferCountryFromMatchedKeyName(keyName: string | null): string | null {
  if (!keyName) return null;
  const routeCountry = parseCountryRouteToken(keyName);
  if (routeCountry) return routeCountry;
  const match = keyName.match(/(?:_|^)(UK|DE|IT|ES|FR|BE|NL|PL|SE|GLOBAL|BNL)$/);
  return match ? match[1] : null;
}

function shouldEmitKeyRoutingDebug(env: Record<string, string | undefined>): boolean {
  if (env.DEV) return true;
  try {
    const flag = globalThis.localStorage?.getItem('rft.debug.keyRouting');
    return flag === '1' || flag === 'true';
  } catch {
    return false;
  }
}

function emitKeyRoutingDebug(params: {
  env: Record<string, string | undefined>;
  countryCandidates: string[];
  fallbackCountryCodes?: Array<CountryCode | NullableString>;
  matchedType: MatchedKeyType;
  matchedKeyName: string | null;
  resolvedKey: string;
  hasManualKey: boolean;
}): void {
  if (!shouldEmitKeyRoutingDebug(params.env)) return;
  const matchedCountry = inferCountryFromMatchedKeyName(params.matchedKeyName);
  const signature = JSON.stringify({
    matchedType: params.matchedType,
    matchedKeyName: params.matchedKeyName,
    matchedCountry,
    suffix: keySuffix(params.resolvedKey),
    countries: params.countryCandidates,
  });
  if (KEY_ROUTING_DEBUG_CACHE.has(signature)) return;
  KEY_ROUTING_DEBUG_CACHE.add(signature);

  console.info('[RFT] API key routing', {
    matchedType: params.matchedType,
    matchedKeyName: params.matchedKeyName,
    matchedCountry,
    keySuffix: keySuffix(params.resolvedKey),
    countryCandidates: params.countryCandidates,
    fallbackCountryCodes: params.fallbackCountryCodes ?? [],
    hasManualKey: params.hasManualKey,
  });
}

/**
 * Resolve API key for AI features:
 * 1) Manual key saved in workspace settings (highest priority)
 * 2) Local-test-only env vars (DEV mode only; separated from production)
 * 3) Country-specific Netlify env vars
 * 4) Global Netlify env vars
 */
export function resolveWorkspaceApiKey(params: {
  manualKey?: NullableString;
  countryCode?: CountryCode | NullableString;
  fallbackCountryCodes?: Array<CountryCode | NullableString>;
}): string {
  const env = import.meta.env as unknown as Record<string, string | undefined>;
  return resolveWorkspaceApiKeyFromEnv(env, params);
}

export function resolveWorkspaceApiKeyFromEnv(
  env: Record<string, string | undefined>,
  params: {
    manualKey?: NullableString;
    countryCode?: CountryCode | NullableString;
    fallbackCountryCodes?: Array<CountryCode | NullableString>;
  },
): string {
  const manual = normalizeKey(params.manualKey);
  const countryCandidates = buildCountryCandidates(params);
  const countryScopedKeys = countryCandidates.flatMap((country) => candidateCountryKeys(country));
  const localCountryKeys = countryCandidates.flatMap((country) => candidateLocalCountryKeys(country));
  const localFallbackKeys = candidateLocalFallbackKeys();

  const globalKeys = [
    'VITE_OPENAI_API_KEY',
    'VITE_LLM_API_KEY',
    'VITE_API_KEY',
    'VITE_IMAGE_API_KEY',
    'VITE_RFT_GLOBAL',
    'RFT_GLOBAL',
    'VITE_RFT_DEFAULT',
    'RFT_DEFAULT',
  ];

  // Temporary cross-country fallback: route every workspace through the DE key when its
  // own country key is missing/masked (Netlify marks per-country keys as secret, which
  // redacts them out of the client build). Remove once per-country keys are exposed.
  const deFallbackKeys = [...candidateCountryKeys('DE'), ...candidateLocalCountryKeys('DE')];

  const envKeys = uniqueKeys([...countryScopedKeys, ...deFallbackKeys, ...globalKeys]);
  const localDevKeys = uniqueKeys([...localCountryKeys, ...localFallbackKeys, ...deFallbackKeys]);

  // In production, country env keys take priority. If a country key is missing,
  // we explicitly default to DE before falling back to global keys.
  // This keeps cross-country routing deterministic while preserving per-country
  // overrides when configured.
  //
  // As a safety net, the RFT_LOCAL_* keys are tried before the manual key: when a
  // country context value is misconfigured (e.g. a masked placeholder pasted into
  // Production), a valid key set in another context still lets AI features work.
  // In local dev, keep manual key first for quick testing.
  const keysToCheck = env.DEV
    ? [manual ? '__MANUAL__' : '', ...localDevKeys, ...envKeys]
    : [...envKeys, ...localDevKeys, manual ? '__MANUAL__' : ''];

  let matchedType: MatchedKeyType = 'none';
  let matchedKeyName: string | null = null;
  let resolvedKey = '';

  for (const keyName of keysToCheck) {
    if (keyName === '__MANUAL__') {
      matchedType = 'manual';
      matchedKeyName = '__MANUAL__';
      resolvedKey = manual;
      break;
    }
    const value = readEnv(env, keyName);
    if (value) {
      matchedType = 'env';
      matchedKeyName = keyName;
      resolvedKey = value;
      break;
    }
  }

  if (!resolvedKey) {
    // No client-visible key. In production, Netlify marks per-country keys as
    // secret, which redacts them out of the browser bundle by design. Instead of
    // returning an empty key (which blocks AI features), emit a country-route
    // token so the same-origin proxy resolves the real key server-side, using the
    // workspace country first and DE as fallback.
    const primaryCountry = countryCandidates[0] ?? '';
    resolvedKey = `${COUNTRY_ROUTE_PREFIX}${primaryCountry}`;
    matchedType = 'route';
    matchedKeyName = resolvedKey;
  }

  emitKeyRoutingDebug({
    env,
    countryCandidates,
    fallbackCountryCodes: params.fallbackCountryCodes,
    matchedType,
    matchedKeyName,
    resolvedKey,
    hasManualKey: Boolean(manual),
  });

  return resolvedKey;
}

