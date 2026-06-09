const ALLOWED_ENDPOINTS = new Set(['/v1/chat/completions', '/v1/responses']);

function buildHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    ...extra,
  };
}

// Strip whitespace / quotes / "Bearer " prefix that can sneak in from env UI paste.
function normalizeKey(value) {
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
 */
function resolveServerKey(country) {
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

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: buildHeaders(),
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(event.body || '{}');
  } catch {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Invalid JSON body' }),
    };
  }

  const endpoint = typeof parsed.endpoint === 'string' ? parsed.endpoint.trim() : '';
  const clientKey = normalizeKey(parsed.apiKey);
  const country = typeof parsed.country === 'string' ? parsed.country : '';
  const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Unsupported endpoint' }),
    };
  }
  if (!payload) {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing payload' }),
    };
  }

  // A valid client key (manual override) wins; otherwise resolve server-side.
  let apiKey = clientKey;
  let keySource = clientKey ? 'client' : null;
  if (!apiKey) {
    const resolved = resolveServerKey(country);
    apiKey = resolved.key;
    keySource = resolved.source;
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error:
          'No OpenAI API key configured on the server. Set RFT_DE (and per-country RFT_<COUNTRY>) env vars in Netlify.',
      }),
    };
  }

  try {
    const upstream = await fetch(`https://api.openai.com${endpoint}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const raw = await upstream.text();
    return {
      statusCode: upstream.status,
      headers: buildHeaders({
        'Cache-Control': 'no-store',
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        // Non-secret hint for debugging which env var served the request.
        'X-RFT-Key-Source': keySource || 'unknown',
      }),
      body: raw,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        error: err instanceof Error ? err.message : String(err),
      }),
    };
  }
};
