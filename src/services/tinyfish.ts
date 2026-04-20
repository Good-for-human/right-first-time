import type { AplusModule, RawListing, TinyfishRequest, TinyfishResponse } from '@/types';

const TINYFISH_EXTRACT_URL = 'https://api.tinyfish.ai/v1/extract';
const TINYFISH_AGENT_URL   = 'https://agent.tinyfish.ai/v1/automation/run-sse';

// ── Structured result from the Agent API ────────────────────
export type { AplusModule };

export interface FetchedListing {
  title: string;
  asin: string;
  brand?: string;
  bullets: string[];
  description: string;
  price?: string;
  /** Technical specs as flat key→value map */
  specs?: Record<string, string>;
  /** CDN URLs of main product images */
  images?: string[];
  /** A+ content modules (text + optional image) */
  aplus?: AplusModule[];
}

// ── Helpers ──────────────────────────────────────────────────
export function extractAsinFromUrl(url: string): string {
  // Matches /dp/BXXXXXXXXXX or /gp/product/BXXXXXXXXXX
  const m = url.match(/(?:\/dp\/|\/gp\/product\/)([A-Z0-9]{10})/i);
  return m ? m[1].toUpperCase() : '';
}

function tryParseJson(raw: string): Record<string, unknown> | null {
  // Strip optional markdown code-fence wrapper
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch { return null; }
}

// ── Field selection ──────────────────────────────────────────
export type FetchField = 'bullets' | 'description' | 'price' | 'specs' | 'images' | 'aplus';

export const ALL_FETCH_FIELDS: FetchField[] = [
  'bullets', 'description', 'price', 'specs', 'images', 'aplus',
];

export const FETCH_FIELD_LABELS: Record<FetchField, string> = {
  bullets:     '五点描述',
  description: '产品描述',
  price:       '价格',
  specs:       '技术参数',
  images:      '产品图片',
  aplus:       'A+ 内容',
};

/** Build a TinyFish goal prompt for only the selected fields. */
function buildGoal(fields: Set<FetchField>): string {
  const lines: string[] = [
    '  title        (string)   Full product title as shown on the page.',
    '  asin         (string)   10-character ASIN or product code from URL. Empty string if not found.',
    '  brand        (string)   Brand / manufacturer name.',
  ];

  if (fields.has('price')) {
    lines.push('  price        (string)   Price with currency symbol if visible, otherwise empty string.');
  }
  if (fields.has('bullets')) {
    lines.push('  bullets      (string[]) All feature bullet points (the "About this item" / key-features list). Include every bullet.');
  }
  if (fields.has('description')) {
    lines.push('  description  (string)   Full product description text (Overview section or product description paragraph).');
  }
  if (fields.has('specs')) {
    lines.push([
      '  specs        (object)   Technical specification table as flat key→value object.',
      '               Keys are spec names (e.g. "WiFi Standards"). Values are strings. Include all rows.',
    ].join('\n'));
  }
  if (fields.has('images')) {
    lines.push([
      '  images       (string[]) Absolute URLs (https://...) of main product images in the gallery.',
      '               Only product images, not icons. Return empty array if not accessible.',
    ].join('\n'));
  }
  if (fields.has('aplus')) {
    lines.push([
      '  aplus        (array)    A+ content modules. Each item: { headline (string), body (string), imageUrl (string) }.',
      '               Return empty array if no A+ content found.',
    ].join('\n'));
  }

  // Emit stub values for omitted optional fields so the JSON schema stays consistent
  const stubs: string[] = [];
  const optional: FetchField[] = ['bullets', 'description', 'price', 'specs', 'images', 'aplus'];
  for (const f of optional) {
    if (!fields.has(f)) {
      const stub: Record<FetchField, string> = {
        bullets:     '  bullets      (string[]) Return empty array [].',
        description: '  description  (string)   Return empty string "".',
        price:       '  price        (string)   Return empty string "".',
        specs:       '  specs        (object)   Return empty object {}.',
        images:      '  images       (string[]) Return empty array [].',
        aplus:       '  aplus        (array)    Return empty array [].',
      };
      stubs.push(stub[f]);
    }
  }

  return [
    'Extract the product listing content from this page.',
    'Return ONLY a valid JSON object — no markdown, no explanation — with exactly these keys:',
    '',
    ...lines,
    ...(stubs.length ? ['', '// Return stubs for unused fields so JSON is always complete:', ...stubs] : []),
  ].join('\n');
}

