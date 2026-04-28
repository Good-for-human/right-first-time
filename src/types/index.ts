// ============================================================
// Core domain types for Right First Time
// ============================================================

export type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | 'zh';
/**
 * Two models per vendor: fast + high capability.
 * OpenAI / Google IDs verified against official API docs (Apr 2026).
 */
export type LLMModel =
  | 'gpt-5.3-chat-latest'
  | 'gpt-5.4-pro'
  | 'claude-3-5-haiku'
  | 'claude-3-7-sonnet'
  | 'gemini-2.5-flash'
  | 'gemini-2.5-pro';
export type ContentKey = 'title' | 'bullets' | 'description';
export type TargetSection = ContentKey | 'all';
export type RuleType = 'instruction' | 'negative';
export type RulePriority = 'Required' | 'Suggested';
export type RuleSeverity = 'Critical' | 'High';
export type TaskStatus = 'pending' | 'fetched' | 'review' | 'archived';
export type RiskLevel = 'Low' | 'Medium' | 'High';
export type SystemLanguage = 'zh' | 'en';

// ============================================================
// Task
// ============================================================

// A+ content module (one section of Amazon A+ content)
export interface AplusModule {
  headline?: string;
  body?: string;
  imageUrl?: string;
}

export interface Task {
  id: string;
  asin: string;
  name: string;
  category: string;
  language: LanguageCode;
  personaIds: string[];
  url?: string;
  status: TaskStatus;
  createdAt?: string;

  // ── Product content fetched via TinyFish ──────────────────
  brand?: string;
  price?: string;
  bullets?: string[];
  description?: string;
  specs?: Record<string, string>;
  images?: string[];
  aplus?: AplusModule[];

  // ── AI-generated translations ──────────────────────────────
  translations?: TranslationMap;

  // ── Benchmark flag — used as style reference for AI rewrite ──
  isBenchmark?: boolean;

  // ── Reference ASINs — task-level style benchmarks (max 3), highest LLM priority ──
  referenceAsins?: string[];

  // ── AI evaluation (issue highlights) ──────────────────────
  evaluation?: EvaluationReport;
}

// ============================================================
// Persona
// ============================================================

export interface Persona {
  id: string;
  name: string;
  description: string;
}

// ============================================================
// Rules
// ============================================================

export interface Rule {
  id: number;
  category: string;
  type: RuleType;
  targetSection: TargetSection;
  name: string;
  active: boolean;
  // instruction-type fields
  priority?: RulePriority;
  referenceAsins?: string[];
  // negative-type fields
  severity?: RuleSeverity;
}

// ============================================================
// App Settings
// ============================================================

export interface AppSettings {
  systemLanguage: SystemLanguage;
  targetLanguage: LanguageCode;
  translationLang: 'en' | 'zh';
  model: LLMModel;
  apiKey: string;
  isSaved: boolean;
  tinyfishApiKey: string;
  isTinyfishSaved: boolean;
}

// ============================================================
// Listing Content
// ============================================================

export interface RawListing {
  title: string;
  bullets: string[];
  description: string;
  specs: Record<string, string>;
}

export interface GeneratedContent {
  title: string;
  bullets: string;
  description: string;
}

export type TranslationMap = {
  [K in ContentKey]?: Partial<Record<LanguageCode, string>>;
};

// ============================================================
// AI Metadata & Compliance
// ============================================================

export interface NegativeCheckResult {
  passed: boolean;
  issues?: string[];
}

export interface SectionMetadata {
  rulesApplied: string[];
  negativeCheck: NegativeCheckResult;
  explanation: string;
}

export type SectionMetadataMap = Record<ContentKey, SectionMetadata>;

// ============================================================
// Evaluation Report
// ============================================================

export interface EvaluationScores {
  clarity: number;
  completeness: number;
  searchability: number;
  compliance: number;
}

export interface EvaluationIssue {
  type: 'Warning' | 'Error';
  text: string;
}

export interface EvaluationReport {
  /** List of compliance / quality issues found by the model. Empty = no issues. */
  issues: EvaluationIssue[];
}

// ============================================================
// Agent Message Contracts
// ============================================================

export interface FetchResultMessage {
  taskId: string;
  rawListing: RawListing;
  fetchedAt: string;
  sourceUrl: string;
}

export interface FewShotExample {
  asin: string;
  content: GeneratedContent;
}

export interface PromptContextMessage {
  taskId: string;
  rawListing: RawListing;
  systemPrompt: string;
  instructionRules: Rule[];
  negativeRules: Rule[];
  fewShotExamples: FewShotExample[];
  targetLanguage: LanguageCode;
}

export interface GenerationResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: SectionMetadataMap;
  negativeRules: Rule[];
}

export interface ComplianceResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: SectionMetadataMap;
  blockedSections: ContentKey[];
}

export interface EvaluationResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: SectionMetadataMap;
  evaluationReport: EvaluationReport;
  translations: TranslationMap;
}

// ============================================================
// Tinyfish API
// ============================================================

export interface TinyfishRequest {
  url: string;
  schema: Record<string, string>;
}

export interface TinyfishResponseMeta {
  sourceUrl: string;
  extractedAt: string;
  confidence: number;
}

export interface TinyfishResponse {
  data: RawListing;
  metadata: TinyfishResponseMeta;
}

// ============================================================
// LLM API
// ============================================================

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  model: LLMModel;
  messages: LLMMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

// ============================================================
// Keyword Library
// ============================================================

/** Per-category keyword set: 1 primary + multiple secondary keywords. */
export interface KeywordSet {
  primary: string;
  secondary: string[];
}

/** Map of category name → keyword set. */
export type KeywordMap = Record<string, KeywordSet>;

/** Map of category name → up to 3 reference ASINs (category-level benchmarks). */
export type CategoryRefAsinMap = Record<string, string[]>;

// ============================================================
// UI Helper Types
// ============================================================

export type BadgeColor = 'blue' | 'green' | 'red' | 'orange' | 'gray' | 'purple';
export type ViewMode = 'workspace' | 'rules';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  zhLabel: string;
}
