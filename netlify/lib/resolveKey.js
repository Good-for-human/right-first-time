// Shared server-side OpenAI key resolution for Netlify Functions.
// Keys live ONLY in Netlify env vars and are resolved here per country, with a
// DE fallback, then global keys. They are never exposed to the browser bundle.

// Strip whitespace / quotes / "Bearer " prefix that can sneak in from env UI paste.
export function normalizeKey(value) {
  const raw = (value == null ? '' : String(value)).trim();
  if (!raw) return '';
  if (/[•*]/.test(raw)) return '';
  const withoutBearer = raw.replace(/^Bearer\s+/i, '').trim();
  const unquoted = withoutBearer.replace(/^['"]|['"]$/g, '').trim();
  return unquoted.replace(/\s+/g, '');
}

// Per-country env var candidates, mirroring src/lib/apiKeyResolver.ts naming.
function candidateCountryEnvNames(country) {
  if (!country) return [];
  const names = [
    `RFT_${country}`,
    `VITE_RFT_${country}`,
    `VITE_OPENAI_API_KEY_${country}`,
    `VITE_LLM_API_KEY_${country}`,
    `VITE_API_KEY_${country}`,
    `VITE_IMAGE_API_KEY_${country}`,
  ];
  // Belgium + Netherlands are managed together under BNL.
  if (country === 'BE' || country === 'NL') {
    names.push('RFT_BNL', 'VITE_RFT_BNL');
  }
  return names;
}

const GLOBAL_ENV_NAMES = [
  'RFT_GLOBAL',
  'VITE_RFT_GLOBAL',
  'RFT_DEFAULT',
  'VITE_RFT_DEFAULT',
  'OPENAI_API_KEY',
  'VITE_OPENAI_API_KEY',
  'VITE_LLM_API_KEY',
  'VITE_API_KEY',
  'VITE_IMAGE_API_KEY',
];

/**
 * Resolve the real OpenAI key from server-side env vars.
 * Order: requested country → DE fallback → global. Keys never reach the browser.
 * @returns {{ key: string, source: string|null }}
 */
export function resolveServerKey(country) {
  const upper = (country || '').toString().trim().toUpperCase();
  const tryNames = [];
  if (upper && upper !== 'GLOBAL') {
    tryNames.push(...candidateCountryEnvNames(upper));
  }
  // Explicit DE fallback before global keys.
  tryNames.push(...candidateCountryEnvNames('DE'));
  tryNames.push(...GLOBAL_ENV_NAMES);

  const seen = new Set();
  for (const name of tryNames) {
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const value = normalizeKey(process.env[name]);
    if (value) return { key: value, source: name };
  }
  return { key: '', source: null };
}
