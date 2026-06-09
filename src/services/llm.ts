import type { ContentKey, LLMMessage, LLMModel, LLMResponse } from '@/types';
import { isCountryRouteToken, parseCountryRouteToken } from '@/lib/apiKeyResolver';

// ── Provider routing ──────────────────────────────────────────

type LLMProvider = 'openai' | 'anthropic' | 'google';

const MODEL_PROVIDERS: Record<LLMModel, LLMProvider> = {
  'gpt-5.3-chat-latest': 'openai',
  'gpt-5.4-pro':         'openai',
  'gpt-5.5':             'openai',
  'claude-3-7-sonnet':   'anthropic',
  'claude-3-5-haiku':    'anthropic',
  'gemini-2.5-pro':   'google',
  'gemini-2.5-flash': 'google',
};

const GLOBAL_CATEGORY_ALIASES = new Set(['general', '通用']);

// Canonical OpenAI / Google API model IDs (see platform.openai.com & ai.google.dev)
const MODEL_IDS: Record<LLMModel, string> = {
  'gpt-5.3-chat-latest': 'gpt-5.3-chat-latest',
  'gpt-5.4-pro':         'gpt-5.4-pro',
  'gpt-5.5':             'gpt-5.5',
  'claude-3-7-sonnet':   'claude-3-7-sonnet-20250219',
  'claude-3-5-haiku':    'claude-3-5-haiku-20241022',
  'gemini-2.5-pro':   'gemini-2.5-pro',
  'gemini-2.5-flash': 'gemini-2.5-flash',
};

// Gemini generateContent runs on v1beta for the 2.5 family
const GOOGLE_API_VERSION: Partial<Record<LLMModel, 'v1' | 'v1beta'>> = {
  'gemini-2.5-pro':   'v1beta',
  'gemini-2.5-flash': 'v1beta',
};

// ── Error parsing ─────────────────────────────────────────────

export function parseLLMError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Short-circuit: errors thrown from non-LLM code paths (Firebase Storage,
  // auth, etc.) already carry user-facing Chinese text. Re-running them
  // through the LLM heuristics below has produced spectacular false
  // positives (e.g. a Storage CORS failure being shown as "API 密钥无效"),
  // so we bail out and pass the original message through verbatim.
  if (
    raw.startsWith('Firebase Storage') ||
    raw.startsWith('Firebase ') ||
    raw.includes('未登录账号') ||
    raw.includes('需要 OpenAI API') ||
    raw.includes('安全规则未放行')
  ) {
    return raw;
  }

  // 503 / UNAVAILABLE — Google capacity (often temporary; not specific to target language)
  if (raw.includes('503') || raw.includes('UNAVAILABLE') || raw.includes('high demand')) {
    return 'Google 模型当前负载过高（503 / 暂时不可用），通常几分钟内会恢复。\n已自动重试仍失败时：请稍后再点「翻译」，或在设置中改用 Gemini 2.5 Flash。';
  }
  // 429 quota / rate limit
  if (raw.includes('429')) {
    if (raw.includes('FreeTier') || raw.includes('free_tier') || raw.includes('limit: 0')) {
      return '该模型免费层配额已耗尽（limit: 0）。\n建议：\n• 切换到 Gemini 2.5 Flash\n• 或前往 Google AI Studio 开启付费后使用 Gemini 2.5 Pro';
    }
    return 'API 请求频率超限 (429)。请稍后片刻再试，或换用 GPT-5.3 Chat / Gemini 2.5 Flash 等轻量模型。';
  }
  // 400 unsupported parameter (e.g. max_tokens vs max_completion_tokens on GPT-5.x)
  if (raw.includes('unsupported_parameter') || raw.includes('Unsupported parameter')) {
    const m = raw.match(/'([a-zA-Z_]+)'/);
    const param = m ? m[1] : '某个参数';
    return `当前模型不支持参数 ${param}（400）。这通常是模型与请求字段不匹配引起的，已在新版本中适配；请刷新页面后重试，若仍失败请换用 GPT-5.3 Chat 或 Gemini 2.5 Flash。`;
  }
  // 401 / 403 invalid key — match status codes or auth-specific messages, not a generic "invalid"
  if (
    raw.includes(' 401') || raw.includes(' 403') ||
    raw.includes('Unauthorized') || raw.includes('invalid_api_key') ||
    raw.includes('incorrect_api_key') || raw.includes('invalid x-api-key') ||
    raw.includes('"code":"invalid_api_key"') || raw.includes('"code": "invalid_api_key"')
  ) {
    return 'API 密钥无效或无权限 (401/403)。请检查设置中填写的密钥是否与所选模型厂商匹配：\n• OpenAI 模型 → sk-...\n• Anthropic 模型 → sk-ant-...\n• Google 模型 → AIza...';
  }
  // 400 invalid_request_error (other shape mismatches)
  if (raw.includes('invalid_request_error')) {
    return '请求参数与该模型不兼容（400 invalid_request_error）。请刷新页面后重试，或换用其他模型。';
  }
  // 404 model not found
  if (raw.includes('404') || raw.includes('NOT_FOUND')) {
    return '模型 ID 不存在或你的账号暂无访问权限 (404)。\n建议改用：Gemini 2.5 Flash 或 GPT-5.3 Chat；也可在 Google AI Studio 的 ListModels 中核对当前账号可用模型名。';
  }
  // Network / CORS
  if (raw.includes('Failed to fetch') || raw.includes('NetworkError')) {
    return '网络请求失败。请检查网络连接，或确认 API 是否支持浏览器直接调用（部分 API 需代理）。';
  }
  // JSON parse failure from our translation batch
  if (raw.includes('JSON')) {
    return '模型返回格式异常，翻译解析失败。请重试，或换用其他模型。';
  }
  // Google REST: wrong JSON field names (e.g. system_instruction vs systemInstruction)
  if (raw.includes('INVALID_ARGUMENT') || raw.includes('Unknown name')) {
    return '请求参数与当前 API 不兼容（400）。请更新应用或换用其他模型后重试。';
  }
  return `AI 调用失败：${raw.slice(0, 200)}`;
}

