import { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Check, Archive, Loader2, CheckCircle, AlertTriangle, X, RotateCcw, Copy } from 'lucide-react';
import { Badge } from '@/components/ui';
import { SourceDataPanel } from './SourceDataPanel';
import { GenSettingsBar } from './GenSettingsBar';
import { EditorSection } from './EditorSection';
import { MediaAnalysisPanel } from './MediaAnalysisPanel';
import { translateContent, translateSection, generateListing, parseLLMError } from '@/services/llm';
import {
  normalizeModelKey,
  upsertCountryListing,
  getCountryListing,
  publishApprovedListingToSharedLibrary,
  markCountryListingPending,
  unpublishSharedListingForCountry,
  updateCountryWorkspaceOverrides,
  addSharedItemToCountryWorkspace,
} from '@/services/firestoreService';
import { getLanguageForCountry, inferCountryFromLanguage } from '@/lib/countryLanguage';
import { resolveWorkspaceApiKey } from '@/lib/apiKeyResolver';
import { isGlobalCategory, localizeSystemText } from '@/lib/systemTextI18n';
import { useTaskStore } from '@/store/taskStore';
import { useAuthStore } from '@/store/authStore';
import { useWorkspaceLibraryStore } from '@/store/workspaceLibraryStore';
import type {
  Task,
  Persona,
  Rule,
  AppSettings,
  GeneratedContent,
  SectionMetadata,
  TranslationMap,
  ContentKey,
  KeywordSet,
  CategoryLabelMap,
  BusinessCountryCode,
  CountryListing,
} from '@/types';
import { LANGUAGES } from '@/constants';

const COUNTRY_ORDER: BusinessCountryCode[] = ['UK', 'DE', 'IT', 'ES', 'FR', 'BE', 'NL', 'PL', 'SE'];

interface CountryPreviewState {
  countryCode: BusinessCountryCode;
  task: Task;
}

interface TaskAsyncUiState {
  globalLoading: boolean;
  sectionLoading: Record<ContentKey, boolean>;
  translationLoading: boolean;
  sectionTranslateLoading: Record<ContentKey, boolean>;
  translateError: string | null;
  rewriteError: string | null;
}

/** Build initial edits from the actual task's fetched product data. */
function taskToEdits(task: Task): GeneratedContent {
  return {
    title:       task.name ?? '',
    bullets:     (task.bullets ?? []).join('\n\n'),
    description: task.description ?? '',
  };
}

/** Persist editor listing fields to the task document (name / bullets[] / description). */
function listingEditsToTaskPatch(content: GeneratedContent): Partial<Task> {
  const raw = content.bullets.trim();
  const bulletItems =
    raw.includes('\n\n')
      ? raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
      : raw.split(/\n/).map((b) => b.trim()).filter(Boolean);
  return {
    name: content.title,
    bullets: bulletItems,
    description: content.description,
  };
}

function uniqueNonEmpty(values: Array<string | undefined | null>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const normalized = (value ?? '').trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out;
}

function createTaskAsyncUiState(): TaskAsyncUiState {
  return {
    globalLoading: false,
    sectionLoading: { title: false, bullets: false, description: false },
    translationLoading: false,
    sectionTranslateLoading: { title: false, bullets: false, description: false },
    translateError: null,
    rewriteError: null,
  };
}

/** Metadata chips + rule-focused tips (tags mirror what is sent to the model). */
function buildEditorSectionMetadata(
  key: ContentKey,
  task: Task,
  personas: Persona[],
  rules: Rule[],
  systemLang: AppSettings['systemLanguage'],
  resolvePersonaName: (persona: Persona) => string,
  resolveRuleName: (rule: Rule) => string,
): SectionMetadata {
  const active = rules.filter(
    (r) => r.active && (isGlobalCategory(r.category) || r.category === task.category),
  );
  const instr = active.filter(
    (r) => r.type === 'instruction' && (r.targetSection === key || r.targetSection === 'all'),
  );
  const personaLines = (task.personaIds ?? [])
    .map((pid) => personas.find((p) => p.id === pid))
    .filter((p): p is Persona => Boolean(p))
    .map((p) => `[Persona] ${resolvePersonaName(p)}`);
  const ruleLines = instr.map((r) => `[${r.category} · #${r.id}] ${resolveRuleName(r)}`).slice(0, 24);
  return {
    rulesApplied: [...personaLines, ...ruleLines],
    negativeCheck: { passed: true },
    explanation:
      systemLang === 'cn'
        ? '规则小提示：下方标签为送入模型的规则与画像摘要。仅已启用的指令型规则（作用域含本区块或全部）会参与重写；全局规则与本品类规则会叠加，请与规则库对照避免遗漏或冲突。'
        : 'Rule tips: tags below summarize rules and personas sent to the model. Only active instruction rules scoped to this section or “all” are used in rewrite; global and category rules stack—check the full rule list for gaps or conflicts.',
  };
}

