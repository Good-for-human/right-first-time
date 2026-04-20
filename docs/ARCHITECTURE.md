# Right First Time — Technical Architecture Document

> Version: 1.0.0 | Last Updated: 2026-04-18
>
> This document describes the full system architecture of **Right First Time**, an AI-powered Amazon listing optimization platform designed for TP-Link product teams. It follows the [MetaGPT](https://github.com/FoundationAgents/MetaGPT) multi-agent framework philosophy: `Code = SOP(Team)`.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Design Philosophy](#2-design-philosophy)
3. [Frontend Component Architecture](#3-frontend-component-architecture)
4. [Data Models (TypeScript Interfaces)](#4-data-models-typescript-interfaces)
5. [Multi-Agent SOP Design](#5-multi-agent-sop-design)
6. [Functional Module Breakdown](#6-functional-module-breakdown)
   - 6.1 [Task Management Module](#61-task-management-module)
   - 6.2 [Data Fetch Module](#62-data-fetch-module)
   - 6.3 [AI Workspace Module](#63-ai-workspace-module)
   - 6.4 [Compliance Guard Module](#64-compliance-guard-module)
   - 6.5 [Evaluation & Report Module](#65-evaluation--report-module)
   - 6.6 [Translation Module](#66-translation-module)
   - 6.7 [Settings & Rules Module](#67-settings--rules-module)
   - 6.8 [i18n Module](#68-i18n-module)
7. [API Interface Specification](#7-api-interface-specification)
8. [State Management](#8-state-management)
9. [Engineering Roadmap](#9-engineering-roadmap)

---

## 1. System Overview

**Right First Time** is a human-AI collaborative workflow tool for generating and reviewing Amazon marketplace listings. It provides:

- Automated raw listing ingestion from Amazon / TP-Link official websites via Tinyfish API
- AI-driven rewriting of Title, Bullet Points, and Description per configurable rules
- Real-time compliance validation against category-specific risk constraints
- Multi-language translation preview (EN / DE / FR / IT / ES / ZH)
- Human-in-the-loop review and approval workflow

**Target Users:** TP-Link e-commerce content teams managing product listings across multiple Amazon marketplaces.

**Core Workflow:**

```
New Task (ASIN) → Data Fetch → AI Generate → Compliance Check → Human Review → Approve (Archive)
```

---

## 2. Design Philosophy

### 2.1 MetaGPT Principle: `Code = SOP(Team)`

This application materializes the MetaGPT concept where a structured team of specialized AI agents, each with a defined **Role**, **Action**, and **Output**, replaces ad-hoc LLM prompting. Every content generation step is traceable, rule-bound, and auditable.

### 2.2 Three-Layer Prompt Engineering

AI content generation follows a strict three-layer context assembly:

```
[Persona Layer]     → Sets tone, vocabulary, and audience context
      ↓
[Generation Rules]  → Prescribes structure, format, and required data points
      ↓
[Compliance Guard]  → Validates output; blocks Critical violations, warns on High
```

This mirrors MetaGPT's concept of role-based message passing where each agent transforms and validates output before handing off to the next.

### 2.3 COSMO Standard

Content quality is measured against the **COSMO** (Content Optimization Standard for Marketplace Operations) framework, covering:
- **C**larity — readability and directness
- **C**ompleteness — coverage of key product specs
- **S**earchability — keyword structure and format compliance
- **C**ompliance — absence of policy violations and subjective superlatives

---

## 3. Frontend Component Architecture

### 3.1 Component Tree

```
App (Root)
├── Sidebar
│   ├── Logo & Title
│   ├── New Task Button → [Modal: CreateTaskModal]
│   ├── Search Input
│   ├── SidebarGroup (Pending Review queue)
│   ├── SidebarGroup (Archived queue)
│   └── Settings Navigation Button
│
├── MainContent (conditional render by `view` state)
│   ├── Workspace  [view = 'workspace']
│   │   ├── WorkspaceHeader (ASIN title, status pipeline, Approve button)
│   │   ├── SourceDataPanel (raw listing: title, bullets, description)
│   │   └── AIWorkspacePanel
│   │       ├── GenSettingsBar (category selector, persona tags, global regen, translation toggle)
│   │       ├── EvaluationReport (scores + issue list)
│   │       ├── EditorSection [title]
│   │       ├── EditorSection [bullets]
│   │       └── EditorSection [description]
│   │
│   └── SettingsAndRules  [view = 'rules']
│       ├── LanguageSettings
│       ├── LLMConfiguration
│       ├── TinyfishAPIConfig
│       ├── PersonaLibrary → [Modal: PersonaModal]
│       └── CategoryRulesLibrary → [Modal: RuleModal, DeleteConfirmModal]
│
└── Modals (portal-level, z-50)
    ├── CreateTaskModal
    ├── PersonaModal
    ├── RuleModal
    └── DeleteConfirmModal
```

### 3.2 Component Responsibilities

| Component | Responsibility | Key Props |
|---|---|---|
| `App` | Global state host, routing between `workspace` / `rules` views | — |
| `SidebarGroup` | Renders a filtered task list section | `queue`, `title`, `icon` |
| `Workspace` | Orchestrates the AI workspace for a single active task | `task`, `updateTask`, `appSettings` |
| `EditorSection` | Dual-pane editor: AI output (editable) + translation (read-only) | `dataKey`, `mockData`, `edits`, `onRegenerate` |
| `SettingsAndRules` | Full configuration panel: LLM, personas, category rules | `rules`, `personas`, `categories`, `appSettings` |
| `Badge` | Inline status/label chip | `color`, `children` |
| `ProgressBar` | Score visualization bar | `label`, `value`, `colorClass` |

---

## 4. Data Models (TypeScript Interfaces)

### 4.1 Task

```typescript
type TaskStatus = 'pending' | 'fetched' | 'review' | 'archived';

interface Task {
  id: string;                  // UUID or timestamp string
  asin: string;                // Amazon Standard Identification Number (uppercase)
  name: string;                // Product display name (populated after data fetch)
  category: string;            // Must match a value in Category[]
  language: LanguageCode;      // Target market language code
  personaIds: string[];        // Array of Persona.id references (max 5)
  url?: string;                // Optional reference URL (Amazon or TP-Link official)
  status: TaskStatus;
}
```

### 4.2 Persona

```typescript
interface Persona {
  id: string;                  // Unique identifier, e.g. 'p1'
  name: string;                // Display label, e.g. '科技发烧友/极客'
  description: string;         // Behavioral prompt: tone, focus areas, vocabulary preferences
}
```

### 4.3 Rule

```typescript
type RuleType = 'instruction' | 'negative';
type RulePriority = 'Required' | 'Suggested';
type RuleSeverity = 'Critical' | 'High';
type TargetSection = 'title' | 'bullets' | 'description' | 'all';

interface Rule {
  id: number;
  category: string;            // Category scope, e.g. '网络终端' or '通用'
  type: RuleType;
  targetSection: TargetSection;
  name: string;                // The rule instruction text / constraint description
  active: boolean;

  // instruction-type only
  priority?: RulePriority;
  referenceAsins?: string[];   // Few-shot examples (max 3, from archived tasks)

  // negative-type only
  severity?: RuleSeverity;     // Critical = block generation; High = warn
}
```

### 4.4 AppSettings

```typescript
type LanguageCode = 'en' | 'de' | 'fr' | 'it' | 'es' | 'zh';
type LLMModel = 'gpt-4o' | 'claude-3-5-sonnet' | 'gemini-1-5-pro';

interface AppSettings {
  systemLanguage: 'zh' | 'en';    // UI display language
  targetLanguage: LanguageCode;   // Default target language for new tasks
  translationLang: 'en' | 'zh';   // Translation pane display language
  model: LLMModel;                // Active LLM model
  apiKey: string;                 // LLM API key (stored client-side)
  isSaved: boolean;               // API key masked state
  tinyfishApiKey: string;         // Tinyfish scraping API key
  isTinyfishSaved: boolean;
}
```

### 4.5 Listing Content

```typescript
interface RawListing {
  title: string;
  bullets: string[];
  description: string;
  specs: Record<string, string>;  // Technical specifications key-value map
}

type ContentKey = 'title' | 'bullets' | 'description';

interface GeneratedContent {
  title: string;
  bullets: string;
  description: string;
}

type TranslationMap = {
  [K in ContentKey]: Partial<Record<LanguageCode, string>>;
};
```

### 4.6 Section Metadata (AI Trace)

```typescript
interface NegativeCheckResult {
  passed: boolean;
  issues?: string[];
}

interface SectionMetadata {
  rulesApplied: string[];         // Human-readable list of rules/personas applied
  negativeCheck: NegativeCheckResult;
  explanation: string;            // Plain-language summary of AI decisions
}
```

### 4.7 Evaluation Report

```typescript
interface EvaluationScores {
  clarity: number;        // 0–100
  completeness: number;   // 0–100
  searchability: number;  // 0–100
  compliance: number;     // 0–100
}

interface EvaluationIssue {
  type: 'Warning' | 'Error';
  text: string;
}

interface EvaluationReport {
  scores: EvaluationScores;
  issues: EvaluationIssue[];
  riskLevel: 'Low' | 'Medium' | 'High';
}
```

---

## 5. Multi-Agent SOP Design

### 5.1 Agent Team Overview

Following MetaGPT's team-of-roles paradigm, the backend processing pipeline is decomposed into 5 specialized agents that pass typed messages in sequence:

```
DataFetchAgent → ContextBuilderAgent → ContentGenerationAgent → ComplianceGuardAgent → EvaluationAgent
```

Each agent has a single responsibility and communicates only via defined message contracts.

### 5.2 SOP Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│  USER ACTION: Create Task (ASIN + optional URL + category)              │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: { asin, url, category }
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  [Agent 1] DataFetchAgent                                               │
│  Action: FetchListingData                                               │
│  - Call Tinyfish API with ASIN                                          │
│  - Scrape Amazon product page / TP-Link official site                   │
│  - Normalize raw data into RawListing schema                            │
│  Output: RawListing { title, bullets, description, specs }              │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: RawListing + Task metadata
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  [Agent 2] ContextBuilderAgent                                          │
│  Action: BuildPromptContext                                              │
│  - Load Persona descriptions for task.personaIds                        │
│  - Load category Rules (type='instruction') matching task.category      │
│  - Load negative Rules matching task.category                           │
│  - Assemble structured system prompt                                    │
│  Output: PromptContext { systemPrompt, constraints[], fewShots[] }      │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: RawListing + PromptContext
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  [Agent 3] ContentGenerationAgent                                       │
│  Action: GenerateContent (per section: title / bullets / description)   │
│  - Construct per-section user prompt from RawListing                    │
│  - Inject PromptContext as system context                               │
│  - Call configured LLM (GPT-4o / Claude / Gemini)                      │
│  - Output in target language (task.language)                            │
│  Output: GeneratedContent { title, bullets, description }               │
│          SectionMetadata[] { rulesApplied, explanation }                │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: GeneratedContent + SectionMetadata
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  [Agent 4] ComplianceGuardAgent                                         │
│  Action: ValidateCompliance                                             │
│  - Run each active negative Rule against each content section           │
│  - Critical violations → block output, request ContentGenerationAgent   │
│    to regenerate with explicit prohibition injected into prompt         │
│  - High violations → flag with warning, allow human to accept/override  │
│  Output: NegativeCheckResult per section                                │
│          Updated SectionMetadata with negativeCheck field               │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: ValidatedContent
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  [Agent 5] EvaluationAgent                                              │
│  Action: ScoreContent                                                   │
│  - Score Clarity: readability, sentence structure, absence of jargon    │
│  - Score Completeness: coverage of specs, features, use cases           │
│  - Score Searchability: keyword prefix format, structural compliance    │
│  - Score Compliance: negative rule pass rate, tone objectivity          │
│  - Derive overall riskLevel                                             │
│  Output: EvaluationReport { scores, issues, riskLevel }                 │
└─────────────────────────┬───────────────────────────────────────────────┘
                          │ Message: Full task result
                          ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  WORKSPACE UI: Human Review                                             │
│  - View generated content alongside source data                        │
│  - Edit any section manually                                           │
│  - Trigger per-section or global AI regeneration                       │
│  - Review EvaluationReport scores and issue flags                      │
│  - Approve → status: 'archived'                                        │
└─────────────────────────────────────────────────────────────────────────┘
```

### 5.3 Agent Message Contracts

```typescript
// Agent 1 → Agent 2
interface FetchResultMessage {
  taskId: string;
  rawListing: RawListing;
  fetchedAt: string;  // ISO timestamp
  sourceUrl: string;
}

// Agent 2 → Agent 3
interface PromptContextMessage {
  taskId: string;
  rawListing: RawListing;
  systemPrompt: string;       // Assembled from personas + category rules
  instructionRules: Rule[];
  negativeRules: Rule[];      // Passed forward for guard agent reference
  fewShotExamples: Array<{    // From referenceAsins of Required rules
    asin: string;
    content: GeneratedContent;
  }>;
  targetLanguage: LanguageCode;
}

// Agent 3 → Agent 4
interface GenerationResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: Record<ContentKey, SectionMetadata>;
  negativeRules: Rule[];
}

// Agent 4 → Agent 5
interface ComplianceResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: Record<ContentKey, SectionMetadata>;  // negativeCheck populated
  blockedSections: ContentKey[];
}

// Agent 5 → UI
interface EvaluationResultMessage {
  taskId: string;
  generatedContent: GeneratedContent;
  sectionMetadata: Record<ContentKey, SectionMetadata>;
  evaluationReport: EvaluationReport;
  translations: TranslationMap;
}
```

### 5.4 Regeneration Flow (Partial & Global)

**Per-section regeneration** triggers the pipeline from `ContextBuilderAgent` onwards, passing the existing approved sections as immutable context.

**Global regeneration** re-runs the full pipeline from `ContentGenerationAgent` (data is already fetched).

```
User clicks "AI Rewrite" on [bullets section]
  → ContentGenerationAgent.generate({ section: 'bullets', ...context })
  → ComplianceGuardAgent.validate({ section: 'bullets' })
  → EvaluationAgent.score({ updatedSection: 'bullets' })
  → Update UI state for bullets only
```

---

## 6. Functional Module Breakdown

### 6.1 Task Management Module

**Purpose:** Tracks the lifecycle of each ASIN optimization task.

**State:** `tasks: Task[]` managed in `App` root state.

**Task Status Machine:**

```
pending → (DataFetchAgent completes) → fetched
fetched → (ContentGenerationAgent completes) → review
review  → (Human clicks Approve) → archived
```

**Key Operations:**

| Operation | Trigger | State Change |
|---|---|---|
| Create task | Submit CreateTaskModal | Append `Task` with `status: 'pending'` |
| Update task props | Category/Persona change in Workspace | `updateTask(id, partial)` |
| Approve task | Click "Approve" button | `status → 'archived'` |
| Search/filter | Sidebar search input | Derived `activeQueue` / `archivedQueue` |

**Sidebar Queues:**
- `activeQueue` — tasks with status `pending`, `fetched`, or `review`
- `archivedQueue` — tasks with status `archived`

---

### 6.2 Data Fetch Module

**Purpose:** Ingests raw product listing data from external sources.

**External Dependency:** [Tinyfish API](https://docs.tinyfish.ai/) — headless scraper for Amazon and TP-Link official websites.

**Fetch Trigger:** Task creation. If a `url` is provided, use it directly. Otherwise, construct URL from `asin`.

**Supported Sources:**
- Amazon product page: `https://www.amazon.com/dp/{ASIN}`
- TP-Link official product page: `https://www.tp-link.com/...`

**API Integration Pattern:**

```typescript
// POST https://api.tinyfish.ai/v1/extract
interface TinyfishRequest {
  url: string;
  schema: {
    title: 'string';
    bullets: 'string[]';
    description: 'string';
    specs: 'Record<string, string>';
  };
}

interface TinyfishResponse {
  data: RawListing;
  metadata: {
    sourceUrl: string;
    extractedAt: string;
    confidence: number;
  };
}
```

**Configuration:** `appSettings.tinyfishApiKey` — stored in browser localStorage, never sent to any backend other than Tinyfish.

---

### 6.3 AI Workspace Module

**Purpose:** Core human-AI interaction surface. Displays source data alongside AI-generated/edited content, with controls for regeneration and persona/category tuning.

**Component:** `Workspace`

**Layout:** Three-column-equivalent structure:
1. **Left panel (30%)** — `SourceDataPanel`: read-only display of `RawListing`
2. **Right panel (70%)** — `AIWorkspacePanel`:
   - `GenSettingsBar`: active category + persona tag selector + global regen + translation toggle
   - `EvaluationReport`: COSMO scores + issue flags
   - Three `EditorSection` components (title, bullets, description)

**EditorSection Layout:**
- Left half: editable textarea with AI-generated content in `task.language`
- Right half: read-only translation pane in `appSettings.translationLang`
- Header: section name + compliance badge (Pass / Flagged) + per-section regen button
- Footer info panel: explanation text + applied rules/persona tags

**Loading States:**
- `globalLoading: boolean` — triggered by global regen or Approve action; renders full-panel overlay
- `sectionLoading: Record<ContentKey, boolean>` — per-section spinner during individual regen

---

### 6.4 Compliance Guard Module

**Purpose:** Validates generated content against negative rules (risk constraints). Acts as a guardrail preventing policy-violating content from reaching the review stage.

**Rule Types:**

| Severity | Behavior | UI Indication |
|---|---|---|
| `Critical` | Block — must not appear in final output. Triggers automatic regeneration with explicit prohibition. | `Badge color="red"`: Flagged |
| `High` | Warn — flagged for human review but does not block. | `Badge color="orange"`: Flagged + Warning issue |

**Validation Logic:**

```typescript
function validateSection(
  content: string,
  negativeRules: Rule[],
  section: TargetSection
): NegativeCheckResult {
  const applicable = negativeRules.filter(
    r => r.active && (r.targetSection === 'all' || r.targetSection === section)
  );
  const violations = applicable.filter(r => checkViolation(content, r));
  return {
    passed: violations.filter(r => r.severity === 'Critical').length === 0,
    issues: violations.map(r => r.name)
  };
}
```

**Examples from Initial Data:**
- `Critical`: "禁止使用绝对化或虚假宣传词汇，如 The best, No more buffering, Buy now" → scope: all
- `High`: "禁止在未经认证的情况下使用"军工级加密"等安全承诺" → scope: description, category: 智能家居

---

### 6.5 Evaluation & Report Module

**Purpose:** Produces a COSMO-based quality score for each task's generated content.

**Component:** `EvaluationReport` (rendered inside `AIWorkspacePanel`)

**Scoring Dimensions:**

| Dimension | Key | What It Measures |
|---|---|---|
| Clarity | `clarity` | Readability, sentence complexity, absence of jargon |
| Completeness | `completeness` | Coverage of key specs, use cases, compatibility |
| Searchability | `searchability` | Keyword prefix format, structural pattern compliance |
| Compliance | `compliance` | Negative rule pass rate, objectivity, legal safety |

**Score Display:** `ProgressBar` component with color coding. Compliance score uses `bg-orange-500` to highlight its critical nature.

**Risk Level Derivation:**

```typescript
function deriveRiskLevel(scores: EvaluationScores, issues: EvaluationIssue[]): 'Low' | 'Medium' | 'High' {
  const errorCount = issues.filter(i => i.type === 'Error').length;
  const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
  if (errorCount > 0 || scores.compliance < 70) return 'High';
  if (avgScore < 80 || issues.length > 2) return 'Medium';
  return 'Low';
}
```

---

### 6.6 Translation Module

**Purpose:** Provides a secondary language reference pane for each content section, allowing bilingual review without additional API calls.

**Display Location:** Right half of each `EditorSection` component.

**Supported Languages:** EN / DE / FR / IT / ES / ZH

**Toggle Control:** Language selector in `GenSettingsBar` updates `appSettings.translationLang`, affecting all sections simultaneously.

**Data Source:** `TranslationMap` — pre-generated translations keyed by `[section][languageCode]`.

**Note for Implementation:** In production, translations should be generated by `ContentGenerationAgent` alongside the primary language output. The translation pane shows the same content in an alternative language (defaulting to EN if the target language is not EN).

---

### 6.7 Settings & Rules Module

**Purpose:** Central configuration panel for LLM settings, persona library, and category-isolated rule management.

**Component:** `SettingsAndRules`

**Sub-sections:**

#### Language Settings
- `systemLanguage`: Controls UI display language (ZH / EN)
- `targetLanguage`: Default target market language for newly created tasks

#### LLM Configuration
- `model`: Active LLM selection (GPT-4o, Claude 3.5 Sonnet, Gemini 1.5 Pro)
- `apiKey`: LLM API key, stored in browser `localStorage`, masked after save

#### Data Fetch API (Tinyfish)
- `tinyfishApiKey`: API key for the Tinyfish scraping service
- Links to: https://docs.tinyfish.ai/

#### Persona Library
- CRUD operations on `Persona[]`
- Each persona has a `name` and `description` (behavioral prompt)
- **AI Optimize** button: calls LLM to enhance the persona description following COSMO intent standards
- Personas are global (not category-specific) and assigned per-task

#### Category Rules Library
- Rules are scoped per category via tab navigation
- A `通用` (General) category applies cross-category rules
- **Generation Rules** (`type: 'instruction'`): prescriptive content guidelines
  - Priority: `Required` (must follow) or `Suggested` (best effort)
  - Reference ASINs: up to 3 archived tasks as few-shot examples
  - **AI Optimize** button: enhances rule prompt with Amazon best practices
- **Compliance Constraints** (`type: 'negative'`): prohibited content rules
  - Severity: `Critical` (block) or `High` (warn)

**Rule Execution Order in Prompts:**
```
System Prompt = [Persona descriptions] + [Category instruction rules] + [General instruction rules]
Validation    = [Category negative rules] + [General negative rules]
```

---

### 6.8 i18n Module

**Purpose:** Full bilingual UI support (Simplified Chinese / English).

**Implementation:** Static dictionary object `DICT` with all UI string keys.

**Usage Pattern:**
```typescript
const t = useCallback(
  (key: string) => DICT[appSettings.systemLanguage]?.[key] || DICT['en'][key] || key,
  [appSettings.systemLanguage]
);
```

**String Key Namespaces:**

| Prefix | Covers |
|---|---|
| `app.*` | Application-level labels |
| `sidebar.*` | Sidebar navigation labels |
| `status.*` | Task status display labels |
| `ws.*` | Workspace panel labels |
| `score.*` | Evaluation score dimension labels |
| `btn.*` | Action button labels |
| `section.*` | Content section names (title, bullets, desc) |
| `set.*` | Settings panel labels |
| `modal.*` | Modal dialog labels |
| `global.*` | Global action labels (save, saved) |
| `ai.*` | AI action labels (optimize, optimizing) |

---

## 7. API Interface Specification

### 7.1 Tinyfish Data Fetch API

```
POST https://api.tinyfish.ai/v1/extract
Authorization: Bearer {tinyfishApiKey}
Content-Type: application/json

Request Body:
{
  "url": "https://www.amazon.com/dp/B08TGPTQ14",
  "schema": {
    "title": "string",
    "bullets": "string[]",
    "description": "string",
    "specs": "object"
  }
}

Response:
{
  "data": {
    "title": "...",
    "bullets": ["...", "..."],
    "description": "...",
    "specs": { "Brand": "TP-Link", "Model Name": "Archer AX73" }
  },
  "metadata": {
    "sourceUrl": "https://www.amazon.com/dp/B08TGPTQ14",
    "extractedAt": "2026-04-18T10:00:00Z",
    "confidence": 0.97
  }
}
```

### 7.2 LLM Content Generation API

**OpenAI (GPT-4o)**
```
POST https://api.openai.com/v1/chat/completions
Authorization: Bearer {apiKey}

{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "{assembled system prompt with personas + rules}" },
    { "role": "user",   "content": "{section-specific generation prompt with raw content}" }
  ],
  "temperature": 0.3,
  "max_tokens": 1024
}
```

**Prompt Template (ContentGenerationAgent):**
```
SYSTEM:
You are an expert Amazon marketplace copywriter for TP-Link products.

[PERSONA CONTEXT]
Target audiences for this content:
- {persona.name}: {persona.description}

[GENERATION RULES]
Required rules (must follow):
1. {rule.name} [scope: {rule.targetSection}]
   Reference examples: {fewShot content}

Suggested rules (best effort):
1. {rule.name}

[OUTPUT CONSTRAINTS]
- Language: {targetLanguage}
- Do NOT use: absolute superlatives (best, No.1, unrivaled)
- Do NOT make unverified security claims

USER:
Rewrite the following Amazon {section} for the product:
---
{rawContent}
---
Product specs: {specs}
Output only the rewritten {section}, no preamble.
```

### 7.3 LLM Compliance Validation API

Compliance validation is run as a separate LLM call with a judge prompt:

```
SYSTEM:
You are a compliance auditor for Amazon marketplace content.
Check if the following content violates any of the listed constraints.
Return JSON: { "passed": boolean, "violations": [{ "rule": string, "severity": string }] }

USER:
Content: {generatedContent}
Constraints:
{negativeRules.map(r => `- [${r.severity}] ${r.name}`).join('\n')}
```

---

## 8. State Management

### 8.1 Current Implementation (React useState)

All application state is co-located in the `App` root component and passed down via props. This is appropriate for the current single-page, single-user architecture.

**Global State Shape:**
```typescript
// App-level state
tasks:        Task[]
categories:   string[]
rules:        Rule[]
personas:     Persona[]
appSettings:  AppSettings

// Navigation state
activeTaskId: string
view:         'workspace' | 'rules'
searchTerm:   string
isModalOpen:  boolean

// Workspace-local state (inside Workspace component)
globalLoading:   boolean
sectionLoading:  Record<ContentKey, boolean>
edits:           GeneratedContent
```

### 8.2 Recommended Architecture for Production

For the full production implementation, adopt a layered state management approach:

```
┌─────────────────────────────────────────────────────┐
│  Server State (React Query / SWR)                   │
│  - tasks, rules, personas, categories               │
│  - Cached, invalidated on mutations                 │
├─────────────────────────────────────────────────────┤
│  Client State (Zustand or Redux Toolkit)            │
│  - activeTaskId, view, searchTerm                   │
│  - appSettings (LLM config, language prefs)         │
│  - UI loading states                                │
├─────────────────────────────────────────────────────┤
│  Local Component State                              │
│  - Modal open/close state                           │
│  - In-flight form values                            │
│  - edits (textarea content before save)             │
└─────────────────────────────────────────────────────┘
```

### 8.3 Persistence

| Data | Storage | Rationale |
|---|---|---|
| `apiKey`, `tinyfishApiKey` | `localStorage` | Sensitive credential; client-side only |
| `appSettings` (non-sensitive) | `localStorage` | User preference persistence |
| `tasks`, `rules`, `personas` | Backend DB | Collaborative access, auditability |
| `generatedContent` per task | Backend DB | Version history and approval audit trail |

---

## 9. Engineering Roadmap

### 9.1 Phase 1 — Frontend Foundation (Current Prototype → Production React App)

| Task | Description | Priority |
|---|---|---|
| Project scaffolding | Vite + React + TypeScript + Tailwind CSS | Critical |
| Type definitions | Implement all interfaces from Section 4 | Critical |
| Component split | Extract each component to its own `.tsx` file | Critical |
| i18n system | Replace static `DICT` with `i18next` | High |
| API service layer | `src/services/tinyfish.ts`, `src/services/llm.ts` | High |
| State management | Zustand store for global state | High |
| Real data integration | Replace all `MOCK_*` constants with API calls | High |

**Suggested File Structure:**
```
src/
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── SidebarGroup.tsx
│   ├── workspace/
│   │   ├── Workspace.tsx
│   │   ├── SourceDataPanel.tsx
│   │   ├── AIWorkspacePanel.tsx
│   │   ├── EditorSection.tsx
│   │   ├── EvaluationReport.tsx
│   │   └── GenSettingsBar.tsx
│   ├── settings/
│   │   ├── SettingsAndRules.tsx
│   │   ├── PersonaLibrary.tsx
│   │   ├── CategoryRulesLibrary.tsx
│   │   ├── LLMConfig.tsx
│   │   └── TinyfishConfig.tsx
│   ├── modals/
│   │   ├── CreateTaskModal.tsx
│   │   ├── PersonaModal.tsx
│   │   ├── RuleModal.tsx
│   │   └── DeleteConfirmModal.tsx
│   └── ui/
│       ├── Badge.tsx
│       └── ProgressBar.tsx
├── agents/
│   ├── DataFetchAgent.ts
│   ├── ContextBuilderAgent.ts
│   ├── ContentGenerationAgent.ts
│   ├── ComplianceGuardAgent.ts
│   └── EvaluationAgent.ts
├── services/
│   ├── tinyfish.ts
│   └── llm.ts
├── store/
│   ├── taskStore.ts
│   ├── rulesStore.ts
│   └── settingsStore.ts
├── types/
│   └── index.ts           // All interfaces from Section 4
├── i18n/
│   ├── zh.json
│   └── en.json
└── App.tsx
```

### 9.2 Phase 2 — Backend & Agent Pipeline

| Task | Description | Priority |
|---|---|---|
| Backend API | Node.js (Hono/Express) or Python (FastAPI) REST API | Critical |
| Database | PostgreSQL: tasks, rules, personas, generated_content | Critical |
| Agent orchestration | Implement 5-agent pipeline per Section 5.2 | Critical |
| Async job queue | BullMQ / Celery for non-blocking generation tasks | High |
| WebSocket updates | Push agent progress to frontend in real-time | High |
| Few-shot retrieval | Vector search on archived tasks for reference examples | Medium |

### 9.3 Phase 3 — Advanced Features

| Task | Description | Priority |
|---|---|---|
| Batch processing | Queue multiple ASINs for overnight generation | Medium |
| Version history | Store and diff previous generations per task | Medium |
| Team collaboration | Multi-user access with role-based permissions | Medium |
| Export | Download approved listings as CSV / Excel for Amazon Seller Central | Medium |
| Analytics dashboard | Track approval rates, score trends, compliance stats | Low |
| A/B testing | Compare two generated variants side-by-side | Low |

### 9.4 Key Technical Decisions

**LLM Provider Strategy:** Support multiple providers (OpenAI, Anthropic, Google) via a unified adapter interface. The `AppSettings.model` field already anticipates this.

**Compliance Guard — LLM vs. Rule-Based:** For `Critical`-severity rules that match exact keywords/phrases, prefer deterministic string matching over LLM judgment to avoid false negatives. Use LLM only for semantic violations (tone, implied claims).

**Translation Strategy:** Generate all 6 language translations in a single batched LLM call at generation time, rather than on-demand. This reduces latency on the review screen.

**Few-Shot Reference Loading:** Reference ASINs in rules point to approved archived tasks. At prompt assembly time, load the approved `GeneratedContent` of those tasks as positive examples. This creates a self-reinforcing quality flywheel.

---

*Document maintained by the Right First Time engineering team. For questions, refer to the codebase at `html prompt.txt` or the MetaGPT framework documentation at https://github.com/FoundationAgents/MetaGPT.*