// ── Provider implementations ──────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const OPENAI_PROXY_PATH = '/.netlify/functions/openai-proxy';

async function callOpenAIProxy(
  endpoint: '/v1/chat/completions' | '/v1/responses',
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  // When the frontend has no client-visible key it passes a country-route token.
  // In that case we send only the country so the proxy resolves the real key from
  // server-side env vars (per country, DE fallback). The provider key never leaves
  // the server. A real key (manual override) is forwarded as-is.
  const body: Record<string, unknown> = { endpoint, payload };
  if (isCountryRouteToken(apiKey)) {
    body.country = parseCountryRouteToken(apiKey) ?? '';
  } else {
    body.apiKey = apiKey;
  }
  return fetch(OPENAI_PROXY_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Async image generation (Netlify Background Function + polling) ──────────────
// gpt-image generation routinely exceeds the 10/26s synchronous function limit,
// which returns a 504 "Inactivity Timeout". Image jobs are instead submitted to a
// background function (up to 15 min) that writes the result to Netlify Blobs; the
// frontend polls a fast status function until the job is done or errors.
const OPENAI_IMAGE_BACKGROUND_PATH = '/.netlify/functions/openai-image-background';
const OPENAI_IMAGE_STATUS_PATH = '/.netlify/functions/openai-image-status';

function makeImageJobId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function generateImageViaBackground(
  apiKey: string,
  payload: Record<string, unknown>,
): Promise<{ imageBase64: string; mimeType: 'image/png' }> {
  const jobId = makeImageJobId();
  const submitBody: Record<string, unknown> = { jobId, payload };
  if (isCountryRouteToken(apiKey)) {
    submitBody.country = parseCountryRouteToken(apiKey) ?? '';
  } else {
    submitBody.apiKey = apiKey;
  }

  const submit = await fetch(OPENAI_IMAGE_BACKGROUND_PATH, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(submitBody),
  });
  // Netlify background functions return 202 Accepted. Anything else means the
  // function isn't available (e.g. a plan without background functions) or errored.
  if (submit.status !== 202) {
    const text = await submit.text().catch(() => '');
    throw new Error(`图片生成任务提交失败 (${submit.status})。${text.slice(0, 200)}`);
  }

  const POLL_INTERVAL_MS = 3000;
  const MAX_WAIT_MS = 5 * 60 * 1000;
  const deadline = Date.now() + MAX_WAIT_MS;

  // Give the upstream a head start before the first poll.
  await sleep(2500);

  while (Date.now() < deadline) {
    let statusRes: Response | null = null;
    try {
      statusRes = await fetch(`${OPENAI_IMAGE_STATUS_PATH}?jobId=${encodeURIComponent(jobId)}`);
    } catch {
      statusRes = null;
    }
    if (statusRes && statusRes.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await statusRes.json().catch(() => null);
      if (data?.status === 'done' && typeof data.imageBase64 === 'string' && data.imageBase64) {
        return { imageBase64: data.imageBase64, mimeType: 'image/png' };
      }
      if (data?.status === 'error') {
        throw new Error(data.error || 'OpenAI 图片生成失败。');
      }
      // status === 'pending' → keep polling
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error('图片生成超时（超过 5 分钟仍未完成）。请稍后重试。');
}

async function callOpenAI(
  messages: LLMMessage[],
  model: LLMModel,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const modelId = MODEL_IDS[model];
  // GPT-5.x chat-completions deprecated `max_tokens` in favor of `max_completion_tokens`,
  // and many GPT-5.x variants only accept the default temperature.
  const isGpt5 = /^gpt-5/i.test(modelId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    model: modelId,
    messages,
  };
  if (!isGpt5) {
    body.temperature = temperature;
  }
  if (isGpt5) {
    body.max_completion_tokens = maxTokens;
  } else {
    body.max_tokens = maxTokens;
  }

  const doRequest = async (payload: Record<string, unknown>): Promise<Response> =>
    callOpenAIProxy('/v1/chat/completions', apiKey, payload);

  let response = await doRequest(body);

  // Defensive fallback: account/region rollouts of GPT-5.x parameter shapes vary.
  // If the server reports a parameter mismatch, adjust and retry once.
  if (!response.ok) {
    const errText = await response.text();
    let retryBody: Record<string, unknown> | null = null;

    if (/'max_tokens'/.test(errText) && /unsupported|not supported/i.test(errText)) {
      retryBody = { ...body, max_completion_tokens: maxTokens };
      delete (retryBody as Record<string, unknown>).max_tokens;
    } else if (/'max_completion_tokens'/.test(errText) && /unsupported|not supported/i.test(errText)) {
      retryBody = { ...body, max_tokens: maxTokens };
      delete (retryBody as Record<string, unknown>).max_completion_tokens;
    } else if (/'temperature'/.test(errText) && /unsupported|not supported|does not support/i.test(errText)) {
      retryBody = { ...body };
      delete (retryBody as Record<string, unknown>).temperature;
    }

    if (!retryBody) {
      throw new Error(`OpenAI API error ${response.status}: ${errText}`);
    }
    response = await doRequest(retryBody);
    if (!response.ok) {
      const err2 = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${err2}`);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  return json.choices?.[0]?.message?.content ?? '';
}

async function callAnthropic(
  messages: LLMMessage[],
  model: LLMModel,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const systemMsg = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter((m) => m.role !== 'system');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      max_tokens: maxTokens,
      temperature,
      system: systemMsg,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  return json.content?.[0]?.text ?? '';
}

async function callGoogle(
  messages: LLMMessage[],
  model: LLMModel,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const modelId  = MODEL_IDS[model];
  const apiVer   = GOOGLE_API_VERSION[model] ?? 'v1beta';
  const url      = `https://generativelanguage.googleapis.com/${apiVer}/models/${modelId}:generateContent`;

  const systemText = messages.find((m) => m.role === 'system')?.content ?? '';
  const userMessages = messages.filter((m) => m.role !== 'system');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    contents: userMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    })),
    generationConfig: { temperature, maxOutputTokens: maxTokens },
  };

  // REST JSON uses camelCase (not system_instruction)
  if (systemText) {
    body.systemInstruction = { parts: [{ text: systemText }] };
  }

  const payload = JSON.stringify(body);
  const maxAttempts = 4;
  const baseDelayMs = 1200;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: payload,
    });

    if (response.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const json: any = await response.json();
      return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    }

    const errText = await response.text();
    const retriable =
      response.status === 503 ||
      response.status === 429 ||
      /UNAVAILABLE|high demand|try again later|RESOURCE_EXHAUSTED|overloaded/i.test(errText);

    if (retriable && attempt < maxAttempts) {
      await sleep(baseDelayMs * 2 ** (attempt - 1));
      continue;
    }

    throw new Error(`Google API error ${response.status}: ${errText}`);
  }

  throw new Error('Google API error: max retries exceeded');
}