// ── Agent API (run-sse) ──────────────────────────────────────
/**
 * Calls the TinyFish Agent API (SSE streaming) to extract a product listing.
 *
 * SSE event format (official API):
 *   { "type": "STARTED",   "run_id": "...", "timestamp": "..." }
 *   { "type": "PROGRESS",  "run_id": "...", "purpose": "...", "timestamp": "..." }
 *   { "type": "HEARTBEAT", "timestamp": "..." }
 *   { "type": "COMPLETE",  "run_id": "...", "status": "COMPLETED", "result": {...} }
 *
 * Progress log lines are delivered to `onLog` as they arrive.
 * `fields` controls which content types are requested (defaults to all).
 * Returns a structured FetchedListing once the COMPLETE event fires.
 */
export async function fetchListingSSE(
  url: string,
  apiKey: string,
  fields: Set<FetchField> = new Set(ALL_FETCH_FIELDS),
  onLog?: (msg: string) => void,
): Promise<FetchedListing> {
  const goal = buildGoal(fields);

  const response = await fetch(TINYFISH_AGENT_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ url, goal }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => String(response.status));
    throw new Error(`TinyFish ${response.status}: ${err}`);
  }
  if (!response.body) throw new Error('TinyFish: empty response body');

  // ── Parse SSE stream ─────────────────────────────────────
  const reader  = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  // We collect the COMPLETE event (which holds the final result object)
  let completeEvent: Record<string, unknown> | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const raw = trimmed.slice(5).trim();
    if (!raw || raw === '[DONE]') return;

    let event: Record<string, unknown> | null = null;
    try { event = JSON.parse(raw); } catch { return; }
    if (!event) return;

    const type = event['type'] as string | undefined;

    // Surface progress messages in the log panel
    if (type === 'PROGRESS') {
      const purpose = event['purpose'] as string | undefined;
      if (purpose && onLog) onLog(purpose);
    }

    // Capture the terminal event
    if (type === 'COMPLETE') {
      completeEvent = event;
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }
  if (buffer) processLine(buffer);

  // ── Validate completion ──────────────────────────────────
  if (!completeEvent) throw new Error('TinyFish returned no output');

  const status = completeEvent['status'] as string | undefined;
  if (status === 'FAILED') {
    const errObj = completeEvent['error'] as Record<string, unknown> | undefined;
    const msg = (errObj?.['message'] as string) ?? completeEvent['help_message'] as string ?? 'run failed';
    throw new Error(`TinyFish: ${msg}`);
  }

  // result is a JSON object returned directly by the agent
  const raw = completeEvent['result'];

  // Handle both cases: result is already an object, or result is a JSON string
  let data: Record<string, unknown> | null = null;
  if (raw && typeof raw === 'object') {
    data = raw as Record<string, unknown>;
  } else if (typeof raw === 'string') {
    data = tryParseJson(raw);
  }

  if (data) {
    return {
      title:       (data['title']       as string)                 ?? '',
      asin:        (data['asin']        as string)                 ?? extractAsinFromUrl(url),
      brand:       (data['brand']       as string)                 ?? undefined,
      bullets:     (data['bullets']     as string[])               ?? [],
      description: (data['description'] as string)                 ?? '',
      price:       (data['price']       as string)                 ?? undefined,
      specs:       (data['specs']       as Record<string, string>) ?? undefined,
      images:      (data['images']      as string[])               ?? [],
      aplus:       (data['aplus']       as AplusModule[])          ?? [],
    };
  }

  // Last resort: result was not a parseable object
  throw new Error(`TinyFish: unexpected result format — ${JSON.stringify(raw)}`);
}

// ── Legacy extract API (kept for DataFetchAgent) ─────────────
const LISTING_SCHEMA = {
  title: 'string',
  bullets: 'string[]',
  description: 'string',
  specs: 'object',
};

export async function fetchListingByUrl(
  url: string,
  apiKey: string,
): Promise<RawListing> {
  const body: TinyfishRequest = { url, schema: LISTING_SCHEMA };
  const response = await fetch(TINYFISH_EXTRACT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tinyfish API error ${response.status}: ${errorText}`);
  }
  const json: TinyfishResponse = await response.json();
  return json.data;
}

export function buildAmazonUrl(asin: string): string {
  return `https://www.amazon.com/dp/${asin}`;
}

export async function fetchListingByAsin(
  asin: string,
  apiKey: string,
  referenceUrl?: string,
): Promise<RawListing> {
  const url = referenceUrl?.trim() || buildAmazonUrl(asin);
  return fetchListingByUrl(url, apiKey);
}
