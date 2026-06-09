import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sidebar } from '@/components/layout/Sidebar';
import { Workspace } from '@/components/workspace/Workspace';
import { SharedLibraryWorkspace } from '@/components/workspace/SharedLibraryWorkspace';
import { SettingsAndRules } from '@/components/settings/SettingsAndRules';
import { CreateTaskModal } from '@/components/modals/CreateTaskModal';
import { PersonaModal } from '@/components/modals/PersonaModal';
import { RuleModal } from '@/components/modals/RuleModal';
import { DeleteConfirmModal } from '@/components/modals/DeleteConfirmModal';
import { AddCategoryModal } from '@/components/modals/AddCategoryModal';
import { AuthModal } from '@/components/auth/AuthModal';
import { UserGuideModal } from '@/components/modals/UserGuideModal';
import { useTaskStore } from '@/store/taskStore';
import { useRulesStore } from '@/store/rulesStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { useKeywordsStore } from '@/store/keywordsStore';
import { useFirestoreSync } from '@/lib/useFirestoreSync';
import { fsUpdateCurrentUserCountry } from '@/services/firestoreService';
import { translateSystemText } from '@/services/llm';
import { getLanguageForCountry } from '@/lib/countryLanguage';
import { resolveWorkspaceApiKey } from '@/lib/apiKeyResolver';
import { inferSystemLanguageFromText, localizeSystemText } from '@/lib/systemTextI18n';
import type { Persona, Rule, Task, ViewMode, BusinessCountryCode } from '@/types';

type ModalState =
  | { type: 'none' }
  | { type: 'createTask' }
  | { type: 'addPersona' }
  | { type: 'editPersona'; persona: Persona }
  | { type: 'deletePersona'; persona: Persona }
  | { type: 'addRule'; ruleType: Rule['type']; category: string }
  | { type: 'editRule'; rule: Rule }
  | { type: 'deleteRule'; rule: Rule }
  | { type: 'addCategory' }
  | { type: 'guide' }
  | { type: 'deleteCategory'; name: string };