// ── Public API ────────────────────────────────────────────────

export async function callLLM(
  messages: LLMMessage[],
  model: LLMModel,
  apiKey: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<LLMResponse> {
  const temperature = options?.temperature ?? 0.3;
  const maxTokens   = options?.maxTokens   ?? 1024;
  const provider    = MODEL_PROVIDERS[model];

  let content: string;
  if (provider === 'anthropic') {
    content = await callAnthropic(messages, model, apiKey, temperature, maxTokens);
  } else if (provider === 'google') {
    content = await callGoogle(messages, model, apiKey, temperature, maxTokens);
  } else {
    content = await callOpenAI(messages, model, apiKey, temperature, maxTokens);
  }

  return { content };
}

// ── Translation helper ────────────────────────────────────────

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  it: 'Italian',
  es: 'Spanish',
  nl: 'Dutch',
  pl: 'Polish',
  sv: 'Swedish',
  zh: 'Chinese',
};

const SYSTEM_LANGUAGE_NAMES: Record<'cn' | 'en', string> = {
  cn: 'Simplified Chinese',
  en: 'English',
};

export interface TranslationInput {
  title:       string;
  bullets:     string;
  description: string;
}

export interface TranslationOutput {
  title:       string;
  bullets:     string;
  description: string;
}

/**
 * Translate generic user-authored text between system UI languages.
 * Keeps original meaning and style while preserving punctuation and line breaks.
 */
export async function translateSystemText(
  text: string,
  fromLang: 'cn' | 'en',
  toLang: 'cn' | 'en',
  model: LLMModel,
  apiKey: string,
): Promise<string> {
  const normalized = text.trim();
  if (!normalized || fromLang === toLang) return normalized;

  const fromName = SYSTEM_LANGUAGE_NAMES[fromLang];
  const toName = SYSTEM_LANGUAGE_NAMES[toLang];

  const systemPrompt =
    `You are a precise product-content translator. Translate from ${fromName} to ${toName}. ` +
    'Keep original meaning, tone, punctuation, and line breaks. ' +
    'Output ONLY the translated text with no extra explanation.';

  const raw = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: normalized },
    ],
    model,
    apiKey,
    { temperature: 0.1, maxTokens: 1024 },
  );
  return raw.content.trim();
}

export async function translateContent(
  input: TranslationInput,
  fromLang: string,
  toLang: string,
  model: LLMModel,
  apiKey: string,
): Promise<TranslationOutput> {
  const fromName = LANGUAGE_NAMES[fromLang] ?? fromLang;
  const toName   = LANGUAGE_NAMES[toLang]   ?? toLang;

  // Explicit field-by-field prompt reduces truncation and improves structure adherence
  const systemPrompt =
    `You are a professional Amazon product listing translator. ` +
    `Translate from ${fromName} to ${toName}. ` +
    `IMPORTANT: Preserve ALL formatting exactly — HTML tags (e.g. <h3>, <p>), bullet point line breaks, paragraph blank lines, and technical values must remain unchanged. ` +
    `Translate only the visible text inside tags; never alter or remove any HTML markup. ` +
    `You MUST output ONLY a raw JSON object (no markdown fences, no explanation) with exactly these three keys:\n` +
    `{\n  "title": "<translated title>",\n  "bullets": "<translated bullets, newline-separated>",\n  "description": "<translated description — preserve HTML structure>"\n}`;

  const userPrompt =
    `Translate each field below:\n\n` +
    `TITLE:\n${input.title}\n\n` +
    `BULLETS:\n${input.bullets}\n\n` +
    `DESCRIPTION:\n${input.description}`;

  const raw = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    model, apiKey, { temperature: 0.1, maxTokens: 4096 },
  );

  const parsed = extractJSON<Partial<TranslationOutput>>(raw.content);
  if (!parsed) {
    console.warn('[translateContent] JSON parse failed, raw:', raw.content.slice(0, 200));
    // Last-resort: return empty strings so UI shows nothing rather than raw JSON
    return { title: '', bullets: '', description: '' };
  }

  return {
    title:       parsed.title       ?? '',
    bullets:     parsed.bullets     ?? '',
    description: parsed.description ?? '',
  };
}