interface WorkspaceProps {
  task: Task | undefined;
  updateTask: (id: string, updates: Partial<Task>) => void;
  categories: string[];
  categoryLabels: CategoryLabelMap;
  personas: Persona[];
  appSettings: AppSettings;
  setAppSettings: (settings: Partial<AppSettings>) => void;
  rules?: import('@/types').Rule[];
  /** Current keyword set for the task's category */
  categoryKeywords?: KeywordSet;
  /** Category-level reference ASINs (up to 3), highest AI priority */
  categoryRefAsins?: string[];
}

export function Workspace({
  task,
  updateTask,
  categories,
  categoryLabels,
  personas,
  appSettings,
  setAppSettings,
  rules = [],
  categoryKeywords,
  categoryRefAsins = [],
}: WorkspaceProps) {
  const { t } = useTranslation();

  const allTasks = useTaskStore((s) => s.tasks);
  const setActiveTaskId = useTaskStore((s) => s.setActiveTaskId);
  const addTask = useTaskStore((s) => s.addTask);
  const profile = useAuthStore((s) => s.profile);
  const sharedLibrary = useWorkspaceLibraryStore((s) => s.sharedLibrary);
  const inferredCountryFromTaskLanguage = inferCountryFromLanguage(task?.language ?? 'en');
  const effectiveApiKey = resolveWorkspaceApiKey({
    manualKey: appSettings.apiKey,
    countryCode: task?.countryCode ?? profile?.countryCode,
    fallbackCountryCodes: [
      task?.countryCode,
      inferredCountryFromTaskLanguage,
      profile?.countryCode,
    ],
  });

  const [globalLoading, setGlobalLoadingLocal] = useState(false);
  const [sectionLoading, setSectionLoadingLocal] = useState<Record<ContentKey, boolean>>({
    title: false, bullets: false, description: false,
  });
  const [edits, setEdits] = useState<GeneratedContent>({ title: '', bullets: '', description: '' });
  const [translationMap, setTranslationMap] = useState<TranslationMap>({});
  const [translationLoading, setTranslationLoadingLocal] = useState(false);
  const [sectionTranslateLoading, setSectionTranslateLoadingLocal] = useState<Record<ContentKey, boolean>>({
    title: false, bullets: false, description: false,
  });
  const [translateError, setTranslateErrorLocal] = useState<string | null>(null);
  const [rewriteError, setRewriteErrorLocal] = useState<string | null>(null);
  const activeTaskIdRef = useRef(task?.id ?? '');
  const asyncUiStateByTaskRef = useRef<Record<string, TaskAsyncUiState>>({});
  const [importingShared, setImportingShared] = useState(false);
  const [countryPreview, setCountryPreview] = useState<CountryPreviewState | null>(null);
  const [countryPreviewLoading, setCountryPreviewLoading] = useState(false);
  const [copyingKey, setCopyingKey] = useState<ContentKey | 'all' | null>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const getTaskAsyncUiState = (taskId: string): TaskAsyncUiState =>
    asyncUiStateByTaskRef.current[taskId] ?? createTaskAsyncUiState();

  const patchTaskAsyncUiState = (taskId: string, patch: Partial<TaskAsyncUiState>) => {
    const next = { ...getTaskAsyncUiState(taskId), ...patch };
    asyncUiStateByTaskRef.current[taskId] = next;
    if (activeTaskIdRef.current === taskId) {
      setGlobalLoadingLocal(next.globalLoading);
      setSectionLoadingLocal(next.sectionLoading);
      setTranslationLoadingLocal(next.translationLoading);
      setSectionTranslateLoadingLocal(next.sectionTranslateLoading);
      setTranslateErrorLocal(next.translateError);
      setRewriteErrorLocal(next.rewriteError);
    }
  };

  const patchSectionLoadingForTask = (taskId: string, patch: Partial<Record<ContentKey, boolean>>) => {
    const current = getTaskAsyncUiState(taskId).sectionLoading;
    patchTaskAsyncUiState(taskId, { sectionLoading: { ...current, ...patch } });
  };

  const patchSectionTranslateLoadingForTask = (taskId: string, patch: Partial<Record<ContentKey, boolean>>) => {
    const current = getTaskAsyncUiState(taskId).sectionTranslateLoading;
    patchTaskAsyncUiState(taskId, { sectionTranslateLoading: { ...current, ...patch } });
  };

  useEffect(() => {
    activeTaskIdRef.current = task?.id ?? '';
    if (!task?.id) return;
    const state = getTaskAsyncUiState(task.id);
    setGlobalLoadingLocal(state.globalLoading);
    setSectionLoadingLocal(state.sectionLoading);
    setTranslationLoadingLocal(state.translationLoading);
    setSectionTranslateLoadingLocal(state.sectionTranslateLoading);
    setTranslateErrorLocal(state.translateError);
    setRewriteErrorLocal(state.rewriteError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task?.id]);

  // Sync fetched product data into the editor when switching tasks (layout phase avoids stale persist races)
  useLayoutEffect(() => {
    if (task) {
      setEdits(taskToEdits(task));
      setTranslationMap(task.translations ?? {});   // restore persisted translations
      setTranslateErrorLocal(null);
    } else {
      setEdits({ title: '', bullets: '', description: '' });
      setTranslationMap({});
      setTranslateErrorLocal(null);
    }
    setCountryPreview(null);
  }, [task?.id]);

  useEffect(() => {
    if (!task) return;
    if (countryPreview) {
      setEdits(taskToEdits(countryPreview.task));
      setTranslationMap({});
      return;
    }
    setEdits(taskToEdits(task));
    setTranslationMap(task.translations ?? {});
  }, [countryPreview?.countryCode, task?.id]);

  useEffect(() => {
    if (!copyNotice) return;
    const timer = setTimeout(() => setCopyNotice(null), 2600);
    return () => clearTimeout(timer);
  }, [copyNotice]);

  // Debounced persistence: any manual edit (typing in AI output textareas) is written
  // back to the task after the user pauses for 600ms, so refreshes don't drop work.
  const persistedSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (!task) return;
    if (countryPreview) return;
    const snapshot = JSON.stringify(edits);
    if (persistedSnapshotRef.current === '') {
      persistedSnapshotRef.current = JSON.stringify(taskToEdits(task));
    }
    if (snapshot === persistedSnapshotRef.current) return;

    const timer = setTimeout(() => {
      const patch = listingEditsToTaskPatch(edits);
      const current: Partial<Task> = {
        name: task.name ?? '',
        bullets: task.bullets ?? [],
        description: task.description ?? '',
      };
      const changed =
        patch.name !== current.name ||
        patch.description !== current.description ||
        JSON.stringify(patch.bullets) !== JSON.stringify(current.bullets);
      if (changed) {
        updateTask(task.id, patch);
        if (task.fromSharedId && task.countryCode && task.modelKey) {
          void updateCountryWorkspaceOverrides(task.countryCode, task.modelKey, {
            title: patch.name,
            bullets: patch.bullets,
            description: patch.description,
          });
        }
        persistedSnapshotRef.current = snapshot;
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [countryPreview, edits, task?.id]);

  // When the task id changes, reset the persist snapshot baseline
  useEffect(() => {
    persistedSnapshotRef.current = task ? JSON.stringify(taskToEdits(task)) : '';
  }, [task?.id]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50 flex-col gap-3">
        <img src="/logo.png" alt="logo" className="w-12 h-12 opacity-20" />
        <span className="text-sm">{t('ws.emptyTask')}</span>
      </div>
    );
  }

  const displayTask = countryPreview?.task ?? task;
  const isCountryPreview = Boolean(countryPreview);
  const isArchived = task.status === 'archived';
  const isReadonlyView = isArchived || isCountryPreview;
  const localizedPersonaName = (persona: Persona): string =>
    localizeSystemText(persona.name, persona.nameI18n, appSettings.systemLanguage);
  const localizedPersonaDescription = (persona: Persona): string =>
    localizeSystemText(persona.description, persona.descriptionI18n, appSettings.systemLanguage);
  const localizedRuleName = (rule: Rule): string =>
    localizeSystemText(rule.name, rule.nameI18n, appSettings.systemLanguage);
  // Implicit locale hint for AI rewrite: for country accounts, always default
  // generation language to that marketplace language (DE→de, IT→it, ES→es, ...).
  const accountCountry =
    profile && profile.role !== 'admin' && profile.countryCode !== 'GLOBAL'
      ? (profile.countryCode as BusinessCountryCode)
      : null;
  const rewriteLanguage = accountCountry ? getLanguageForCountry(accountCountry) : task.language;

  // ── Listing rule selection ──────────────────────────────────
  // Only rules the user explicitly checked participate in AI rewrite. Default is
  // none; the last selection is persisted in settings (cross-device, per account).
  const listingRulePickKey = (rule: Rule): string =>
    `${rule.createdByCountry ?? accountCountry ?? 'GLOBAL'}:${rule.id}`;
  const listingCandidateRules = rules
    .filter((r) => r.active && (isGlobalCategory(r.category) || r.category === task.category))
    .filter((r) => {
      if (!accountCountry) return true;
      return (r.createdByCountry ?? accountCountry) === accountCountry;
    });
  const candidateListingKeySet = new Set(listingCandidateRules.map((r) => listingRulePickKey(r)));
  const persistedListingKeys = appSettings.selectedListingRuleKeys ?? [];
  const selectedListingKeySet = new Set(persistedListingKeys);
  // Keys shown/counted in the picker are scoped to the current category; the
  // persisted set may also hold keys from other categories (kept untouched).
  const selectedListingKeysInScope = listingCandidateRules
    .map((r) => listingRulePickKey(r))
    .filter((k) => selectedListingKeySet.has(k));

  const toggleListingRule = (key: string) => {
    const next = selectedListingKeySet.has(key)
      ? persistedListingKeys.filter((k) => k !== key)
      : [...persistedListingKeys, key];
    setAppSettings({ selectedListingRuleKeys: next });
  };
  const selectAllListingRules = () => {
    const merged = new Set(persistedListingKeys);
    candidateListingKeySet.forEach((k) => merged.add(k));
    setAppSettings({ selectedListingRuleKeys: [...merged] });
  };
  const clearListingRules = () => {
    setAppSettings({
      selectedListingRuleKeys: persistedListingKeys.filter((k) => !candidateListingKeySet.has(k)),
    });
  };

  /** Collect active rules (global + category) and personas for current task. */
  const buildGenerateOptions = (section?: ContentKey | 'all') => {
    const activeRules = rules
      .filter((r) => r.active && (isGlobalCategory(r.category) || r.category === task.category))
      .filter((r) => {
        // Local-only: a country account generates with its own rules only. GLOBAL / other
        // countries' rules apply only after being imported (copied) via the Shared Library.
        if (!accountCountry) return true;
        const country = r.createdByCountry ?? accountCountry;
        return country === accountCountry;
      })
      // Only checked rules apply; default (no selection) => no rules participate.
      .filter((r) => selectedListingKeySet.has(listingRulePickKey(r)))
      .sort((a, b) => {
        const priority = (country?: string): number => {
          if (!accountCountry) return 0;
          if (country === accountCountry) return 0;
          if (country === 'GLOBAL') return 1;
          return 2;
        };
        const pa = priority(a.createdByCountry ?? accountCountry ?? undefined);
        const pb = priority(b.createdByCountry ?? accountCountry ?? undefined);
        if (pa !== pb) return pa - pb;
        const ta = a.updatedAt ?? a.createdAt ?? '';
        const tb = b.updatedAt ?? b.createdAt ?? '';
        return tb.localeCompare(ta);
      });
    const instructionRules = activeRules
      .filter((r) => r.type === 'instruction')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: localizedRuleName(r),
        priority: r.priority,
        targetSection: r.targetSection,
      }));
    const negativeRules = activeRules
      .filter((r) => r.type === 'negative')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: localizedRuleName(r),
        severity: r.severity,
        targetSection: r.targetSection,
      }));

    const taskPersonas = personas
      .filter((p) => task.personaIds?.includes(p.id))
      .map((p) => ({
        name: localizedPersonaName(p),
        description: localizedPersonaDescription(p),
      }));

    // Find a benchmark task in the same category (exclude self)
    const benchmarkTask = allTasks.find(
      (t) => t.isBenchmark && t.category === task.category && t.id !== task.id,
    );
    const benchmark = benchmarkTask
      ? {
          title:       benchmarkTask.name ?? '',
          bullets:     (benchmarkTask.bullets ?? []).join('\n'),
          description: benchmarkTask.description ?? '',
        }
      : undefined;

    return {
      section,
      personas: taskPersonas,
      instructionRules,
      negativeRules,
      benchmark,
      referenceAsins: categoryRefAsins.filter(Boolean),
      keywords: categoryKeywords && (categoryKeywords.primary || categoryKeywords.secondary.length > 0)
        ? categoryKeywords
        : undefined,
    };
  };


  const handleSectionTranslate = async (key: ContentKey) => {
    const requestTaskId = task.id;
    if (!effectiveApiKey) {
      patchTaskAsyncUiState(requestTaskId, { translateError: t('ws.apiKeyRequired') });
      return;
    }
    patchSectionTranslateLoadingForTask(requestTaskId, { [key]: true });
    patchTaskAsyncUiState(requestTaskId, { translateError: null });
    try {
      const toLang = appSettings.translationLang;
      const fromLang = task.language;
      const translated = await translateSection(key, edits[key], fromLang, toLang, appSettings.model, effectiveApiKey);
      const prev = task.translations ?? {};
      const newMap: TranslationMap = {
        ...prev,
        [key]: { ...(prev[key] ?? {}), [toLang]: translated },
      };
      if (activeTaskIdRef.current === requestTaskId) {
        setTranslationMap(newMap);
      }
      updateTask(requestTaskId, { translations: newMap });
    } catch (err) {
      console.error('[sectionTranslate]', err);
      patchTaskAsyncUiState(requestTaskId, { translateError: parseLLMError(err) });
    } finally {
      patchSectionTranslateLoadingForTask(requestTaskId, { [key]: false });
    }
  };

  const handleApprove = async () => {
    const requestTaskId = task.id;
    const rawModel = (task.modelKey ?? '').trim();
    if (!rawModel) {
      patchTaskAsyncUiState(requestTaskId, { rewriteError: t('ws.modelRequiredApprove') });
      return;
    }
    patchTaskAsyncUiState(requestTaskId, { globalLoading: true, rewriteError: null });
    try {
      const currentProfile = profile;
      const fallbackCountry =
        currentProfile && currentProfile.role !== 'admin' && currentProfile.countryCode !== 'GLOBAL'
          ? (currentProfile.countryCode as BusinessCountryCode)
          : undefined;
      const countryCode = task.countryCode ?? fallbackCountry;
      const modelKey = normalizeModelKey(rawModel);

      if (countryCode) {
        const allExtraAsins = Object.values(task.extraAsinsByCountry ?? {}).flat();
        const allEans = Object.values(task.eansByCountry ?? {}).flat();
        const asinList = uniqueNonEmpty([task.asin, ...(allExtraAsins.length ? allExtraAsins : (task.extraAsins ?? []))]);
        const productIdentifiers = uniqueNonEmpty([...asinList, ...(allEans.length ? allEans : (task.eans ?? []))]);
        const listing = await upsertCountryListing({
          modelKey,
          countryCode,
          asin: task.asin,
          status: 'approved',
          title: edits.title,
          bullets: listingEditsToTaskPatch(edits).bullets,
          description: edits.description,
          media: task.images ?? [],
          sourceType: 'native',
          sourceListingId: task.id,
        });
        await publishApprovedListingToSharedLibrary({
          modelKey,
          sourceCountry: countryCode,
          asinList,
          summaryTitle: listing.title,
          summaryBullets: listing.bullets,
          thumbnail: (task.images ?? []).find((u) => /^https?:\/\//i.test(u)),
          snapshot: listing,
          searchKeywords: uniqueNonEmpty([task.name, task.category, ...productIdentifiers]),
        });
      }

      updateTask(requestTaskId, { status: 'archived', modelKey, countryCode });
    } catch (err) {
      console.error('[approve/publish]', err);
      patchTaskAsyncUiState(requestTaskId, { rewriteError: parseLLMError(err) });
    } finally {
      patchTaskAsyncUiState(requestTaskId, { globalLoading: false });
    }
  };

  /** Move reviewed (archived) task back to editable review state */
  const handleWithdrawReview = async () => {
    const requestTaskId = task.id;
    patchTaskAsyncUiState(requestTaskId, { globalLoading: true, rewriteError: null });
    try {
      if (task.countryCode && task.modelKey?.trim()) {
        await markCountryListingPending(task.modelKey, task.countryCode);
        await unpublishSharedListingForCountry(task.modelKey, task.countryCode);
      }
      updateTask(requestTaskId, { status: 'review' });
    } catch (err) {
      console.error('[withdraw/unpublish]', err);
      patchTaskAsyncUiState(requestTaskId, { rewriteError: parseLLMError(err) });
    } finally {
      patchTaskAsyncUiState(requestTaskId, { globalLoading: false });
    }
  };

  const handleGlobalRegenerate = async () => {
    const requestTaskId = task.id;
    if (!effectiveApiKey) {
      patchTaskAsyncUiState(requestTaskId, { rewriteError: t('ws.apiKeyRequired') });
      return;
    }
    patchTaskAsyncUiState(requestTaskId, { globalLoading: true, rewriteError: null });
    try {
      const result = await generateListing(
        { ...edits, category: task.category, language: rewriteLanguage },
        buildGenerateOptions('all'),
        appSettings.model,
        effectiveApiKey,
      );
      const next = { title: result.title, bullets: result.bullets, description: result.description };
      if (activeTaskIdRef.current === requestTaskId) {
        setEdits(next);
      }
      persistedSnapshotRef.current = JSON.stringify(next);
      updateTask(requestTaskId, listingEditsToTaskPatch(next));
    } catch (err) {
      console.error('[globalRegenerate]', err);
      patchTaskAsyncUiState(requestTaskId, { rewriteError: parseLLMError(err) });
    } finally {
      patchTaskAsyncUiState(requestTaskId, { globalLoading: false });
    }
  };

  const handleSectionRegenerate = async (key: ContentKey) => {
    const requestTaskId = task.id;
    if (!effectiveApiKey) {
      patchTaskAsyncUiState(requestTaskId, { rewriteError: t('ws.apiKeyRequired') });
      return;
    }
    patchSectionLoadingForTask(requestTaskId, { [key]: true });
    patchTaskAsyncUiState(requestTaskId, { rewriteError: null });
    try {
      const result = await generateListing(
        { ...edits, category: task.category, language: rewriteLanguage },
        buildGenerateOptions(key),
        appSettings.model,
        effectiveApiKey,
      );
      const next = { ...edits, [key]: result[key] };
      if (activeTaskIdRef.current === requestTaskId) {
        setEdits(next);
      }
      persistedSnapshotRef.current = JSON.stringify(next);
      updateTask(requestTaskId, listingEditsToTaskPatch(next));
    } catch (err) {
      console.error('[sectionRegenerate]', err);
      patchTaskAsyncUiState(requestTaskId, { rewriteError: parseLLMError(err) });
    } finally {
      patchSectionLoadingForTask(requestTaskId, { [key]: false });
    }
  };

  const handleTranslate = async () => {
    const requestTaskId = task.id;
    if (!effectiveApiKey) {
      patchTaskAsyncUiState(requestTaskId, { translateError: t('ws.apiKeyRequired') });
      return;
    }
    patchTaskAsyncUiState(requestTaskId, { translationLoading: true, translateError: null });
    try {
      const toLang = appSettings.translationLang;
      const fromLang = task.language;
      const result = await translateContent(
        { title: edits.title, bullets: edits.bullets, description: edits.description },
        fromLang,
        toLang,
        appSettings.model,
        effectiveApiKey,
      );
      // Merge so zh / en translations coexist (503 on one language should not wipe the other)
      const prev = task.translations ?? {};
      const newMap: TranslationMap = {
        title:       { ...prev.title, [toLang]: result.title },
        bullets:     { ...prev.bullets, [toLang]: result.bullets },
        description: { ...prev.description, [toLang]: result.description },
      };
      if (activeTaskIdRef.current === requestTaskId) {
        setTranslationMap(newMap);
      }
      // Persist to Firestore so translations survive page reload
      updateTask(requestTaskId, { translations: newMap });
    } catch (err) {
      console.error('[translate]', err);
      patchTaskAsyncUiState(requestTaskId, { translateError: parseLLMError(err) });
    } finally {
      patchTaskAsyncUiState(requestTaskId, { translationLoading: false });
    }
  };

  // Detect which sections have been modified vs. the original fetched content
  const originalEdits = taskToEdits(displayTask);
  const isModifiedMap: Record<ContentKey, boolean> = {
    title:       edits.title.trim()   !== originalEdits.title.trim(),
    bullets:     edits.bullets.trim() !== originalEdits.bullets.trim(),
    description: edits.description.trim() !== originalEdits.description.trim(),
  };

  const targetLangObj = LANGUAGES.find((l) => l.code === displayTask.language);
  const langLabel = appSettings.systemLanguage === 'cn' ? targetLangObj?.zhLabel : targetLangObj?.label;
  const currentModelKey = normalizeModelKey(task.modelKey || task.name || task.asin);
  const groupedTaskCountries = allTasks.filter(
    (it) => normalizeModelKey(it.modelKey || it.name || it.asin) === currentModelKey && it.countryCode,
  );
  const groupedSharedCountries = sharedLibrary.filter((it) => it.modelKey === currentModelKey);
  const myCountryCode = accountCountry;
  const canCopyFromPreview = Boolean(
    isCountryPreview &&
    myCountryCode &&
    task.countryCode === myCountryCode,
  );
  const hasMyCountryTask = Boolean(
    myCountryCode && groupedTaskCountries.some((it) => it.countryCode === myCountryCode),
  );
  const importSource = groupedSharedCountries[0];
  const canImportFromShared = Boolean(myCountryCode && !hasMyCountryTask && importSource);
  const countryTags = COUNTRY_ORDER.filter((code) => {
    const hasTask = groupedTaskCountries.some((it) => it.countryCode === code);
    const hasShared = groupedSharedCountries.some((it) => it.sourceCountry === code);
    return hasTask || hasShared;
  });

  const buildCountryPreviewTask = (
    countryCode: BusinessCountryCode,
    listing: Partial<CountryListing>,
    sharedSource: (typeof groupedSharedCountries)[number] | undefined,
  ): Task => {
    const fallbackTitle = sharedSource?.summaryTitle ?? task.name ?? currentModelKey;
    const fallbackAsin = sharedSource?.asinList?.[0] ?? task.asin;
    return {
      id: `${task.id}::preview::${countryCode}`,
      modelKey: currentModelKey,
      asin: listing.asin ?? fallbackAsin,
      name: listing.title ?? fallbackTitle,
      countryCode,
      fromSharedId: sharedSource?.id,
      fromSharedCountry: countryCode,
      category: task.category,
      language: getLanguageForCountry(countryCode),
      personaIds: [],
      status: 'archived',
      bullets: listing.bullets ?? sharedSource?.summaryBullets ?? [],
      description: listing.description ?? '',
      images: listing.media ?? [],
      createdAt: listing.approvedAt ?? task.createdAt ?? new Date().toISOString(),
    };
  };

  const handleCountryTagClick = async (countryCode: BusinessCountryCode) => {
    const localTask = groupedTaskCountries.find((it) => it.countryCode === countryCode);
    if (localTask) {
      setCountryPreview(null);
      setActiveTaskId(localTask.id);
      return;
    }

    const sharedItem = groupedSharedCountries.find((it) => it.sourceCountry === countryCode);
    if (!sharedItem) return;

    setCountryPreviewLoading(true);
    patchTaskAsyncUiState(task.id, { rewriteError: null });
    try {
      const listing = await getCountryListing(currentModelKey, countryCode);
      const approvedListing =
        listing && listing.status === 'approved'
          ? listing
          : ((sharedItem.snapshot as Partial<CountryListing>) ?? {});
      const previewTask = buildCountryPreviewTask(countryCode, approvedListing, sharedItem);
      setCountryPreview({ countryCode, task: previewTask });
    } catch (err) {
      console.error('[workspace/countryTagPreview]', err);
      patchTaskAsyncUiState(task.id, { rewriteError: parseLLMError(err) });
    } finally {
      setCountryPreviewLoading(false);
    }
  };

  const handleImportFromShared = async () => {
    if (!myCountryCode || !importSource || importingShared) return;
    setImportingShared(true);
    try {
      await addSharedItemToCountryWorkspace({
        countryCode: myCountryCode,
        sharedItem: importSource,
      });
      const createdTask: Task = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        modelKey: currentModelKey,
        asin: importSource.asinList[0] ?? task.asin,
        name: importSource.summaryTitle ?? task.name ?? currentModelKey,
        countryCode: myCountryCode,
        fromSharedId: importSource.id,
        fromSharedCountry: importSource.sourceCountry,
        category: task.category,
        language: getLanguageForCountry(myCountryCode),
        personaIds: [],
        status: 'review',
        bullets: importSource.snapshot.bullets ?? [],
        description: importSource.snapshot.description ?? '',
        images: importSource.snapshot.media ?? [],
        createdAt: new Date().toISOString(),
      };
      addTask(createdTask);
      setActiveTaskId(createdTask.id);
    } catch (err) {
      console.error('[workspace/importFromShared]', err);
      patchTaskAsyncUiState(task.id, { rewriteError: parseLLMError(err) });
    } finally {
      setImportingShared(false);
    }
  };

  const persistPatchToCurrentTask = (patch: Partial<Task>) => {
    updateTask(task.id, patch);
    if (task.fromSharedId && task.countryCode && task.modelKey) {
      const nextTitle = patch.name ?? task.name ?? '';
      const nextBullets = patch.bullets ?? task.bullets ?? [];
      const nextDescription = patch.description ?? task.description ?? '';
      void updateCountryWorkspaceOverrides(task.countryCode, task.modelKey, {
        title: nextTitle,
        bullets: nextBullets,
        description: nextDescription,
      });
    }
  };

  const handleCopyAllFromPreview = () => {
    if (!countryPreview || !canCopyFromPreview) return;
    setCopyingKey('all');
    try {
      const patch: Partial<Task> = {
        name: countryPreview.task.name,
        bullets: countryPreview.task.bullets ?? [],
        description: countryPreview.task.description ?? '',
      };
      persistPatchToCurrentTask(patch);
      setCopyNotice(t('ws.copyAllDone', { country: countryPreview.countryCode }));
    } finally {
      setCopyingKey(null);
    }
  };

  const handleCopySectionFromPreview = (key: ContentKey) => {
    if (!countryPreview || !canCopyFromPreview) return;
    setCopyingKey(key);
    try {
      if (key === 'title') {
        persistPatchToCurrentTask({ name: countryPreview.task.name });
      } else if (key === 'bullets') {
        persistPatchToCurrentTask({ bullets: countryPreview.task.bullets ?? [] });
      } else {
        persistPatchToCurrentTask({ description: countryPreview.task.description ?? '' });
      }
      setCopyNotice(t('ws.copySectionDone', { section: t(`section.${key === 'description' ? 'desc' : key}`) }));
    } finally {
      setCopyingKey(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F9FC] relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight mr-2">{displayTask.asin}</h2>
            {isReadonlyView && (
              <Badge color="green" className="ml-1">
                <Archive size={12} className="mr-1 inline" /> {t('status.archived')}
              </Badge>
            )}
            {langLabel && (
              <Badge color="blue">{langLabel}</Badge>
            )}
          </div>
          {countryTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
              {countryTags.map((code) => {
                const localTask = groupedTaskCountries.find((it) => it.countryCode === code);
                const hasShared = groupedSharedCountries.some((it) => it.sourceCountry === code);
                const isActive = (countryPreview?.countryCode ?? task.countryCode) === code;
                const clickable = Boolean(localTask || hasShared);
                return (
                  <button
                    key={`country-${code}`}
                    type="button"
                    onClick={() => handleCountryTagClick(code)}
                    disabled={!clickable || countryPreviewLoading}
                    className={`px-2 py-0.5 rounded-full text-[11px] border transition disabled:opacity-60 ${
                      isActive
                        ? 'bg-blue-100 border-blue-300 text-blue-700'
                        : hasShared
                          ? 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          : 'bg-white border-slate-200 text-slate-400'
                    }`}
                    title={hasShared ? t('ws.sharedVersionTip') : undefined}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          )}
          {canImportFromShared && (
            <button
              type="button"
              onClick={handleImportFromShared}
              disabled={importingShared}
              className="text-[11px] px-2 py-1 mb-1.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition disabled:opacity-60"
            >
              {importingShared
                ? t('ws.importing')
                : t('ws.importToMyWorkspace', { country: myCountryCode })}
            </button>
          )}
          <p className="text-xs text-slate-500">{displayTask.name || displayTask.url}</p>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 text-sm font-medium mr-2">
            <span className={!isReadonlyView ? 'text-[#0052D9]' : 'text-slate-800'}>{t('status.review')}</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className={isReadonlyView ? 'text-[#0052D9]' : 'text-slate-400'}>{t('status.archived')}</span>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {isCountryPreview && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 border border-blue-200 text-blue-700">
                {t('ws.previewCountryReadonly', { country: countryPreview?.countryCode })}
              </span>
              {canCopyFromPreview && (
                <button
                  type="button"
                  onClick={handleCopyAllFromPreview}
                  disabled={copyingKey === 'all'}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-blue-200 text-blue-700 bg-white hover:bg-blue-50 transition disabled:opacity-50"
                >
                  {copyingKey === 'all'
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Copy size={12} />}
                  {t('ws.copyAllFromPreview')}
                </button>
              )}
            </div>
          )}

          {task.status === 'review' && !isCountryPreview && (
            <button
              onClick={handleApprove}
              className="bg-green-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-green-700 transition flex items-center gap-2 shadow-sm"
            >
              {globalLoading ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> {t('btn.approve')}</>}
            </button>
          )}
          {isArchived && !isCountryPreview && (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium bg-slate-100 text-slate-500 border border-slate-200">
                <CheckCircle size={16} /> {t('btn.archivedBtn')}
              </span>
              <button
                type="button"
                onClick={handleWithdrawReview}
                className="border border-amber-300 bg-amber-50 text-amber-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-100 transition flex items-center gap-2 shadow-sm"
              >
                <RotateCcw size={16} />
                {t('btn.withdrawReview')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        <SourceDataPanel
          task={displayTask}
          onUpdate={(updates) => {
            if (isCountryPreview) return;
            updateTask(task.id, updates);
          }}
          readonly={isCountryPreview}
        />

        <div className="flex-1 bg-[#F7F9FC] flex flex-col h-full relative">
          <GenSettingsBar
            task={displayTask}
            personas={personas}
            categories={categories}
            categoryLabels={categoryLabels}
            appSettings={appSettings}
            globalLoading={globalLoading}
            translationLoading={translationLoading}
            isArchived={isReadonlyView}
            systemLanguage={appSettings.systemLanguage}
            onModelKeyChange={(model) => updateTask(task.id, { modelKey: model })}
            onCategoryChange={(cat) => updateTask(task.id, { category: cat })}
            onPersonaAdd={(pid) => updateTask(task.id, { personaIds: [...(task.personaIds ?? []), pid] })}
            onPersonaRemove={(pid) => updateTask(task.id, { personaIds: (task.personaIds ?? []).filter((id) => id !== pid) })}
            onGlobalRegenerate={handleGlobalRegenerate}
            onTranslationLangChange={(lang) => setAppSettings({ translationLang: lang })}
            onTranslate={handleTranslate}
            ruleOptions={listingCandidateRules.map((r) => ({
              key: listingRulePickKey(r),
              name: localizedRuleName(r),
            }))}
            selectedRuleKeys={selectedListingKeysInScope}
            onToggleRule={toggleListingRule}
            onSelectAllRules={selectAllListingRules}
            onClearRules={clearListingRules}
          />

          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[1000px] mx-auto space-y-6 pb-10 animate-in slide-in-from-bottom-4 fade-in duration-500">

              {/* Global loading overlay */}
              {globalLoading && (
                <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-20 flex items-center justify-center">
                  <div className="bg-white p-4 rounded-xl shadow-lg border border-slate-100 flex items-center gap-3">
                    <Loader2 size={20} className="animate-spin text-[#0052D9]" />
                    <span className="text-sm font-medium text-slate-700">{t('btn.regenerating')}</span>
                  </div>
                </div>
              )}

              {(translateError || rewriteError) && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                  <AlertTriangle size={16} className="shrink-0 mt-0.5 text-red-500" />
                  <p className="flex-1 whitespace-pre-line leading-relaxed">{translateError ?? rewriteError}</p>
                  <button
                    onClick={() => patchTaskAsyncUiState(task.id, { translateError: null, rewriteError: null })}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
              {copyNotice && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
                  <CheckCircle size={16} className="shrink-0 mt-0.5 text-emerald-600" />
                  <p className="flex-1 whitespace-pre-line leading-relaxed">{copyNotice}</p>
                </div>
              )}

              {(['title', 'bullets', 'description'] as ContentKey[]).map((key) => (
                <EditorSection
                  key={key}
                  title={t(`section.${key === 'description' ? 'desc' : key}`)}
                  dataKey={key}
                  metadata={buildEditorSectionMetadata(
                    key,
                    displayTask,
                    personas,
                    listingCandidateRules.filter((r) =>
                      selectedListingKeySet.has(listingRulePickKey(r)),
                    ),
                    appSettings.systemLanguage,
                    localizedPersonaName,
                    localizedRuleName,
                  )}
                  baselineValue={originalEdits[key]}
                  value={edits[key]}
                  translationMap={translationMap}
                  targetLanguage={displayTask.language}
                  translationLang={appSettings.translationLang}
                  systemLanguage={appSettings.systemLanguage}
                  isArchived={isReadonlyView}
                  isRegenerating={sectionLoading[key]}
                  translationLoading={translationLoading}
                  sectionTranslateLoading={sectionTranslateLoading[key]}
                  isModified={isModifiedMap[key]}
                  onChange={(val) => setEdits((prev) => ({ ...prev, [key]: val }))}
                  onRegenerate={handleSectionRegenerate}
                  onTranslate={() => handleSectionTranslate(key)}
                  onCopySection={isCountryPreview ? handleCopySectionFromPreview : undefined}
                  isCopyingSection={copyingKey === key}
                />
              ))}

              {/* Specs / Images / A+ analysis */}
              {!isCountryPreview && <MediaAnalysisPanel task={task} appSettings={appSettings} rules={rules} />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