export default function App() {
  const { t } = useTranslation();
  const { tasks, activeTaskId, isLoading, addTask, updateTask, removeTask, setActiveTaskId } = useTaskStore();
  const {
    categories,
    categoryLabels,
    rules,
    personas,
    addCategory,
    removeCategory,
    addRule,
    updateRule,
    removeRule,
    addPersona,
    updatePersona,
    removePersona,
    upsertCategoryLabel,
  } = useRulesStore();
  const { appSettings, setAppSettings, persistAppSettings } = useSettingsStore();
  const { user, profile, authLoading } = useAuthStore();
  const setProfile = useAuthStore((s) => s.setProfile);
  const {
    keywords,
    sharedKeywordLibrary,
    setKeywordSet,
    categoryRefAsins,
    addCategoryRefAsin,
    removeCategoryRefAsin,
  } = useKeywordsStore();

  // Bootstrap Auth listener + Firestore real-time sync
  useFirestoreSync();

  const [view, setView] = useState<ViewMode>('workspace');
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  // Tracks i18n backfill items already attempted in this session. Once an item is
  // attempted it is never retried automatically, so a translation that fails or does
  // not persist cannot re-trigger the effect into an unbounded LLM request loop.
  const i18nBackfillInFlightRef = useRef<Set<string>>(new Set());
  const categoryBackfillAttemptedRef = useRef<Set<string>>(new Set());

  const activeTask = tasks.find((t) => t.id === activeTaskId);
  const closeModal = () => setModal({ type: 'none' });
  const effectiveApiKey = resolveWorkspaceApiKey({
    manualKey: appSettings.apiKey,
    countryCode: profile?.countryCode,
  });

  const buildCreatorMeta = () => ({
    createdByUid: user?.uid,
    createdByEmail: user?.email?.trim().toLowerCase() ?? undefined,
    createdByCountry: profile?.countryCode ?? 'GLOBAL',
  });

  const buildRuleNameI18n = async (
    text: string,
    existing?: Rule,
  ): Promise<Rule['nameI18n']> => {
    const value = text.trim();
    const currentLang = appSettings.systemLanguage;
    const oppositeLang = currentLang === 'cn' ? 'en' : 'cn';
    const merged = { ...(existing?.nameI18n ?? {}) };
    merged[currentLang] = value;
    if (effectiveApiKey.trim()) {
      try {
        merged[oppositeLang] = await translateSystemText(
          value,
          currentLang,
          oppositeLang,
          appSettings.model,
          effectiveApiKey,
        );
      } catch {
        merged[oppositeLang] = merged[oppositeLang] ?? value;
      }
    } else {
      merged[oppositeLang] = merged[oppositeLang] ?? value;
    }
    return merged;
  };

  const buildPersonaI18n = async (
    payload: Pick<Persona, 'name' | 'description'>,
    existing?: Persona,
  ): Promise<Pick<Persona, 'nameI18n' | 'descriptionI18n'>> => {
    const name = payload.name.trim();
    const description = payload.description.trim();
    const currentLang = appSettings.systemLanguage;
    const oppositeLang = currentLang === 'cn' ? 'en' : 'cn';
    const nameI18n = { ...(existing?.nameI18n ?? {}), [currentLang]: name };
    const descriptionI18n = { ...(existing?.descriptionI18n ?? {}), [currentLang]: description };

    if (effectiveApiKey.trim()) {
      try {
        const [translatedName, translatedDescription] = await Promise.all([
          translateSystemText(name, currentLang, oppositeLang, appSettings.model, effectiveApiKey),
          translateSystemText(description, currentLang, oppositeLang, appSettings.model, effectiveApiKey),
        ]);
        nameI18n[oppositeLang] = translatedName || name;
        descriptionI18n[oppositeLang] = translatedDescription || description;
      } catch {
        nameI18n[oppositeLang] = nameI18n[oppositeLang] ?? name;
        descriptionI18n[oppositeLang] = descriptionI18n[oppositeLang] ?? description;
      }
    } else {
      nameI18n[oppositeLang] = nameI18n[oppositeLang] ?? name;
      descriptionI18n[oppositeLang] = descriptionI18n[oppositeLang] ?? description;
    }

    return { nameI18n, descriptionI18n };
  };

  const buildCategoryLabelI18n = async (value: string): Promise<{ en: string; cn: string }> => {
    const text = value.trim();
    if (!text) return { en: '', cn: '' };
    const sourceLang = inferSystemLanguageFromText(text);

    let en = sourceLang === 'en' ? text : '';
    let cn = sourceLang === 'cn' ? text : '';

    if (effectiveApiKey.trim()) {
      try {
        if (!en) {
          en = await translateSystemText(text, sourceLang, 'en', appSettings.model, effectiveApiKey);
        }
        if (!cn) {
          cn = await translateSystemText(text, sourceLang, 'cn', appSettings.model, effectiveApiKey);
        }
      } catch {
        en = en || text;
        cn = cn || text;
      }
    } else {
      en = en || text;
      cn = cn || text;
    }

    return { en, cn };
  };

  useEffect(() => {
    if (!effectiveApiKey.trim()) return;
    let cancelled = false;

    const runBackfill = async () => {
      for (const persona of personas) {
        const key = `persona:${persona.id}`;
        if (i18nBackfillInFlightRef.current.has(key)) continue;
        const currentNameMap = { ...(persona.nameI18n ?? {}) };
        const currentDescMap = { ...(persona.descriptionI18n ?? {}) };
        const hasAll =
          Boolean(currentNameMap.cn && currentNameMap.en) &&
          Boolean(currentDescMap.cn && currentDescMap.en);
        if (hasAll) continue;

        i18nBackfillInFlightRef.current.add(key);
        try {
          const nameSourceLang = (currentNameMap.cn ? 'cn' : currentNameMap.en ? 'en' : inferSystemLanguageFromText(persona.name));
          const descSourceLang = (currentDescMap.cn ? 'cn' : currentDescMap.en ? 'en' : inferSystemLanguageFromText(persona.description));
          const nextNameMap = {
            ...currentNameMap,
            [nameSourceLang]: currentNameMap[nameSourceLang] ?? persona.name,
          };
          const nextDescMap = {
            ...currentDescMap,
            [descSourceLang]: currentDescMap[descSourceLang] ?? persona.description,
          };

          const needNameEn = !nextNameMap.en;
          const needNameCn = !nextNameMap.cn;
          const needDescEn = !nextDescMap.en;
          const needDescCn = !nextDescMap.cn;

          if (needNameEn) {
            nextNameMap.en = await translateSystemText(
              nextNameMap[nameSourceLang] ?? persona.name,
              nameSourceLang,
              'en',
              appSettings.model,
              effectiveApiKey,
            );
          }
          if (needNameCn) {
            nextNameMap.cn = await translateSystemText(
              nextNameMap[nameSourceLang] ?? persona.name,
              nameSourceLang,
              'cn',
              appSettings.model,
              effectiveApiKey,
            );
          }
          if (needDescEn) {
            nextDescMap.en = await translateSystemText(
              nextDescMap[descSourceLang] ?? persona.description,
              descSourceLang,
              'en',
              appSettings.model,
              effectiveApiKey,
            );
          }
          if (needDescCn) {
            nextDescMap.cn = await translateSystemText(
              nextDescMap[descSourceLang] ?? persona.description,
              descSourceLang,
              'cn',
              appSettings.model,
              effectiveApiKey,
            );
          }

          if (!cancelled) {
            updatePersona(persona.id, {
              nameI18n: nextNameMap,
              descriptionI18n: nextDescMap,
            });
          }
        } catch {
          // keep existing text if background backfill fails; do not retry (avoids
          // an unbounded retry loop that would keep hitting the LLM API).
        }
      }

      for (const rule of rules) {
        const key = `rule:${rule.id}`;
        if (i18nBackfillInFlightRef.current.has(key)) continue;
        const currentMap = { ...(rule.nameI18n ?? {}) };
        if (currentMap.cn && currentMap.en) continue;

        i18nBackfillInFlightRef.current.add(key);
        try {
          const sourceLang = (currentMap.cn ? 'cn' : currentMap.en ? 'en' : inferSystemLanguageFromText(rule.name));
          const sourceText = currentMap[sourceLang] ?? rule.name;
          const nextMap = { ...currentMap, [sourceLang]: sourceText };
          if (!nextMap.en) {
            nextMap.en = await translateSystemText(
              sourceText,
              sourceLang,
              'en',
              appSettings.model,
              effectiveApiKey,
            );
          }
          if (!nextMap.cn) {
            nextMap.cn = await translateSystemText(
              sourceText,
              sourceLang,
              'cn',
              appSettings.model,
              effectiveApiKey,
            );
          }
          if (!cancelled) {
            updateRule(rule.id, { nameI18n: nextMap });
          }
        } catch {
          // keep existing text if background backfill fails; do not retry (avoids
          // an unbounded retry loop that would keep hitting the LLM API).
        }
      }
    };

    void runBackfill();
    return () => {
      cancelled = true;
    };
  }, [
    effectiveApiKey,
    appSettings.model,
    personas,
    rules,
    updatePersona,
    updateRule,
  ]);

  useEffect(() => {
    if (categories.length === 0) return;
    let cancelled = false;

    const runCategoryBackfill = async () => {
      for (const category of categories) {
        const existing = categoryLabels[category];
        if (existing?.en && existing?.cn) continue;
        if (categoryBackfillAttemptedRef.current.has(category)) continue;
        categoryBackfillAttemptedRef.current.add(category);
        const translated = await buildCategoryLabelI18n(existing?.en || existing?.cn || category);
        if (cancelled) return;
        upsertCategoryLabel(category, {
          en: existing?.en || translated.en,
          cn: existing?.cn || translated.cn,
        });
      }
    };

    void runCategoryBackfill();
    return () => {
      cancelled = true;
    };
  }, [categories, categoryLabels, effectiveApiKey, appSettings.model, upsertCategoryLabel]);

  // ── 1. Checking auth state ───────────────────────────────────
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <img src="/logo.png" alt="logo" className="w-12 h-12 object-contain animate-pulse" />
          <p className="text-sm font-medium tracking-wide">{t('app.authChecking')}</p>
        </div>
      </div>
    );
  }

  // ── 2. Not logged in → show auth screen ─────────────────────
  if (!user) {
    return <AuthModal />;
  }

  // ── 3. Logged in but Firestore data still loading ────────────
  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F7F9FC]">
        <div className="flex flex-col items-center gap-4 text-slate-500">
          <img src="/logo.png" alt="logo" className="w-12 h-12 object-contain animate-pulse" />
          <p className="text-sm font-medium tracking-wide">{t('app.dataLoading')}</p>
          <p className="text-xs text-slate-400">{user.email}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-[#F7F9FC] font-sans text-slate-900 overflow-hidden">
      <Sidebar
        tasks={tasks}
        activeTaskId={activeTaskId}
        view={view}
        setActiveTaskId={setActiveTaskId}
        setView={setView}
        onNewTask={() => setModal({ type: 'createTask' })}
        onOpenGuide={() => setModal({ type: 'guide' })}
        onDeleteTask={(id) => removeTask(id)}
        onToggleBenchmark={(id, val) => updateTask(id, { isBenchmark: val })}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {view === 'workspace' ? (
          <Workspace
            task={activeTask}
            updateTask={updateTask}
            categories={categories}
            categoryLabels={categoryLabels}
            personas={personas}
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            rules={rules}
            categoryKeywords={activeTask ? keywords[activeTask.category] : undefined}
            categoryRefAsins={activeTask ? (categoryRefAsins[activeTask.category] ?? []) : []}
          />
        ) : view === 'sharedLibrary' ? (
          <SharedLibraryWorkspace
            countryCode={profile && profile.countryCode !== 'GLOBAL'
              ? (profile.countryCode as BusinessCountryCode)
              : null}
            categories={categories}
            onOpenTask={(taskId) => {
              setActiveTaskId(taskId);
              setView('workspace');
            }}
          />
        ) : (
          <SettingsAndRules
            appSettings={appSettings}
            setAppSettings={setAppSettings}
            persistAppSettings={persistAppSettings}
            categories={categories}
            categoryLabels={categoryLabels}
            rules={rules}
            personas={personas}
            tasks={tasks}
            onAddCategory={() => setModal({ type: 'addCategory' })}
            onDeleteCategory={(name) => setModal({ type: 'deleteCategory', name })}
            onAddRule={(ruleType, category) => setModal({ type: 'addRule', ruleType, category })}
            onEditRule={(rule) => setModal({ type: 'editRule', rule })}
            onDeleteRule={(rule) => setModal({ type: 'deleteRule', rule })}
            onAddPersona={() => setModal({ type: 'addPersona' })}
            onEditPersona={(persona) => setModal({ type: 'editPersona', persona })}
            onDeletePersona={(persona) => setModal({ type: 'deletePersona', persona })}
            keywords={keywords}
            sharedKeywordLibrary={sharedKeywordLibrary}
            onSetKeywords={setKeywordSet}
            categoryRefAsins={categoryRefAsins}
            onAddCategoryRefAsin={addCategoryRefAsin}
            onRemoveCategoryRefAsin={removeCategoryRefAsin}
            profile={profile}
            onUpdateUserCountry={async (countryCode) => {
              const next = await fsUpdateCurrentUserCountry(countryCode);
              setProfile(next);
            }}
          />
        )}
      </div>

      {/* === Modals === */}

      {modal.type === 'createTask' && (
        <CreateTaskModal
          categories={categories}
          categoryLabels={categoryLabels}
          systemLanguage={appSettings.systemLanguage}
          appSettings={appSettings}
          accountCountryCode={
            profile && profile.countryCode !== 'GLOBAL'
              ? (profile.countryCode as BusinessCountryCode)
              : null
          }
          onClose={closeModal}
          onCreate={(data, activateAfter = true) => {
            const userCountry = profile?.countryCode !== 'GLOBAL'
              ? (profile?.countryCode as BusinessCountryCode)
              : undefined;
            const newTask: Task = {
              ...data,
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              modelKey: data.modelKey?.trim() || data.name?.trim() || data.asin,
              countryCode: userCountry,
              language: userCountry ? getLanguageForCountry(userCountry) : data.language,
              createdAt: new Date().toISOString(),
            };
            addTask(newTask);
            if (activateAfter) {
              setActiveTaskId(newTask.id);
              setView('workspace');
            }
          }}
        />
      )}
      {modal.type === 'guide' && (
        <UserGuideModal onClose={closeModal} />
      )}

      {(modal.type === 'addPersona' || modal.type === 'editPersona') && (
        <PersonaModal
          existing={modal.type === 'editPersona' ? modal.persona : undefined}
          onClose={closeModal}
          appSettings={appSettings}
          systemLanguage={appSettings.systemLanguage}
          onSave={async (data) => {
            const localized = await buildPersonaI18n(
              data,
              modal.type === 'editPersona' ? modal.persona : undefined,
            );
            if (modal.type === 'editPersona') {
              updatePersona(modal.persona.id, { ...data, ...localized });
            } else {
              addPersona({ ...data, ...localized, ...buildCreatorMeta() });
            }
          }}
        />
      )}

      {modal.type === 'deletePersona' && (
        <DeleteConfirmModal
          name={localizeSystemText(
            modal.persona.name,
            modal.persona.nameI18n,
            appSettings.systemLanguage,
          )}
          onClose={closeModal}
          onConfirm={() => removePersona(modal.persona.id)}
        />
      )}

      {(modal.type === 'addRule' || modal.type === 'editRule') && (
        <RuleModal
          type={modal.type === 'addRule' ? modal.ruleType : modal.rule.type}
          existing={modal.type === 'editRule' ? modal.rule : undefined}
          archivedTasks={tasks.filter((t) => t.status === 'archived')}
          category={modal.type === 'editRule' ? modal.rule.category : modal.category}
          appSettings={appSettings}
          onClose={closeModal}
          systemLanguage={appSettings.systemLanguage}
          onSave={async (data) => {
            const nameI18n = await buildRuleNameI18n(
              data.name,
              modal.type === 'editRule' ? modal.rule : undefined,
            );
            if (modal.type === 'editRule') {
              updateRule(modal.rule.id, { ...data, nameI18n });
            } else {
              addRule({ ...data, active: true, nameI18n, ...buildCreatorMeta() });
            }
          }}
        />
      )}

      {modal.type === 'deleteRule' && (
        <DeleteConfirmModal
          name={localizeSystemText(
            modal.rule.name,
            modal.rule.nameI18n,
            appSettings.systemLanguage,
          )}
          onClose={closeModal}
          onConfirm={() => removeRule(modal.rule.id)}
        />
      )}

      {modal.type === 'addCategory' && (
        <AddCategoryModal
          onClose={closeModal}
          onSave={async (name) => {
            const labels = await buildCategoryLabelI18n(name);
            addCategory(name);
            upsertCategoryLabel(name, labels);
          }}
        />
      )}

      {modal.type === 'deleteCategory' && (
        <DeleteConfirmModal
          name={modal.name}
          onClose={closeModal}
          onConfirm={() => {
            removeCategory(modal.name);
          }}
        />
      )}
    </div>
  );
}