/**
 * Translate a single listing section (title / bullets / description).
 * Returns the translated text as a plain string.
 */
export async function translateSection(
  key: ContentKey,
  text: string,
  fromLang: string,
  toLang: string,
  model: LLMModel,
  apiKey: string,
): Promise<string> {
  const fromName = LANGUAGE_NAMES[fromLang] ?? fromLang;
  const toName   = LANGUAGE_NAMES[toLang]   ?? toLang;
  const sectionLabel = key === 'title' ? 'title' : key === 'bullets' ? 'bullet points' : 'description';
  const systemPrompt =
    `You are a professional Amazon product listing translator. ` +
    `Translate the ${sectionLabel} from ${fromName} to ${toName}. ` +
    `IMPORTANT: Preserve ALL formatting exactly — HTML tags (e.g. <h3>, <p>), line breaks, paragraph blank lines, and technical values must remain unchanged. ` +
    `Translate only the visible text inside HTML tags; never alter or remove any HTML markup. ` +
    `Output ONLY the translated text with no explanation, no labels, and no extra commentary.`;
  const raw = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: text },
    ],
    model, apiKey, { temperature: 0.1, maxTokens: 2048 },
  );
  return raw.content.trim();
}

// ── Image analysis helper ─────────────────────────────────────

export async function analyzeProductImages(
  imageUrls: string[],
  rules: string[],
  model: LLMModel,
  apiKey: string,
): Promise<string> {
  const provider = MODEL_PROVIDERS[model];

  if (provider !== 'google') {
    throw new Error('图片理解仅支持 Google Gemini 模型（请在设置中选择 Gemini 2.5 Flash 或 Gemini 2.5 Pro）。');
  }

  const modelId = MODEL_IDS[model];
  const apiVer  = GOOGLE_API_VERSION[model] ?? 'v1beta';
  const url     = `https://generativelanguage.googleapis.com/${apiVer}/models/${modelId}:generateContent`;

  const rulesText = rules.length > 0
    ? `根据以下亚马逊内容规则进行评估：\n${rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}`
    : '请根据亚马逊商品图片最佳实践进行评估。';

  // Build image parts — Gemini supports image URLs directly via fileData or inlineData
  const imageParts = imageUrls.slice(0, 6).map((u) => ({
    fileData: { mimeType: 'image/jpeg', fileUri: u },
  }));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    systemInstruction: {
      parts: [{
        text: `你是一名专业的亚马逊商品图片质量评估专家。请仔细分析以下产品图片，${rulesText}\n\n输出格式：\n**总体评分**：X/10\n**主图分析**：...\n**细节图分析**：...\n**问题与建议**：...`,
      }],
    },
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: '请对以上产品图片进行全面评估，输出中文分析报告。' },
      ],
    }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Google API error ${response.status}: ${err}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? '图片分析返回内容为空。';
}

// ── COSMO Evaluation ─────────────────────────────────────────

export interface EvaluateListingInput {
  title:       string;
  bullets:     string;
  description: string;
  category:    string;
}

/**
 * Ask the model to audit the listing for compliance / quality issues.
 * Uses plain-text output (no JSON) so all models can respond reliably.
 * Returns an EvaluationReport with only the issues found.
 */
export async function evaluateListing(
  input: EvaluateListingInput,
  model: LLMModel,
  apiKey: string,
): Promise<import('@/types').EvaluationReport> {
  const systemPrompt =
    `You are an Amazon product listing compliance and quality auditor.\n` +
    `Analyze the listing and report ONLY actual problems. Do NOT invent issues.\n` +
    `For each problem output EXACTLY one line in this format — nothing else:\n` +
    `WARNING: <brief description of a quality issue>\n` +
    `ERROR: <brief description of a policy/compliance violation>\n\n` +
    `Guidelines:\n` +
    `• WARNING — quality issues: vague claims, missing key specs, weak differentiation\n` +
    `• ERROR — policy violations: prohibited superlatives (best/#1), unverifiable claims, illegal content\n` +
    `• If no issues are found, output exactly: OK\n` +
    `• Maximum 8 lines. No JSON, no markdown, no explanation.`;

  const userPrompt =
    `Audit this Amazon product listing (category: ${input.category}):\n\n` +
    `TITLE:\n${input.title}\n\nBULLETS:\n${input.bullets}\n\nDESCRIPTION:\n${input.description}`;

  const raw = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    model, apiKey, { temperature: 0.1, maxTokens: 512 },
  );

  const lines = raw.content.split('\n').map((l) => l.trim()).filter(Boolean);
  const issues: import('@/types').EvaluationIssue[] = lines
    .filter((l) => /^(WARNING|ERROR):\s/i.test(l))
    .slice(0, 8)
    .map((l) => ({
      type: l.toUpperCase().startsWith('ERROR:') ? 'Error' : 'Warning',
      text: l.replace(/^(WARNING|ERROR):\s*/i, '').trim(),
    }));

  return { issues };
}

// ── Listing generation (AI rewrite) ──────────────────────────

export interface GenerateListingInput {
  title:       string;
  bullets:     string;  // newline-separated
  description: string;
  category:    string;
  language:    string;  // source language code, e.g. 'en' / 'de'
}

/** Instruction row as stored in the app (通用 + category), passed into the LLM verbatim. */
export interface GenerateInstructionRule {
  id: number;
  category: string;
  name: string;
  priority?: string;
  targetSection: string;
}

