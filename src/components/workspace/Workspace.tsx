import { useState, useLayoutEffect, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Check, Archive, Loader2, CheckCircle, AlertTriangle, X, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui';
import { SourceDataPanel } from './SourceDataPanel';
import { GenSettingsBar } from './GenSettingsBar';
import { EvaluationReport } from './EvaluationReport';
import { EditorSection } from './EditorSection';
import { MediaAnalysisPanel } from './MediaAnalysisPanel';
import { translateContent, generateListing, parseLLMError } from '@/services/llm';
import { useTaskStore } from '@/store/taskStore';
import type {
  Task,
  Persona,
  Rule,
  AppSettings,
  GeneratedContent,
  SectionMetadata,
  EvaluationReport as EvalReport,
  TranslationMap,
  ContentKey,
} from '@/types';
import { LANGUAGES } from '@/constants';

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

/** Metadata chips + rule-focused tips (tags mirror what is sent to the model). */
function buildEditorSectionMetadata(
  key: ContentKey,
  task: Task,
  personas: Persona[],
  rules: Rule[],
  systemLang: AppSettings['systemLanguage'],
): SectionMetadata {
  const active = rules.filter(
    (r) => r.active && (r.category === '通用' || r.category === task.category),
  );
  const instr = active.filter(
    (r) => r.type === 'instruction' && (r.targetSection === key || r.targetSection === 'all'),
  );
  const personaLines = (task.personaIds ?? [])
    .map((pid) => personas.find((p) => p.id === pid))
    .filter((p): p is Persona => Boolean(p))
    .map((p) => `[画像] ${p.name}`);
  const ruleLines = instr.map((r) => `[${r.category} · #${r.id}] ${r.name}`).slice(0, 24);
  return {
    rulesApplied: [...personaLines, ...ruleLines],
    negativeCheck: { passed: true },
    explanation:
      systemLang === 'zh'
        ? '规则小提示：下方标签为送入模型的规则与画像摘要。仅已启用的「指令型」规则（作用域含本区块或「全部」）会参与重写；通用与本品类规则会叠加，请与规则库对照避免遗漏或冲突。'
        : 'Rule tips: tags below summarize rules and personas sent to the model. Only active instruction rules scoped to this section or “all” are used in rewrite; global and category rules stack—check the full rule list for gaps or conflicts.',
  };
}

const MOCK_EVALUATION: EvalReport = {
  scores: { clarity: 94, completeness: 90, searchability: 96, compliance: 82 },
  issues: [{ type: 'Warning', text: "Description still contains slightly subjective term 'high-performance'." }],
  riskLevel: 'Low',
};


interface WorkspaceProps {
  task: Task | undefined;
  updateTask: (id: string, updates: Partial<Task>) => void;
  categories: string[];
  personas: Persona[];
  appSettings: AppSettings;
  setAppSettings: (settings: Partial<AppSettings>) => void;
  rules?: import('@/types').Rule[];
}

export function Workspace({
  task,
  updateTask,
  categories,
  personas,
  appSettings,
  setAppSettings,
  rules = [],
}: WorkspaceProps) {
  const { t } = useTranslation();

  const allTasks = useTaskStore((s) => s.tasks);

  const [globalLoading, setGlobalLoading] = useState(false);
  const [sectionLoading, setSectionLoading] = useState<Record<ContentKey, boolean>>({
    title: false, bullets: false, description: false,
  });
  const [edits, setEdits] = useState<GeneratedContent>({ title: '', bullets: '', description: '' });
  const [translationMap, setTranslationMap] = useState<TranslationMap>({});
  const [translationLoading, setTranslationLoading] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  // Sync fetched product data into the editor when switching tasks (layout phase avoids stale persist races)
  useLayoutEffect(() => {
    if (task) {
      setEdits(taskToEdits(task));
      setTranslationMap(task.translations ?? {});   // restore persisted translations
      setTranslateError(null);
    } else {
      setEdits({ title: '', bullets: '', description: '' });
      setTranslationMap({});
      setTranslateError(null);
    }
  }, [task?.id]);

  // Debounced persistence: any manual edit (typing in AI output textareas) is written
  // back to the task after the user pauses for 600ms, so refreshes don't drop work.
  const persistedSnapshotRef = useRef<string>('');
  useEffect(() => {
    if (!task) return;
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
        persistedSnapshotRef.current = snapshot;
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [edits, task?.id]);

  // When the task id changes, reset the persist snapshot baseline
  useEffect(() => {
    persistedSnapshotRef.current = task ? JSON.stringify(taskToEdits(task)) : '';
  }, [task?.id]);

  if (!task) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-400 bg-slate-50 flex-col gap-3">
        <img src="/logo.png" alt="logo" className="w-12 h-12 opacity-20" />
        <span className="text-sm">Select or create a task</span>
      </div>
    );
  }

  const isArchived = task.status === 'archived';

  /** Collect active rules (global + category) and personas for current task. */
  const buildGenerateOptions = (section?: ContentKey | 'all') => {
    const activeRules = rules.filter((r) => r.active && (r.category === '通用' || r.category === task.category));
    const instructionRules = activeRules
      .filter((r) => r.type === 'instruction')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: r.name,
        priority: r.priority,
        targetSection: r.targetSection,
      }));
    const negativeRules = activeRules
      .filter((r) => r.type === 'negative')
      .map((r) => ({
        id: r.id,
        category: r.category,
        name: r.name,
        severity: r.severity,
        targetSection: r.targetSection,
      }));

    const taskPersonas = personas.filter((p) => task.personaIds?.includes(p.id));

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
      referenceAsins: (task.referenceAsins ?? []).filter(Boolean),
    };
  };

  const handleReferenceAsinAdd = (asin: string) => {
    const current = task.referenceAsins ?? [];
    if (current.length >= 3 || current.includes(asin)) return;
    updateTask(task.id, { referenceAsins: [...current, asin] });
  };

  const handleReferenceAsinRemove = (asin: string) => {
    const current = task.referenceAsins ?? [];
    updateTask(task.id, { referenceAsins: current.filter((a) => a !== asin) });
  };

  const handleApprove = () => {
    setGlobalLoading(true);
    setTimeout(() => {
      updateTask(task.id, { status: 'archived' });
      setGlobalLoading(false);
    }, 600);
  };

  /** Move reviewed (archived) task back to editable review state */
  const handleWithdrawReview = () => {
    updateTask(task.id, { status: 'review' });
  };

  const handleGlobalRegenerate = async () => {
    if (!appSettings.apiKey) {
      setRewriteError('请先在「系统设置 → 大模型配置」中填写 API 密钥。');
      return;
    }
    setGlobalLoading(true);
    setRewriteError(null);
    try {
      const result = await generateListing(
        { ...edits, category: task.category, language: task.language },
        buildGenerateOptions('all'),
        appSettings.model,
        appSettings.apiKey,
      );
      const next = { title: result.title, bullets: result.bullets, description: result.description };
      setEdits(next);
      persistedSnapshotRef.current = JSON.stringify(next);
      updateTask(task.id, listingEditsToTaskPatch(next));
    } catch (err) {
      console.error('[globalRegenerate]', err);
      setRewriteError(parseLLMError(err));
    } finally {
      setGlobalLoading(false);
    }
  };

  const handleSectionRegenerate = async (key: ContentKey) => {
    if (!appSettings.apiKey) {
      setRewriteError('请先在「系统设置 → 大模型配置」中填写 API 密钥。');
      return;
    }
    setSectionLoading((prev) => ({ ...prev, [key]: true }));
    setRewriteError(null);
    try {
      const result = await generateListing(
        { ...edits, category: task.category, language: task.language },
        buildGenerateOptions(key),
        appSettings.model,
        appSettings.apiKey,
      );
      const next = { ...edits, [key]: result[key] };
      setEdits(next);
      persistedSnapshotRef.current = JSON.stringify(next);
      updateTask(task.id, listingEditsToTaskPatch(next));
    } catch (err) {
      console.error('[sectionRegenerate]', err);
      setRewriteError(parseLLMError(err));
    } finally {
      setSectionLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const handleTranslate = async () => {
    if (!appSettings.apiKey) {
      setTranslateError('请先在「系统设置 → 大模型配置」中填写 API 密钥。');
      return;
    }
    setTranslationLoading(true);
    setTranslateError(null);
    try {
      const toLang = appSettings.translationLang;
      const fromLang = task.language;
      const result = await translateContent(
        { title: edits.title, bullets: edits.bullets, description: edits.description },
        fromLang,
        toLang,
        appSettings.model,
        appSettings.apiKey,
      );
      // Merge so zh / en translations coexist (503 on one language should not wipe the other)
      const prev = task.translations ?? {};
      const newMap: TranslationMap = {
        title:       { ...prev.title, [toLang]: result.title },
        bullets:     { ...prev.bullets, [toLang]: result.bullets },
        description: { ...prev.description, [toLang]: result.description },
      };
      setTranslationMap(newMap);
      // Persist to Firestore so translations survive page reload
      updateTask(task.id, { translations: newMap });
    } catch (err) {
      console.error('[translate]', err);
      setTranslateError(parseLLMError(err));
    } finally {
      setTranslationLoading(false);
    }
  };

  // Detect which sections have been modified vs. the original fetched content
  const originalEdits = taskToEdits(task);
  const isModifiedMap: Record<ContentKey, boolean> = {
    title:       edits.title.trim()   !== originalEdits.title.trim(),
    bullets:     edits.bullets.trim() !== originalEdits.bullets.trim(),
    description: edits.description.trim() !== originalEdits.description.trim(),
  };

  const targetLangObj = LANGUAGES.find((l) => l.code === task.language);
  const langLabel = appSettings.systemLanguage === 'zh' ? targetLangObj?.zhLabel : targetLangObj?.label;

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F9FC] relative">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-bold text-slate-800 tracking-tight mr-2">{task.asin}</h2>
            {isArchived && (
              <Badge color="green" className="ml-1">
                <Archive size={12} className="mr-1 inline" /> {t('status.archived')}
              </Badge>
            )}
            {langLabel && (
              <Badge color="blue">{langLabel}</Badge>
            )}
          </div>
          <p className="text-xs text-slate-500">{task.name || task.url}</p>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2 text-sm font-medium mr-2">
            <span className={task.status === 'review' ? 'text-[#0052D9]' : 'text-slate-800'}>{t('status.review')}</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className={task.status === 'archived' ? 'text-[#0052D9]' : 'text-slate-400'}>{t('status.archived')}</span>
          </div>

          <div className="h-6 w-px bg-slate-200 mx-1" />

          {task.status === 'review' && (
            <button
              onClick={handleApprove}
              className="bg-green-600 text-white px-5 py-2 rounded-md text-sm font-medium hover:bg-green-700 transition flex items-center gap-2 shadow-sm"
            >
              {globalLoading ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> {t('btn.approve')}</>}
            </button>
          )}
          {isArchived && (
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
        <SourceDataPanel task={task} onUpdate={(updates) => updateTask(task.id, updates)} />

        <div className="flex-1 bg-[#F7F9FC] flex flex-col h-full relative">
          <GenSettingsBar
            task={task}
            personas={personas}
            categories={categories}
            appSettings={appSettings}
            globalLoading={globalLoading}
            translationLoading={translationLoading}
            isArchived={isArchived}
            onCategoryChange={(cat) => updateTask(task.id, { category: cat })}
            onPersonaAdd={(pid) => updateTask(task.id, { personaIds: [...(task.personaIds ?? []), pid] })}
            onPersonaRemove={(pid) => updateTask(task.id, { personaIds: (task.personaIds ?? []).filter((id) => id !== pid) })}
            onGlobalRegenerate={handleGlobalRegenerate}
            onTranslationLangChange={(lang) => setAppSettings({ translationLang: lang })}
            onTranslate={handleTranslate}
            onReferenceAsinAdd={handleReferenceAsinAdd}
            onReferenceAsinRemove={handleReferenceAsinRemove}
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
                    onClick={() => { setTranslateError(null); setRewriteError(null); }}
                    className="shrink-0 text-red-400 hover:text-red-600"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}

              <EvaluationReport report={MOCK_EVALUATION} />

              {(['title', 'bullets', 'description'] as ContentKey[]).map((key) => (
                <EditorSection
                  key={key}
                  title={t(`section.${key === 'description' ? 'desc' : key}`)}
                  dataKey={key}
                  metadata={buildEditorSectionMetadata(key, task, personas, rules, appSettings.systemLanguage)}
                  baselineValue={originalEdits[key]}
                  value={edits[key]}
                  translationMap={translationMap}
                  targetLanguage={task.language}
                  translationLang={appSettings.translationLang}
                  systemLanguage={appSettings.systemLanguage}
                  isArchived={isArchived}
                  isRegenerating={sectionLoading[key]}
                  translationLoading={translationLoading}
                  isModified={isModifiedMap[key]}
                  onChange={(val) => setEdits((prev) => ({ ...prev, [key]: val }))}
                  onRegenerate={handleSectionRegenerate}
                />
              ))}

              {/* Specs / Images / A+ analysis */}
              <MediaAnalysisPanel task={task} appSettings={appSettings} rules={rules} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
