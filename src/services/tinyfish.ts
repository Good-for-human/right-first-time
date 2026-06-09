import type {
  AplusModule,
  RawListing,
  TinyfishRequest,
  TinyfishResponse,
  BusinessCountryCode,
  LanguageCode,
} from '@/types';

const TINYFISH_EXTRACT_URL = 'https://api.tinyfish.ai/v1/extract';
const TINYFISH_AGENT_URL   = 'https://agent.tinyfish.ai/v1/automation/run-sse';

const AMAZON_MARKETPLACE_HOSTS: Record<BusinessCountryCode, string> = {
  UK: 'www.amazon.co.uk',
  DE: 'www.amazon.de',
  IT: 'www.amazon.it',
  ES: 'www.amazon.es',
  FR: 'www.amazon.fr',
  BE: 'www.amazon.com.be',
  NL: 'www.amazon.nl',
  PL: 'www.amazon.pl',
  SE: 'www.amazon.se',
};

const LANGUAGE_DISPLAY: Partial<Record<LanguageCode, string>> = {
  en: 'English',
  de: 'German',
  it: 'Italian',
  es: 'Spanish',
  fr: 'French',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  zh: 'Chinese',
};

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

function tryParseJson(raw: string): unknown | null {
  // Strip optional markdown code-fence wrapper
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try { return JSON.parse(stripped); } catch { return null; }
}

function extractHttpUrlsFromText(text: string): string[] {
  const out: string[] = [];
  const regex = /https?:\/\/[^\s"'()<>{}\\]+/gi;
  const matches = text.match(regex) ?? [];
  matches.forEach((m) => {
    const cleaned = m.replace(/[),.;]+$/, '');
    if (cleaned) out.push(cleaned);
  });
  return out;
}

function readImageUrls(raw: unknown): string[] {
  const collected: string[] = [];
  const visit = (value: unknown): void => {
    if (!value) return;

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) return;
      if (/^https?:\/\//i.test(trimmed)) {
        collected.push(trimmed);
        return;
      }
      if (trimmed.includes('http')) {
        collected.push(...extractHttpUrlsFromText(trimmed));
      }
      const parsed = tryParseJson(trimmed);
      if (parsed) visit(parsed);
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value !== 'object') return;
    const obj = value as Record<string, unknown>;

    // Common image URL shapes from extraction agents.
    const directUrlKeys = ['url', 'src', 'image', 'imageUrl', 'image_url', 'hiRes', 'large', 'mainUrl'];
    directUrlKeys.forEach((k) => {
      const v = obj[k];
      if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) {
        collected.push(v.trim());
      }
    });

    // Common nested containers.
    ['images', 'imageUrls', 'gallery', 'items', 'results', 'assets', 'thumbs', 'thumbnails', 'variants'].forEach((k) => {
      if (k in obj) visit(obj[k]);
    });

    // Generic pass for hidden style/url fields from dynamic DOM dumps.
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === 'string' && v.includes('http')) {
        collected.push(...extractHttpUrlsFromText(v));
        return;
      }
      if (v && typeof v === 'object' && /(image|gallery|thumb|asset|media|style|url|src)/i.test(k)) {
        visit(v);
      }
    });
  };

  visit(raw);
  return collected;
}

function isAmazonProductUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (!host.includes('amazon.')) return false;
    const path = u.pathname.toLowerCase();
    return path.includes('/dp/') || path.includes('/gp/product/');
  } catch {
    return false;
  }
}

function isAmazonHost(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes('amazon.');
  } catch {
    return false;
  }
}

function normalizeAmazonProductUrl(url: string): string {
  const raw = url.trim();
  if (!raw || !isAmazonHost(raw)) return raw;
  const asin = extractAsinFromUrl(raw);
  if (!asin) return raw;
  try {
    const host = new URL(raw).hostname;
    return `https://${host}/dp/${asin}`;
  } catch {
    return raw;
  }
}

/**
 * For Amazon product URLs, route crawl to the user's marketplace domain
 * whenever we can infer ASIN. This increases chance of locale-native content.
 */
export function normalizeAmazonUrlForCountry(
  url: string,
  countryCode?: BusinessCountryCode | null,
): string {
  const raw = url.trim();
  if (!countryCode || !raw || !isAmazonHost(raw)) return raw;
  const targetHost = AMAZON_MARKETPLACE_HOSTS[countryCode];
  if (!targetHost) return raw;
  const asin = extractAsinFromUrl(raw);
  if (!asin) return raw;
  return `https://${targetHost}/dp/${asin}`;
}

function isLikelyReviewImage(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('customer-images') ||
    lower.includes('customerreviews') ||
    lower.includes('/review') ||
    lower.includes('/reviews') ||
    lower.includes('ugc') ||
    lower.includes('user-generated') ||
    lower.includes('/video')
  );
}

function isLikelyAmazonOverviewImage(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();
    const isAmazonCdn =
      host.includes('media-amazon.com') ||
      host.includes('ssl-images-amazon.com') ||
      host.includes('images-amazon.com');
    if (!isAmazonCdn) return false;
    // Amazon main gallery images are usually under /images/I/.
    return path.includes('/images/i/');
  } catch {
    return false;
  }
}