/** Negative rule row as stored in the app */
export interface GenerateNegativeRule {
  id: number;
  category: string;
  name: string;
  severity?: string;
  targetSection: string;
}

export interface GenerateListingOptions {
  /** Which section to rewrite; others are kept as-is in the output */
  section?: ContentKey | 'all';
  personas?: { name: string; description: string }[];
  /** Active instruction rules from Firestore / Zustand (ids + categories preserved for the prompt) */
  instructionRules?: GenerateInstructionRule[];
  negativeRules?: GenerateNegativeRule[];
  /** Reference benchmark listing — AI follows its style and structure */
  benchmark?: { title: string; bullets: string; description: string };
  /**
   * Task-level reference ASINs (up to 3). Highest priority hint to the model:
   * emulate the style, length, and structure of these top-performing listings.
   */
  referenceAsins?: string[];
  /**
   * Category keyword requirements. Primary keyword must appear prominently (title + first bullet).
   * Secondary keywords included naturally where content allows — exact match required, no synonyms.
   */
  keywords?: { primary: string; secondary: string[] };
}

/**
 * Rewrites an Amazon product listing using COSMO-aligned prompting.
 *
 * Prompt architecture (data-isolation design):
 *   BLOCK 1 — HARD CONSTRAINTS (negative rules, section-scoped, placed FIRST so the model
 *             treats them as an absolute rejection checklist, not mixed with positive guidance)
 *   BLOCK 2 — GENERATION DIRECTIVES (positive instruction rules, tiered by priority)
 *   BLOCK 3 — KEYWORDS (exact-match requirements)
 *   BLOCK 4 — AUDIENCE (personas)
 *   BLOCK 5 — BENCHMARK (optional style reference)
 *
 * Always returns all three fields; the caller decides which to apply.
 */
