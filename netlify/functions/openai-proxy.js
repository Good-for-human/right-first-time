const ALLOWED_ENDPOINTS = new Set(['/v1/chat/completions', '/v1/responses']);

function buildHeaders(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    ...extra,
  };
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
  const apiKey = typeof parsed.apiKey === 'string' ? parsed.apiKey.trim() : '';
  const payload = parsed.payload && typeof parsed.payload === 'object' ? parsed.payload : null;

  if (!ALLOWED_ENDPOINTS.has(endpoint)) {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Unsupported endpoint' }),
    };
  }
  if (!apiKey) {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing apiKey' }),
    };
  }
  if (!payload) {
    return {
      statusCode: 400,
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ error: 'Missing payload' }),
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
