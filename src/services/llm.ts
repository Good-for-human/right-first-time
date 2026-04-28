import type { ContentKey, LLMMessage, LLMModel, LLMResponse } from '@/types';

// ── Provider routing ──────────────────────────────────────────

type LLMProvider = 'openai' | 'anthropic' | 'google';

const MODEL_PROVIDERS: Record<LLMModel, LLMProvider> = {
  'gpt-5.3-chat-latest': 'openai',
  'gpt-5.4-pro':         'openai',
  'claude-3-7-sonnet':   'anthropic',
  'claude-3-5-haiku':    'anthropic',
  'gemini-2.5-pro':   'google',
  'gemini-2.5-flash': 'google',
};

// Canonical OpenAI / Google API model IDs (see platform.openai.com & ai.google.dev)
const MODEL_IDS: Record<LLMModel, string> = {
  'gpt-5.3-chat-latest': 'gpt-5.3-chat-latest',
  'gpt-5.4-pro':         'gpt-5.4-pro',
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
  // 401 / 403 invalid key
  if (raw.includes('401') || raw.includes('403') || raw.includes('invalid') || raw.includes('Unauthorized')) {
    return 'API 密钥无效或无权限 (401/403)。请检查设置中填写的密钥是否与所选模型厂商匹配：\n• OpenAI 模型 → sk-...\n• Anthropic 模型 → sk-ant-...\n• Google 模型 → AIza...';
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

async function callOpenAI(
  messages: LLMMessage[],
  model: LLMModel,
  apiKey: string,
  temperature: number,
  maxTokens: number,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL_IDS[model],
      messages,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
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
  zh: 'Chinese',
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
 * Always returns all three fields; the caller decides which to apply.
 */
export async function generateListing(
  input: GenerateListingInput,
  options: GenerateListingOptions,
  model: LLMModel,
  apiKey: string,
): Promise<{ title: string; bullets: string; description: string }> {
  const { section = 'all', personas = [], instructionRules = [], negativeRules = [], benchmark, referenceAsins = [], keywords } = options;
  const langName = LANGUAGE_NAMES[input.language] ?? input.language;

  // ── Build rules block (3-tier priority) ──────────────────────
  const sectionFilter = (t: string) => section === 'all' || t === 'all' || t === section;
  const GLOBAL_CAT = '通用';

  const instrFiltered = instructionRules.filter((r) => sectionFilter(r.targetSection));
  const negFiltered   = negativeRules.filter((r) => sectionFilter(r.targetSection));

  const gInstr = instrFiltered.filter((r) => r.category === GLOBAL_CAT);
  const cInstr = instrFiltered.filter((r) => r.category === input.category && r.category !== GLOBAL_CAT);
  const gNeg   = negFiltered.filter((r) => r.category === GLOBAL_CAT);
  const cNeg   = negFiltered.filter((r) => r.category === input.category && r.category !== GLOBAL_CAT);

  const isReq = (p?: string) => p === 'Required';
  const fmtInstrList = (list: GenerateInstructionRule[], bucket: 'req' | 'sug') => {
    const rows = list.filter((r) => (bucket === 'req' ? isReq(r.priority) : !isReq(r.priority)));
    return rows.length
      ? rows.map((r) => `    • [#${r.id}][${r.category}][${r.targetSection}] ${r.name}`).join('\n')
      : '    (none)';
  };
  const fmtNegList = (list: GenerateNegativeRule[], sev: 'Critical' | 'other') => {
    const rows = list.filter((r) => (sev === 'Critical' ? r.severity === 'Critical' : r.severity !== 'Critical'));
    return rows.length
      ? rows.map((r) => `    • [#${r.id}][${r.category}][${r.targetSection}] ${r.name}`).join('\n')
      : '    (none)';
  };

  /**
   * Priority order (user-defined):
   * Tier 1 (MUST): referenceAsins = category Required = negative Critical
   * Tier 2 (HIGH): global Required = category Suggested = negative High
   * Tier 3 (GUIDANCE): global Suggested
   */
  const rulesBlock = [
    '════ TIER 1 — HIGHEST PRIORITY (MUST enforce) ════',
    // 1a. Reference ASINs
    referenceAsins.length
      ? [
          'REFERENCE ASINs (top-performing listings — emulate their style, length & structure):',
          referenceAsins.map((a) => `    • ${a}`).join('\n'),
        ].join('\n')
      : null,
    // 1b. Category Required instruction rules
    `CATEGORY (${input.category}) — Required instruction rules:`,
    fmtInstrList(cInstr, 'req'),
    // 1c. Negative Critical (both global + category)
    `NEGATIVE / PROHIBITED — Critical severity (${GLOBAL_CAT} + ${input.category}):`,
    fmtNegList([...gNeg, ...cNeg], 'Critical'),
    '',
    '════ TIER 2 — HIGH PRIORITY (should follow) ════',
    // 2a. Global Required
    `GLOBAL (${GLOBAL_CAT}) — Required instruction rules:`,
    fmtInstrList(gInstr, 'req'),
    // 2b. Category Suggested
    `CATEGORY (${input.category}) — Suggested instruction rules:`,
    fmtInstrList(cInstr, 'sug'),
    // 2c. Negative High (both global + category)
    `NEGATIVE / PROHIBITED — High severity (${GLOBAL_CAT} + ${input.category}):`,
    fmtNegList([...gNeg, ...cNeg], 'other'),
    '',
    '════ TIER 3 — GUIDANCE (best effort) ════',
    // 3a. Global Suggested
    `GLOBAL (${GLOBAL_CAT}) — Suggested instruction rules:`,
    fmtInstrList(gInstr, 'sug'),
  ].filter((l) => l !== null).join('\n');

  // ── Keywords block (EXACT MATCH) ─────────────────────────
  const keywordsBlock = keywords && (keywords.primary || keywords.secondary.length > 0)
    ? [
        '════ KEYWORDS — EXACT MATCH REQUIRED (no synonyms, no paraphrases) ════',
        keywords.primary
          ? `PRIMARY KEYWORD (must appear in title and first bullet):\n    • ${keywords.primary}`
          : null,
        keywords.secondary.length > 0
          ? `SECONDARY KEYWORDS (include naturally throughout, best-effort, do not force if unnatural):\n${keywords.secondary.map((k) => `    • ${k}`).join('\n')}`
          : null,
      ].filter((l) => l !== null).join('\n')
    : '';

  // ── Personas block ────────────────────────────────────────
  const personasBlock = personas.length
    ? personas.map((p, i) => `  ${i + 1}. ${p.name}: ${p.description}`).join('\n')
    : '  (general consumer)';

  // ── Benchmark block ───────────────────────────────────────
  const benchmarkBlock = benchmark
    ? [
        '── BENCHMARK REFERENCE LISTING (adopt this style & structure) ──',
        `TITLE: ${benchmark.title}`,
        `BULLETS:\n${benchmark.bullets}`,
        `DESCRIPTION:\n${benchmark.description}`,
      ].join('\n')
    : '';

  // ── Rewrite scope instruction ─────────────────────────────
  const scopeNote =
    section === 'all'
      ? 'Rewrite ALL three sections (title, bullets, description).'
      : `Rewrite ONLY the [${section.toUpperCase()}] section. Keep the other two sections unchanged — copy them verbatim from the current content.`;

  const systemPrompt = [
    'You are an expert Amazon product listing copywriter.',
    '',
    'COSMO OPTIMIZATION PRINCIPLES (Amazon\'s semantic ranking engine):',
    '• Use natural language that reflects real customer search intent — never keyword stuffing',
    '• Write specific, verifiable claims with exact technical specs (e.g. 4804 Mbps, not "~5000 Mbps+")',
    '• Embed 2-3 concrete use-case scenarios in the description',
    '• Each bullet point must carry a single distinct value proposition',
    '',
    `PRODUCT CATEGORY: ${input.category}`,
    `OUTPUT LANGUAGE: ${langName} (listing target language — keep output in this language; do NOT translate to another language)`,
    'The instruction / negative blocks above are the exact active rules configured in the system for this task category.',
    '',
    rulesBlock,
    keywordsBlock ? '' : null,
    keywordsBlock || null,
    '',
    '── TARGET AUDIENCE PERSONAS ──',
    personasBlock,
    benchmarkBlock ? '' : null,
    benchmarkBlock || null,
  ].filter((l) => l !== null).join('\n');

  const userPrompt = [
    scopeNote,
    'Output ONLY a raw JSON object with exactly these three keys (no markdown fences, no explanation):',
    '{"title": "...", "bullets": "...", "description": "..."}',
    'For "bullets", use newline characters (\\n) to separate individual bullet points.',
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