export async function generateListing(
  input: GenerateListingInput,
  options: GenerateListingOptions,
  model: LLMModel,
  apiKey: string,
): Promise<{ title: string; bullets: string; description: string }> {
  const {
    section = 'all',
    personas = [],
    instructionRules = [],
    negativeRules = [],
    benchmark,
    referenceAsins = [],
    keywords,
  } = options;

  const langName   = LANGUAGE_NAMES[input.language] ?? input.language;
  const isGlobalCategory = (category: string) => GLOBAL_CATEGORY_ALIASES.has(category.trim().toLowerCase());

  // Section scope: only include rules that apply to the section(s) being written.
  // This prevents pollution of the context with rules for untouched sections.
  const appliesToSection = (t: string) => section === 'all' || t === 'all' || t === section;

  const instrFiltered = instructionRules.filter((r) => appliesToSection(r.targetSection));
  const negFiltered   = negativeRules.filter((r) => appliesToSection(r.targetSection));

  // Partition by source: global (General/通用) vs category-specific
  const gInstr = instrFiltered.filter((r) => isGlobalCategory(r.category));
  const cInstr = instrFiltered.filter((r) => !isGlobalCategory(r.category));
  const allNeg = negFiltered; // already scoped; global + category mixed together is intentional for negatives

  const isRequired = (p?: string) => p === 'Required';
  const isCritical = (s?: string) => s === 'Critical';

  // Format helpers — clean rule text only, no DB metadata IDs in the prompt
  const fmtNeg = (list: GenerateNegativeRule[]) =>
    list.map((r, i) => `  ${i + 1}. ${r.name}`).join('\n');

  const fmtInstr = (list: GenerateInstructionRule[]) =>
    list.map((r) => `  • ${r.name}`).join('\n');

  // ── BLOCK 1: HARD CONSTRAINTS (negative rules, always placed first) ──────
  const criticalNeg = allNeg.filter((r) => isCritical(r.severity));
  const highNeg     = allNeg.filter((r) => !isCritical(r.severity));

  const hardConstraintsBlock = (() => {
    const lines: string[] = [];
    lines.push('╔══════════════════════════════════════════════════════════════╗');
    lines.push('║  HARD CONSTRAINTS — CHECK EVERY WORD OF YOUR OUTPUT AGAINST  ║');
    lines.push('║  THIS LIST BEFORE RESPONDING. VIOLATIONS ARE NOT ACCEPTABLE. ║');
    lines.push('╚══════════════════════════════════════════════════════════════╝');
    lines.push('');

    if (criticalNeg.length > 0) {
      lines.push('🚫 ABSOLUTELY PROHIBITED (policy violations — zero tolerance):');
      lines.push(fmtNeg(criticalNeg));
    } else {
      lines.push('🚫 ABSOLUTELY PROHIBITED: (no critical constraints configured)');
    }

    lines.push('');

    if (highNeg.length > 0) {
      lines.push('⚠️  STRONGLY AVOID (high-risk — rewrite if any appear in output):');
      lines.push(fmtNeg(highNeg));
    }

    lines.push('');
    lines.push('SELF-CHECK RULE: After drafting your output, re-read every sentence.');
    lines.push('If ANY item from the lists above appears → rewrite that part before outputting.');
    lines.push('Do not rationalise exceptions. These are hard stops.');
    lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    return lines.join('\n');
  })();

  // ── BLOCK 2: GENERATION DIRECTIVES (positive instruction rules, 3-tier) ──
  //
  // Tier 1 (MUST): category Required + reference ASINs
  // Tier 2 (HIGH):  global Required + category Suggested
  // Tier 3 (GUIDANCE): global Suggested
  const cInstrReq  = cInstr.filter((r) =>  isRequired(r.priority));
  const cInstrSug  = cInstr.filter((r) => !isRequired(r.priority));
  const gInstrReq  = gInstr.filter((r) =>  isRequired(r.priority));
  const gInstrSug  = gInstr.filter((r) => !isRequired(r.priority));

  const directivesBlock = (() => {
    const lines: string[] = [];

    // Tier 1
    lines.push('━━━ TIER 1 — MUST FOLLOW (highest priority) ━━━');
    if (referenceAsins.length > 0) {
      lines.push(`Reference ASINs — emulate their writing style, sentence length, and structure:`);
      lines.push(referenceAsins.map((a) => `  • ASIN: ${a}`).join('\n'));
    }
    if (cInstrReq.length > 0) {
      lines.push(`Category rules — ${input.category} (Required):`);
      lines.push(fmtInstr(cInstrReq));
    }
    if (referenceAsins.length === 0 && cInstrReq.length === 0) {
      lines.push('  (no Tier 1 directives configured)');
    }

    lines.push('');

    // Tier 2
    lines.push('━━━ TIER 2 — HIGH PRIORITY (follow unless Tier 1 conflicts) ━━━');
    if (gInstrReq.length > 0) {
      lines.push('General rules (Required):');
      lines.push(fmtInstr(gInstrReq));
    }
    if (cInstrSug.length > 0) {
      lines.push(`Category rules — ${input.category} (Suggested):`);
      lines.push(fmtInstr(cInstrSug));
    }
    if (gInstrReq.length === 0 && cInstrSug.length === 0) {
      lines.push('  (no Tier 2 directives configured)');
    }

    lines.push('');

    // Tier 3
    if (gInstrSug.length > 0) {
      lines.push('━━━ TIER 3 — GUIDANCE (best effort) ━━━');
      lines.push('General rules (Suggested):');
      lines.push(fmtInstr(gInstrSug));
    }

    return lines.join('\n');
  })();

  // ── BLOCK 3: Keywords (exact match) ──────────────────────────────────────
  const keywordsBlock = keywords && (keywords.primary || keywords.secondary.length > 0)
    ? [
        '━━━ KEYWORDS — EXACT MATCH REQUIRED (no synonyms, no paraphrases) ━━━',
        keywords.primary
          ? `PRIMARY (must appear verbatim in title and first bullet):\n  → ${keywords.primary}`
          : null,
        keywords.secondary.length > 0
          ? `SECONDARY (include naturally, best-effort, do not force if unnatural):\n${keywords.secondary.map((k) => `  → ${k}`).join('\n')}`
          : null,
      ].filter(Boolean).join('\n')
    : null;

  // ── BLOCK 4: Personas ─────────────────────────────────────────────────────
  const personasBlock = personas.length
    ? personas.map((p, i) => `  ${i + 1}. ${p.name}: ${p.description}`).join('\n')
    : '  (general consumer — broad appeal)';

  // ── BLOCK 5: Benchmark ────────────────────────────────────────────────────
  const benchmarkBlock = benchmark
    ? [
        '━━━ BENCHMARK REFERENCE LISTING (match this style & structure) ━━━',
        `TITLE: ${benchmark.title}`,
        `BULLETS:\n${benchmark.bullets}`,
        `DESCRIPTION:\n${benchmark.description}`,
      ].join('\n')
    : null;

  // ── Scope instruction ─────────────────────────────────────────────────────
  const scopeNote =
    section === 'all'
      ? 'Rewrite ALL three sections (title, bullets, description).'
      : `Rewrite ONLY the [${section.toUpperCase()}] section. ` +
        `Copy the other two sections VERBATIM from the current content — do NOT touch them.`;

  // ── Assemble system prompt ─────────────────────────────────────────────────
  const systemPrompt = [
    `You are an expert Amazon product listing copywriter for the "${input.category}" category.`,
    `Output language: ${langName}. Keep all generated text in this language — do NOT translate.`,
    '',
    'COSMO PRINCIPLES (Amazon semantic ranking):',
    '  • Natural search-intent language — no keyword stuffing',
    '  • Specific, verifiable claims with exact specs (e.g. "4804 Mbps", not "~5 Gbps")',
    '  • 2-3 concrete use-case scenarios in description',
    '  • Each bullet = one distinct, differentiated value proposition',
    '',
    hardConstraintsBlock,
    '',
    directivesBlock,
    keywordsBlock ? '' : null,
    keywordsBlock ?? null,
    '',
    '━━━ TARGET AUDIENCE PERSONAS ━━━',
    personasBlock,
    benchmarkBlock ? '' : null,
    benchmarkBlock ?? null,
  ].filter((l) => l !== null).join('\n');

  // ── User prompt ────────────────────────────────────────────────────────────
  const userPrompt = [
    scopeNote,
    'Output ONLY a raw JSON object with exactly these three keys (no markdown fences, no explanation):',
    '{"title": "...", "bullets": "...", "description": "..."}',
    'For "bullets", separate each bullet with a newline character (\\n).',
    '',
    '── CURRENT CONTENT TO REWRITE ──',
    `TITLE:\n${input.title}`,
    `BULLETS:\n${input.bullets}`,
    `DESCRIPTION:\n${input.description}`,
  ].join('\n');

  const raw = await callLLM(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    model, apiKey, { temperature: 0.4, maxTokens: 4096 },
  );

  const parsed = extractJSON<Partial<{ title: string; bullets: string; description: string }>>(raw.content);
  if (!parsed) {
    console.warn('[generateListing] JSON parse failed, raw:', raw.content.slice(0, 300));
    throw new Error('JSON');
  }

  return {
    title:       parsed.title       ?? input.title,
    bullets:     parsed.bullets     ?? input.bullets,
    description: parsed.description ?? input.description,
  };
}

