// ============================================================
// Core domain types for Right First Time
// ============================================================

export type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | 'zh' | 'nl' | 'pl' | 'sv';
export type CountryCode = 'UK' | 'DE' | 'IT' | 'ES' | 'FR' | 'BE' | 'NL' | 'PL' | 'SE' | 'GLOBAL';
export type BusinessCountryCode = Exclude<CountryCode, 'GLOBAL'>;
export type UserRole = 'user' | 'admin';
export interface UserProfile {
  uid: string;
  email: string;
  countryCode: CountryCode;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
export type ListingStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type SharedSourceType = 'native' | 'shared_import';
export type WorkspaceItemStatus = 'active' | 'archived';

export interface ModelRecord {
  modelKey: string;
  displayName: string;
  asinList: string[];
  countriesAvailable: BusinessCountryCode[];
  createdAt: string;
  updatedAt: string;
}

export interface CountryListing {
  modelKey: string;
  countryCode: BusinessCountryCode;
  asin?: string;
  status: ListingStatus;
  title?: string;
  bullets?: string[];
  description?: string;
  attributes?: Record<string, string>;
  media?: string[];
  approvedAt?: string;
  sourceType: SharedSourceType;
  sourceListingId?: string;
  updatedAt: string;
}

export interface SharedLibraryItem {
  id: string; // `${modelKey}_${countryCode}`
  modelKey: string;
  sourceCountry: BusinessCountryCode;
  asinList: string[];
  summaryTitle?: string;
  summaryBullets?: string[];
  thumbnail?: string;
  approvedAt: string;
  snapshot: Partial<CountryListing>;
  searchKeywords: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceItem {
  modelKey: string;
  countryCode: BusinessCountryCode;
  fromSharedId?: string;
  fromSharedCountry?: BusinessCountryCode;
  workspaceStatus: WorkspaceItemStatus;
  localOverrides: {
    title?: string;
    bullets?: string[];
    description?: string;
    attributes?: Record<string, string>;
    media?: string[];
  };
  createdAt: string;
  updatedAt: string;
}

export interface SharedKeywordLibraryItem {
  sourceCountry: CountryCode;
  map: KeywordMap;
  refAsins: CategoryRefAsinMap;
  updatedAt: string;
}
/**
 * Two models per vendor: fast + high capability.
 * OpenAI / Google IDs verified against official API docs (Apr 2026).
 */
export type LLMModel =
  | 'gpt-5.3-chat-latest'
  | 'gpt-5.4-pro'
  | 'gpt-5.5'
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
export type SystemLanguage = 'cn' | 'en';
export type SystemLanguageTextMap = Partial<Record<SystemLanguage, string>>;
export type CategoryLabelMap = Record<string, SystemLanguageTextMap>;

// ============================================================
// Task
// ============================================================

// A+ content module (one section of Amazon A+ content)
export interface AplusModule {
  headline?: string;
  body?: string;
  imageUrl?: string;
}

/**
 * A single attachment the user dropped or pasted into a task's attachment area.
 * Images / files are uploaded to Firebase Storage (only the download URL + path
 * are stored here); pasted text is kept inline.
 */
export interface TaskAttachment {
  id: string;
  kind: 'image' | 'file' | 'text';
  /** Firebase Storage download URL (image / file kinds). */
  url?: string;
  /** Storage object path — used for deletion (image / file kinds). */
  storagePath?: string;
  /** Original file name (image / file kinds). */
  name?: string;
  /** MIME type (image / file kinds). */
  mimeType?: string;
  /** Size in bytes (image / file kinds). */
  size?: number;
  /** Inline text content (text kind). */
  text?: string;
  createdAt: string;
}

export interface Task {
  id: string;
  modelKey?: string;
  asin: string;
  /** Additional product ASINs supplied by the user (main asin remains `asin`). */
  extraAsins?: string[];
  /** Extra ASINs grouped by the country workspace that added them. */
  extraAsinsByCountry?: Record<string, string[]>;
  /** Product EAN / GTIN codes supplied by the user. */
  eans?: string[];
  /** EAN / GTIN codes grouped by the country workspace that added them. */
  eansByCountry?: Record<string, string[]>;
  name: string;
  countryCode?: BusinessCountryCode;
  fromSharedId?: string;
  fromSharedCountry?: BusinessCountryCode;
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
  /** Export-zone images (default target for fetched and generated outputs). */
  images?: string[];
  /** Material-zone images (reference pool; not part of export batch). */
  materialImages?: string[];
  aplus?: AplusModule[];

  // ── User attachments — drag/drop or paste reference material per task ──
  attachments?: TaskAttachment[];

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
  nameI18n?: SystemLanguageTextMap;
  descriptionI18n?: SystemLanguageTextMap;
  createdByUid?: string;
  createdByEmail?: string;
  createdByCountry?: CountryCode;
  createdAt?: string;
  updatedAt?: string;
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
  nameI18n?: SystemLanguageTextMap;
  active: boolean;
  // instruction-type fields
  priority?: RulePriority;
  referenceAsins?: string[];
  // negative-type fields
  severity?: RuleSeverity;
  createdByUid?: string;
  createdByEmail?: string;
  createdByCountry?: CountryCode;
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================
// App Settings
// ============================================================

export interface AppSettings {
  systemLanguage: SystemLanguage;
  targetLanguage: LanguageCode;
  // Language shown in the translation column. Besides zh/en, the target country language
  // (AppSettings.targetLanguage) can be selected to preview a literal translation.
  translationLang: LanguageCode;
  model: LLMModel;
  apiKey: string;
  isSaved: boolean;
  tinyfishApiKey: string;
  isTinyfishSaved: boolean;
  // Rule pick keys (`${country}:${id}`) the user last selected for image generation.
  // Empty / undefined => no rules applied by default (user opts in via checkboxes).
  selectedImageRuleKeys?: string[];
  // Rule pick keys the user last selected for listing (AI rewrite) generation.
  selectedListingRuleKeys?: string[];
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
export type ViewMode = 'workspace' | 'sharedLibrary' | 'rules';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  zhLabel: string;
}