function imageDedupeKey(url: string): string {
  const noQuery = url.split('?')[0];
  // Amazon often emits the same image with different size/crop suffixes in
  // the filename (e.g. "._AC_SL1500_."), so we collapse those for dedupe only.
  return noQuery.replace(/\._[^.]+_\./g, '.').toLowerCase();
}

function sanitizeFetchedImages(images: string[], sourceUrl: string): string[] {
  const cleaned = images
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => /^https?:\/\//i.test(u));

  const seen = new Set<string>();
  const deduped: string[] = [];
  cleaned.forEach((u) => {
    const key = imageDedupeKey(u);
    if (seen.has(key)) return;
    seen.add(key);
    deduped.push(u);
  });

  if (!isAmazonProductUrl(sourceUrl)) return deduped;

  // Amazon product pages: strictly prefer top overview/gallery assets.
  const nonReview = deduped.filter((u) => !isLikelyReviewImage(u));
  const overviewGallery = nonReview.filter((u) => isLikelyAmazonOverviewImage(u));
  if (overviewGallery.length > 0) return overviewGallery;
  if (nonReview.length > 0) return nonReview;

  // Fallback: if every URL looks suspicious, keep original deduped list rather
  // than dropping all images.
  return deduped;
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
function buildGoal(
  fields: Set<FetchField>,
  preferredLanguage?: LanguageCode,
  extraInstructions?: string,
  includeCoreFields = true,
): string {
  const lines: string[] = [];
  if (includeCoreFields) {
    lines.push(
      '  title        (string)   Full product title as shown on the page.',
      '  asin         (string)   10-character ASIN or product code from URL. Empty string if not found.',
      '  brand        (string)   Brand / manufacturer name.',
    );
  }

  if (fields.has('price')) {
    lines.push('  price        (string)   Price with currency symbol if visible, otherwise empty string.');
  }
  if (fields.has('bullets')) {
    lines.push('  bullets      (string[]) Every feature bullet ("About this item" / key-features), VERBATIM and complete. Include all bullets; do not merge, shorten, or reorder them.');
  }
  if (fields.has('description')) {
    lines.push('  description  (string)   Full product description text VERBATIM (Overview / product description). Preserve paragraphs and line breaks; do not summarize or truncate.');
  }
  if (fields.has('specs')) {
    lines.push([
      '  specs        (object)   ALL technical specification rows as a flat key→value object.',
      '               Scan the ENTIRE page and merge EVERY spec table/section — e.g. "Technical Details", "Additional Information",',
      '               "Product Information", "Hardware Features", "Wireless Features", "Others". Do not stop at the first table.',
      '               Keys are spec names exactly as shown; values are the full cell text VERBATIM (preserve units, codes, and',
      '               multi-line content via newline characters). Include EVERY row — do not skip, sample, or summarize any value.',
      '               If the same key appears in multiple tables, keep the most complete value.',
    ].join('\n'));
  }
  if (fields.has('images')) {
    lines.push([
      '  images       (string[]) Absolute URLs (https://...) of MAIN overview/gallery product images.',
      '               AMAZON STRICT RULE: only take images from the top product gallery/overview carousel.',
      '               Do NOT include customer review images, UGC, video thumbnails, sponsored blocks, related products, or A+ detail modules.',
      '               Keep natural gallery order and deduplicate near-identical variants.',
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
    '',
    'ACCURACY POLICY (critical — follow exactly):',
    '- Extract every value VERBATIM, exactly as displayed: same wording, numbers, units, symbols, model codes, casing, and order.',
    '- NEVER summarize, paraphrase, reformat, round, compute, or infer values, quantities, or counts.',
    '- Example: if the page shows "1× High-Gain Tri-Band Antenna (2T2R)", keep it exactly — do NOT change it to "2×" or drop "(2T2R)".',
    '- Preserve the FULL text of each value, including multi-line content; join lines within one value using newline characters. Do not truncate or shorten long values.',
    '- Capture EVERY item/row. Do not skip, sample, or condense lists with many entries (e.g. per-band signal rates, multiple wireless standards).',
    '- If a value is not visibly present on the page, return an empty string/array — never guess or fabricate.',
    '',
    ...(preferredLanguage
      ? [
          `Language priority: extract visible listing copy in ${LANGUAGE_DISPLAY[preferredLanguage] ?? preferredLanguage}.`,
          `If the page exposes multiple locales, prefer ${LANGUAGE_DISPLAY[preferredLanguage] ?? preferredLanguage} text from the main product area (title/bullets/description/specs).`,
          'Do NOT machine-translate. Extract only what is actually shown on-page for that locale.',
          '',
        ]
      : []),
    ...(extraInstructions?.trim()
      ? [
          'Additional extraction requirements (user-provided):',
          extraInstructions.trim(),
          'Apply them only when the content is visibly present on-page. Do not fabricate missing values.',
          '',
        ]
      : []),
    'Return ONLY a valid JSON object — no markdown, no explanation — with exactly these keys:',
    '',
    ...lines,
    ...(stubs.length ? ['', '// Return stubs for unused fields so JSON is always complete:', ...stubs] : []),
  ].join('\n');
}

function buildAmazonImageRecoveryGoal(preferredLanguage?: LanguageCode, extraInstructions?: string): string {
  return [
    'Extract ONLY the main product gallery images from this Amazon product detail page.',
    ...(preferredLanguage
      ? [`Prefer page content for locale: ${LANGUAGE_DISPLAY[preferredLanguage] ?? preferredLanguage}.`]
      : []),
    ...(extraInstructions?.trim()
      ? [
          'Additional extraction requirements (user-provided):',
          extraInstructions.trim(),
        ]
      : []),
    'Scope is STRICTLY the top overview carousel (main hero image + left/right thumbnail strip).',
    'Do NOT include customer review images, UGC, payment banners, ads, videos, recommendation cards, logos, or A+ modules.',
    'Prefer full-size canonical URLs on Amazon CDN, typically under /images/I/.',
    'Return every unique gallery image in natural carousel order.',
    'Return ONLY valid JSON with exactly this shape:',
    '{"images":["https://..."]}',
  ].join('\n');
}

async function runTinyFishAgentGoal(
  url: string,
  apiKey: string,
  goal: string,
  onLog?: (msg: string) => void,
): Promise<Record<string, unknown>> {
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

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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
    if (type === 'PROGRESS') {
      const purpose = event['purpose'] as string | undefined;
      if (purpose && onLog) onLog(purpose);
    }
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

  if (!completeEvent) throw new Error('TinyFish returned no output');

  const status = completeEvent['status'] as string | undefined;
  if (status === 'FAILED') {
    const errObj = completeEvent['error'] as Record<string, unknown> | undefined;
    const msg =
      (errObj?.['message'] as string | undefined) ??
      (completeEvent['help_message'] as string | undefined) ??
      'run failed';
    throw new Error(`TinyFish: ${msg}`);
  }

  const raw = completeEvent['result'];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  if (Array.isArray(raw)) {
    return { images: raw };
  }
  if (typeof raw === 'string') {
    const parsed = tryParseJson(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    if (Array.isArray(parsed)) {
      return { images: parsed };
    }
  }
  throw new Error(`TinyFish: unexpected result format — ${JSON.stringify(raw)}`);
}

async function recoverAmazonOverviewImages(
  url: string,
  apiKey: string,
  onLog?: (msg: string) => void,
  preferredLanguage?: LanguageCode,
  extraInstructions?: string,
): Promise<string[]> {
  onLog?.('Amazon overview enhancer: run dedicated gallery extraction…');
  const result = await runTinyFishAgentGoal(
    url,
    apiKey,
    buildAmazonImageRecoveryGoal(preferredLanguage, extraInstructions),
    onLog,
  );
  const candidate = readImageUrls(result['images'] ?? result['imageUrls'] ?? result['gallery'] ?? result);
  return sanitizeFetchedImages(candidate, url);
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
  preferredLanguage?: LanguageCode,
  extraInstructions?: string,
  leanMode = false,
): Promise<FetchedListing> {
  const crawlUrl = normalizeAmazonProductUrl(url);
  const goal = buildGoal(fields, preferredLanguage, extraInstructions, !leanMode);
  const data = await runTinyFishAgentGoal(crawlUrl, apiKey, goal, onLog);

  let images = sanitizeFetchedImages(
    readImageUrls(data['images'] ?? data['imageUrls'] ?? data['gallery']),
    crawlUrl,
  );

  if (fields.has('images') && isAmazonProductUrl(crawlUrl)) {
    const minExpectedOverviewImages = leanMode ? 4 : 6;
    const likelyIncompleteOverview =
      images.length < minExpectedOverviewImages ||
      images.some((img) => !isLikelyAmazonOverviewImage(img));

    if (likelyIncompleteOverview) {
      try {
        const recovered = await recoverAmazonOverviewImages(
          crawlUrl,
          apiKey,
          onLog,
          preferredLanguage,
          extraInstructions,
        );
        const merged = sanitizeFetchedImages([...recovered, ...images], crawlUrl);
        if (merged.length > images.length) {
          onLog?.(`Amazon overview enhancer: merged ${images.length} -> ${merged.length} images.`);
          images = merged;
        } else if (recovered.length >= images.length && recovered.length >= minExpectedOverviewImages) {
          images = recovered;
        }
      } catch {
        // Keep primary extraction result if dedicated overview extraction fails.
      }
    }
  }

  return {
    title:       (data['title']       as string)                 ?? '',
    asin:        (data['asin']        as string)                 ?? extractAsinFromUrl(crawlUrl),
    brand:       (data['brand']       as string)                 ?? undefined,
    bullets:     (data['bullets']     as string[])               ?? [],
    description: (data['description'] as string)                 ?? '',
    price:       (data['price']       as string)                 ?? undefined,
    specs:       (data['specs']       as Record<string, string>) ?? undefined,
    images,
    aplus:       (data['aplus']       as AplusModule[])          ?? [],
  };
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