// ── Image generation (Image 2) ──────────────────────────────

export type ImageGenMode = 'main' | 'lifestyle';

export interface GenerateProductImageInput {
  /** Existing product image URLs used as visual references (max 4 sent). */
  referenceImageUrls: string[];
  /** Optional generation rules selected by the user. */
  instructionRules?: GenerateInstructionRule[];
  negativeRules?:    GenerateNegativeRule[];
  /** Optional short user prompt appended as highest-priority visual direction. */
  customPrompt?:     string;
}

export interface GenerateProductImageOptions {
  /** 'main' — Amazon main-image style on white bg; 'lifestyle' — in-context use scene. */
  mode?: ImageGenMode;
  /** Output square edge (multiple of 16, default 1024). */
  size?: '1024x1024' | '1536x1024' | '1024x1536';
  /** Render quality (cost/latency vs fidelity). */
  quality?: 'low' | 'medium' | 'high' | 'auto';
}

export interface GenerateProductImageResult {
  /** Raw base64 image bytes (no data: prefix). PNG by default. */
  imageBase64: string;
  /** Mime type to wrap into a data URL when displaying or saving. */
  mimeType: 'image/png';
}

/**
 * Rewrites a product image with Image 2 via the Responses API + image_generation tool.
 *
 * Prompt architecture is intentionally narrow:
 *   The model sees only:
 *   - primary product reference image (source of product identity)
 *   - optional style/detail reference images (source of lighting/background/style)
 *   - selected rules (positive / negative visual constraints)
 *   - user custom prompt
 *
 * Listing text, personas, and keyword libraries are deliberately excluded to
 * avoid text-driven drift away from the actual reference product.
 *
 *   BLOCK 1 — HARD CONSTRAINTS (visual policy: white bg for main, no text overlay,
 *             negative rules with severity Critical apply as visual prohibitions)
 *   BLOCK 2 — GENERATION DIRECTIVES (positive instruction rules → visual focal points)
 *   BLOCK 3 — USER EXTRA INSTRUCTION
 *   BLOCK 4 — REFERENCE IMAGES (passed as input_image; preserve product identity)
 *
 * The Responses API tool path is required to give the model the actual reference
 * pixels (the Image API edits endpoint requires file uploads; URLs are not supported).
 */
export async function generateProductImage(
  input: GenerateProductImageInput,
  apiKey: string,
  options: GenerateProductImageOptions = {},
): Promise<GenerateProductImageResult> {
  const requestTag = `RFT-IMG-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const refs = input.referenceImageUrls.filter((u) => /^https?:\/\//.test(u)).slice(0, 4);
  if (refs.length === 0) {
    throw new Error('至少需要 1 张产品参考图（http/https URL）才能进行图生图。');
  }
  if (!apiKey || (!apiKey.startsWith('sk-') && !isCountryRouteToken(apiKey))) {
    throw new Error('Image 2 生图需要 OpenAI API 密钥（sk- 开头）。');
  }

  const {
    mode = 'main',
    size = '1024x1024',
    quality = 'medium',
  } = options;

  const {
    instructionRules = [],
    negativeRules    = [],
    customPrompt,
  } = input;

  // Visual rules apply if they target title (cover/hero) or all sections — these are
  // the directives that govern the product's headline value proposition, which is
  // exactly what an image must communicate.
  const isVisual = (t: string) => t === 'all' || t === 'title';
  const instrFiltered = instructionRules.filter((r) => isVisual(r.targetSection));
  const negFiltered   = negativeRules.filter((r) => isVisual(r.targetSection));

  const isCritical = (s?: string) => s === 'Critical';
  const isRequired = (p?: string) => p === 'Required';

  const fmtList = (items: string[]) =>
    items.map((x, i) => `  ${i + 1}. ${x}`).join('\n');

  // ── BLOCK 1: HARD CONSTRAINTS (visual prohibitions) ─────────────────────
  const baseProhibitions = [
    'No watermarks, retailer logos, or third-party brand marks (unless present on the product itself)',
    'No human faces of identifiable real people / celebrities',
    'No promotional text overlays such as "Best", "#1", "Sale", price tags, or rating stars',
    'No infographic-style callouts unless they read as on-pack labels of the actual product',
  ];
  const mainImageProhibitions = mode === 'main'
    ? [
        'Background MUST be pure white (#FFFFFF). Do not use gradients, props, or scenery.',
        'Single product centered, occupying ~85% of the frame. No human models or hands.',
        'No shadow text, no decorative borders, no badges.',
      ]
    : [];
  const ruleNegatives = negFiltered
    .filter((r) => isCritical(r.severity))
    .map((r) => r.name);

  const hardConstraints = [
    '╔══════════════════════════════════════════════════════════════╗',
    '║  HARD VISUAL CONSTRAINTS — DO NOT VIOLATE. CHECK BEFORE      ║',
    '║  RETURNING THE IMAGE. ANY MATCH = REGENERATE THAT REGION.    ║',
    '╚══════════════════════════════════════════════════════════════╝',
    '',
    '🚫 ABSOLUTELY PROHIBITED:',
    fmtList([...baseProhibitions, ...mainImageProhibitions]),
    ruleNegatives.length > 0 ? '' : null,
    ruleNegatives.length > 0 ? '🚫 CATEGORY-SPECIFIC PROHIBITIONS (from the listing rule library):' : null,
    ruleNegatives.length > 0 ? fmtList(ruleNegatives) : null,
  ].filter((l) => l !== null).join('\n');

  // ── BLOCK 2: GENERATION DIRECTIVES (positive visual focal points) ───────
  const requiredDirectives = instrFiltered.filter((r) => isRequired(r.priority)).map((r) => r.name);
  const suggestedDirectives = instrFiltered.filter((r) => !isRequired(r.priority)).map((r) => r.name);

  const directives = [
    '━━━ VISUAL FOCAL POINTS — features the image MUST communicate ━━━',
    requiredDirectives.length > 0
      ? `MUST DEPICT (highest priority — show clearly in the composition):\n${fmtList(requiredDirectives)}`
      : '  (no required directives — preserve the primary reference product faithfully)',
    suggestedDirectives.length > 0
      ? `SHOULD DEPICT (best effort, only if it does not crowd the composition):\n${fmtList(suggestedDirectives)}`
      : null,
  ].filter((l) => l !== null).join('\n');

  // ── Mode-specific composition instructions ──────────────────────────────
  const composition = mode === 'main'
    ? [
        'COMPOSITION: Amazon-style main image. Photorealistic studio product photography.',
        'Single hero product, perfectly lit, soft even shadow under the product, centered,',
        'pure white seamless background (#FFFFFF). Capture the product faithfully from the',
        'reference images — same shape, color, label layout, and proportions.',
      ].join('\n')
    : [
        'COMPOSITION: Lifestyle / use-case photography. Photorealistic. Show the product',
        'in a natural environment. Use secondary references only for scene style, lighting,',
        'background mood, framing, or surface details. The product',
        'identity (shape / color / branding) MUST exactly match the reference images.',
        'Background should reinforce the product\'s use case without distracting from it.',
      ].join('\n');

  // ── Assemble final prompt ───────────────────────────────────────────────
  const primaryReferenceLine =
    refs.length > 1
      ? [
          `The FIRST attached image is the PRIMARY product reference (主图参考). Treat it as the canonical truth: preserve its product identity, exact shape, color, materials, labels, logos, on-pack text, and proportions 1:1. The output MUST clearly be the same product instance.`,
          `The remaining ${refs.length - 1} attached image(s) are STYLE / DETAIL references (辅助参考图) ONLY. Borrow ONLY: lighting mood, background, framing, surface texture, color grading, or specific detail callouts. NEVER copy any product, accessory, packaging, text, person, or object from them. NEVER let style references change the primary product's identity, color, label, or proportions. If a style reference shows a different product, ignore that product entirely.`,
        ].join('\n')
      : `The single attached image is the PRIMARY product reference: preserve its product identity, exact shape, color, materials, labels, logos, on-pack text, and proportions 1:1.`;

  const prompt = [
    `REQUEST TAG: ${requestTag}`,
    'ROUND ISOLATION (critical): treat this as a brand-new standalone request.',
    'Do NOT use assumptions, memory, or visual intent from any previous rounds.',
    'Only follow the current prompt and the images attached in THIS request.',
    '',
    'You are a senior Amazon product photographer optimising a product image.',
    primaryReferenceLine,
    `Output: a single ${size} photorealistic image suitable for a top-ranked Amazon detail page.`,
    '',
    composition,
    '',
    hardConstraints,
    '',
    directives,
    customPrompt?.trim()
      ? ''
      : null,
    customPrompt?.trim()
      ? `USER EXTRA INSTRUCTION (highest priority, keep concise):\n${customPrompt.trim()}`
      : null,
    '',
    'SELF-CHECK before returning:',
    '  1. Does every prohibited item from the HARD CONSTRAINTS list appear nowhere in the image?',
    '  2. Is the product visually identical (shape, color, label, proportions) to the PRIMARY reference image?',
    '  3. Did style/detail references only influence lighting / background / mood — never the product itself?',
    '  4. Are the required visual focal points clearly visible?',
    'If any answer is "no", regenerate the offending region.',
  ].filter((l) => l !== null).join('\n');

  // ── Build Responses API request ─────────────────────────────────────────
  // IMPORTANT: the top-level `model` must be a text-capable mainline model — the
  // GPT Image models (gpt-image-1 / gpt-image-2 …) are NOT valid as the Responses
  // `model` and trigger a 400 invalid_request_error if placed here. The image model
  // belongs in the image_generation tool's own `model` field.
  const body = {
    model: 'gpt-5.5',
    input: [{
      role: 'user',
      content: [
        { type: 'input_text',  text: prompt },
        ...refs.map((u) => ({ type: 'input_image', image_url: u })),
      ],
    }],
    tools: [{
      type: 'image_generation',
      model: 'gpt-image-2',
      action: 'edit',
      quality,
      size,
    }],
  };

  // Long-running image generation runs on a background function with polling to
  // avoid the synchronous 10/26s Netlify timeout (504). Key resolution still
  // happens server-side (per country, DE fallback) inside the background function.
  return await generateImageViaBackground(apiKey, body);
}

// ── Shared JSON extractor ─────────────────────────────────────

function extractJSON<T>(raw: string): T | null {
  let text = raw.trim();

  // 1. Strip markdown fences (multiline-safe)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) text = fenced[1].trim();

  // 2. Find outermost {...} block if not starting with {
  if (!text.startsWith('{')) {
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) text = braceMatch[0];
  }

  // 3. First attempt: standard JSON.parse
  try {
    return JSON.parse(text) as T;
  } catch {
    // 4. Fallback: remove trailing commas before } or ] (common model mistake)
    const cleaned = text
      .replace(/,\s*([}\]])/g, '$1')
      // Remove single-line comments
      .replace(/\/\/[^\n]*/g, '')
      // Replace smart/curly quotes with straight quotes
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2018\u2019]/g, "'");
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      return null;
    }
  }
}
