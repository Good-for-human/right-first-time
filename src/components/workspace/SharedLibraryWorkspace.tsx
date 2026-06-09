import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Plus, CheckCircle2, Library, Globe2, Info, Check, FileText, Users, KeyRound } from 'lucide-react';
import { useWorkspaceLibraryStore } from '@/store/workspaceLibraryStore';
import { useTaskStore } from '@/store/taskStore';
import { useRulesStore } from '@/store/rulesStore';
import { useKeywordsStore } from '@/store/keywordsStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useAuthStore } from '@/store/authStore';
import { addSharedItemToCountryWorkspace } from '@/services/firestoreService';
import { getLanguageForCountry } from '@/lib/countryLanguage';
import { DEFAULT_CATEGORY } from '@/lib/categoryTaxonomy';
import { localizeSystemText } from '@/lib/systemTextI18n';
import type { BusinessCountryCode, CountryCode, SharedLibraryItem, Task, Rule, Persona } from '@/types';

interface SharedLibraryWorkspaceProps {
  countryCode: BusinessCountryCode | null;
  categories: string[];
  onOpenTask?: (taskId: string) => void;
}

interface SharedModelGroup {
  modelKey: string;
  byCountry: Partial<Record<BusinessCountryCode, SharedLibraryItem>>;
}

type SharedTab = 'listings' | 'rules' | 'personas' | 'keywords';

function isTaskFromModel(tasks: Task[], modelKey: string, countryCode: BusinessCountryCode): boolean {
  return tasks.some((t) => t.modelKey === modelKey && t.countryCode === countryCode);
}

export function SharedLibraryWorkspace({ countryCode, categories, onOpenTask }: SharedLibraryWorkspaceProps) {
  const { t } = useTranslation();
  const sharedLibrary = useWorkspaceLibraryStore((s) => s.sharedLibrary);
  const countryWorkspaceItems = useWorkspaceLibraryStore((s) => s.countryWorkspaceItems);
  const addTask = useTaskStore((s) => s.addTask);
  const setActiveTaskId = useTaskStore((s) => s.setActiveTaskId);
  const tasks = useTaskStore((s) => s.tasks);
  const rules = useRulesStore((s) => s.rules);
  const personas = useRulesStore((s) => s.personas);
  const addRule = useRulesStore((s) => s.addRule);
  const addPersona = useRulesStore((s) => s.addPersona);
  const sharedKeywordLibrary = useKeywordsStore((s) => s.sharedKeywordLibrary);
  const localKeywords = useKeywordsStore((s) => s.keywords);
  const setKeywordSet = useKeywordsStore((s) => s.setKeywordSet);
  const addCategoryRefAsin = useKeywordsStore((s) => s.addCategoryRefAsin);
  const systemLanguage = useSettingsStore((s) => s.appSettings.systemLanguage);
  const user = useAuthStore((s) => s.user);

  const [activeTab, setActiveTab] = useState<SharedTab>('listings');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedCountryByModel, setSelectedCountryByModel] = useState<Partial<Record<string, BusinessCountryCode>>>({});
  const [sourceFilterByTab, setSourceFilterByTab] = useState<Partial<Record<SharedTab, CountryCode | 'ALL'>>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'info'; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(id);
  }, [toast]);

  const canImport = Boolean(countryCode);
  const existingModelKeys = useMemo(
    () => new Set(countryWorkspaceItems.map((i) => i.modelKey)),
    [countryWorkspaceItems],
  );

  const activeSourceFilter = sourceFilterByTab[activeTab] ?? 'ALL';
  const getRuleCountry = (rule: Rule): CountryCode => (rule.createdByCountry ?? 'GLOBAL') as CountryCode;
  const getPersonaCountry = (persona: Persona): CountryCode => (persona.createdByCountry ?? 'GLOBAL') as CountryCode;
  const sourceCountriesByTab = useMemo(() => {
    const listingSources = Array.from(new Set(sharedLibrary.map((item) => item.sourceCountry))) as CountryCode[];
    const ruleSources = Array.from(new Set(rules.map((rule) => getRuleCountry(rule)))) as CountryCode[];
    const personaSources = Array.from(new Set(personas.map((persona) => getPersonaCountry(persona)))) as CountryCode[];
    const keywordSources = Object.keys(sharedKeywordLibrary) as CountryCode[];
    const sorter = (a: CountryCode, b: CountryCode) => {
      if (a === 'GLOBAL') return -1;
      if (b === 'GLOBAL') return 1;
      return a.localeCompare(b);
    };
    return {
      listings: listingSources.sort(sorter),
      rules: ruleSources.sort(sorter),
      personas: personaSources.sort(sorter),
      keywords: keywordSources.sort(sorter),
    } satisfies Record<SharedTab, CountryCode[]>;
  }, [sharedLibrary, rules, personas, sharedKeywordLibrary]);
  const sourceOptions = useMemo(
    () => ['ALL', ...sourceCountriesByTab[activeTab]] as Array<CountryCode | 'ALL'>,
    [activeTab, sourceCountriesByTab],
  );

  const filteredListings = useMemo<SharedModelGroup[]>(() => {
    const q = search.trim().toLowerCase();
    const visibleListings = sharedLibrary.filter((item) =>
      activeSourceFilter === 'ALL' ? true : item.sourceCountry === activeSourceFilter,
    );
    const grouped = visibleListings.reduce<Record<string, SharedModelGroup>>((acc, item) => {
      if (!acc[item.modelKey]) {
        acc[item.modelKey] = { modelKey: item.modelKey, byCountry: {} };
      }
      acc[item.modelKey].byCountry[item.sourceCountry] = item;
      return acc;
    }, {});

    const groups = Object.values(grouped);
    if (!q) return groups;
    return groups.filter((group) => {
      const allItems = Object.values(group.byCountry);
      const haystack = [
        group.modelKey,
        ...allItems.flatMap((it) => [
          it?.summaryTitle ?? '',
          it?.sourceCountry ?? '',
          ...(it?.asinList ?? []),
          ...(it?.searchKeywords ?? []),
        ]),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [sharedLibrary, search, activeSourceFilter]);

  const filteredRules = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules
      .filter((rule) => (activeSourceFilter === 'ALL' ? true : getRuleCountry(rule) === activeSourceFilter))
      .filter((rule) => {
        if (!q) return true;
        const haystack = [
          localizeSystemText(rule.name, rule.nameI18n, systemLanguage),
          rule.category,
          rule.type,
          rule.targetSection,
          getRuleCountry(rule),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const ta = a.updatedAt ?? a.createdAt ?? '';
        const tb = b.updatedAt ?? b.createdAt ?? '';
        return tb.localeCompare(ta);
      });
  }, [rules, search, activeSourceFilter, systemLanguage]);

  const filteredPersonas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return personas
      .filter((persona) => (activeSourceFilter === 'ALL' ? true : getPersonaCountry(persona) === activeSourceFilter))
      .filter((persona) => {
        if (!q) return true;
        const haystack = [
          localizeSystemText(persona.name, persona.nameI18n, systemLanguage),
          localizeSystemText(persona.description, persona.descriptionI18n, systemLanguage),
          getPersonaCountry(persona),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => {
        const ta = a.updatedAt ?? a.createdAt ?? '';
        const tb = b.updatedAt ?? b.createdAt ?? '';
        return tb.localeCompare(ta);
      });
  }, [personas, search, activeSourceFilter, systemLanguage]);

  const filteredKeywordItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = Object.values(sharedKeywordLibrary).filter(
      (item): item is NonNullable<typeof item> => Boolean(item),
    );
    return items
      .filter((item) => (activeSourceFilter === 'ALL' ? true : item.sourceCountry === activeSourceFilter))
      .map((item) => {
        const categoryEntries = Object.entries(item.map ?? {}).filter(([category, set]) => {
          if (!q) return true;
          const haystack = [
            category,
            set.primary,
            ...(set.secondary ?? []),
            ...((item.refAsins ?? {})[category] ?? []),
          ].join(' ').toLowerCase();
          return haystack.includes(q);
        });
        if (q && categoryEntries.length === 0) return null;
        return { ...item, categoryEntries };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => (a.sourceCountry === b.sourceCountry ? 0 : a.sourceCountry.localeCompare(b.sourceCountry)));
  }, [sharedKeywordLibrary, search, activeSourceFilter]);

  const handleImport = async (item: SharedLibraryItem) => {
    if (!countryCode) return;
    setBusyId(item.id);
    setError(null);
    try {
      const existingTask = tasks.find((t) => t.modelKey === item.modelKey && t.countryCode === countryCode);
      if (existingTask) {
        setToast({ type: 'info', message: t('shared.alreadyInWorkspaceLocate', { country: countryCode }) });
        onOpenTask?.(existingTask.id);
        if (!onOpenTask) setActiveTaskId(existingTask.id);
        return;
      }

      await addSharedItemToCountryWorkspace({
        countryCode,
        sharedItem: item,
      });

      const alreadyHasTask = isTaskFromModel(tasks, item.modelKey, countryCode);
      if (!alreadyHasTask) {
        const createdTask: Task = {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          modelKey: item.modelKey,
          asin: item.asinList?.[0] ?? '',
          name: item.summaryTitle ?? item.modelKey,
          countryCode,
          fromSharedId: item.id,
          fromSharedCountry: item.sourceCountry,
          category: categories[0] ?? DEFAULT_CATEGORY,
          language: getLanguageForCountry(countryCode),
          personaIds: [],
          status: 'review',
          bullets: item.snapshot.bullets ?? [],
          description: item.snapshot.description ?? '',
          images: item.snapshot.media ?? [],
          createdAt: new Date().toISOString(),
        };
        addTask(createdTask);
        onOpenTask?.(createdTask.id);
        if (!onOpenTask) setActiveTaskId(createdTask.id);
        setToast({ type: 'success', message: t('shared.importedAndLocate', { country: countryCode }) });
      } else {
        setToast({ type: 'info', message: t('shared.alreadyInWorkspace', { country: countryCode }) });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
    } finally {
      setBusyId(null);
    }
  };

  // ── Import shared rules / personas / keywords into the local country ─────────
  // Each import creates an editable local copy (createdByCountry = current country).
  const creatorMeta = () => ({
    createdByUid: user?.uid,
    createdByEmail: user?.email?.trim().toLowerCase() ?? undefined,
    createdByCountry: (countryCode ?? 'GLOBAL') as CountryCode,
  });

  const ruleSignature = (rule: Pick<Rule, 'name' | 'category' | 'type' | 'targetSection'>) =>
    `${rule.category}|${rule.type}|${rule.targetSection}|${rule.name.trim().toLowerCase()}`;
  const localRuleSignatures = useMemo(
    () =>
      new Set(
        rules
          .filter((r) => getRuleCountry(r) === countryCode)
          .map((r) => ruleSignature(r)),
      ),
    [rules, countryCode],
  );
  const personaSignature = (p: Pick<Persona, 'name' | 'description'>) =>
    `${p.name.trim().toLowerCase()}|${(p.description ?? '').trim().toLowerCase()}`;
  const localPersonaSignatures = useMemo(
    () =>
      new Set(
        personas
          .filter((p) => getPersonaCountry(p) === countryCode)
          .map((p) => personaSignature(p)),
      ),
    [personas, countryCode],
  );

  const isRuleImported = (rule: Rule) =>
    getRuleCountry(rule) === countryCode || localRuleSignatures.has(ruleSignature(rule));
  const isPersonaImported = (persona: Persona) =>
    getPersonaCountry(persona) === countryCode || localPersonaSignatures.has(personaSignature(persona));

  const handleImportRule = (rule: Rule) => {
    if (!countryCode || isRuleImported(rule)) return;
    const busy = `rule-${getRuleCountry(rule)}-${rule.id}`;
    setBusyId(busy);
    setError(null);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = rule;
      void _id; void _ca; void _ua;
      addRule({ ...rest, active: true, ...creatorMeta() });
      setToast({ type: 'success', message: t('shared.ruleImported', { country: countryCode }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const handleImportPersona = (persona: Persona) => {
    if (!countryCode || isPersonaImported(persona)) return;
    const busy = `persona-${getPersonaCountry(persona)}-${persona.id}`;
    setBusyId(busy);
    setError(null);
    try {
      const { id: _id, createdAt: _ca, updatedAt: _ua, ...rest } = persona;
      void _id; void _ca; void _ua;
      addPersona({ ...rest, ...creatorMeta() });
      setToast({ type: 'success', message: t('shared.personaImported', { country: countryCode }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const isKeywordCategoryImported = (
    category: string,
    set: { primary: string; secondary?: string[] },
  ) => {
    const local = localKeywords[category];
    if (!local) return false;
    const samePrimary = (set.primary ?? '') === '' || local.primary === set.primary;
    const localSecondary = new Set(local.secondary ?? []);
    const coversSecondary = (set.secondary ?? []).every((kw) => localSecondary.has(kw));
    return samePrimary && coversSecondary;
  };

  const handleImportKeywordCategory = (
    sourceCountry: CountryCode,
    category: string,
    set: { primary: string; secondary?: string[] },
    refAsins: string[],
  ) => {
    if (!countryCode) return;
    const busy = `kw-${sourceCountry}-${category}`;
    setBusyId(busy);
    setError(null);
    try {
      const existing = localKeywords[category] ?? { primary: '', secondary: [] };
      const mergedSecondary = Array.from(
        new Set([...(existing.secondary ?? []), ...(set.secondary ?? [])]),
      );
      setKeywordSet(category, {
        primary: existing.primary || set.primary || '',
        secondary: mergedSecondary,
      });
      refAsins.forEach((asin) => addCategoryRefAsin(category, asin));
      setToast({ type: 'success', message: t('shared.keywordsImported', { country: countryCode }) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F9FC]">
      <div className="bg-white border-b border-slate-200 px-6 py-4 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <Library size={18} className="text-[#0052D9]" />
          {t('shared.title')}
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          {t('shared.desc')}
        </p>
      </div>

      <div className="p-6">
        <div className="max-w-5xl mx-auto space-y-4">
          {toast && (
            <div
              className={`rounded-lg px-4 py-2 text-sm border flex items-center gap-2 ${
                toast.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {toast.type === 'success' ? <Check size={14} /> : <Info size={14} />}
              {toast.message}
            </div>
          )}
          <div className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              {(['listings', 'rules', 'personas', 'keywords'] as SharedTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`px-3 py-1.5 text-xs rounded-full border transition inline-flex items-center gap-1.5 ${
                    activeTab === tab
                      ? 'bg-blue-50 border-blue-300 text-blue-700'
                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {tab === 'listings' && <Library size={12} />}
                  {tab === 'rules' && <FileText size={12} />}
                  {tab === 'personas' && <Users size={12} />}
                  {tab === 'keywords' && <KeyRound size={12} />}
                  {t(`shared.tab.${tab}`)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('shared.searchPlaceholder')}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none"
                />
              </div>
              <select
                value={activeSourceFilter}
                onChange={(e) =>
                  setSourceFilterByTab((prev) => ({
                    ...prev,
                    [activeTab]: e.target.value as CountryCode | 'ALL',
                  }))
                }
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
              >
                {sourceOptions.map((source) => (
                  <option key={source} value={source}>
                    {source === 'ALL' ? t('shared.sourceAll') : source}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2">
              {t('shared.importFailed', { error })}
            </div>
          )}

          {activeTab === 'listings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredListings.map((group) => {
              const countries = Object.keys(group.byCountry) as BusinessCountryCode[];
              const selectedCountry = selectedCountryByModel[group.modelKey] ?? countries[0];
              const item = group.byCountry[selectedCountry]!;
              if (!item) return null;
              const imported = countryCode ? existingModelKeys.has(group.modelKey) : false;
              const existingTask = countryCode ? tasks.find((t) => t.modelKey === group.modelKey && t.countryCode === countryCode) : undefined;
              const hasTask = Boolean(existingTask);
              const disabled = !canImport || busyId === item.id;
              return (
                <div key={group.modelKey} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 break-all">{group.modelKey}</h3>
                      <p className="text-xs text-slate-500 mt-1">{item.summaryTitle || t('shared.noTitleSnapshot')}</p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        {t('shared.sourceCountry')} <span className="font-medium text-slate-700">{item.sourceCountry}</span>
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[11px] bg-blue-50 text-blue-700 border border-blue-100">
                      {t('shared.sourceTag', { country: item.sourceCountry })}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {countries.map((code) => (
                      <button
                        key={`${group.modelKey}-${code}`}
                        type="button"
                        onClick={() => setSelectedCountryByModel((prev) => ({ ...prev, [group.modelKey]: code }))}
                        className={`px-2 py-0.5 rounded-full text-[11px] border transition ${
                          selectedCountry === code
                            ? 'bg-blue-100 border-blue-300 text-blue-700'
                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                      >
                        {code}
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded">
                      <Globe2 size={11} />
                      {item.asinList.join(', ') || '-'}
                    </span>
                  </div>

                  <div className="mt-4">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => handleImport(item)}
                      className="w-full px-3 py-2 rounded-lg text-sm font-medium border transition disabled:opacity-60 disabled:cursor-not-allowed bg-[#0052D9] text-white border-[#0052D9] hover:bg-blue-800"
                    >
                      {imported || hasTask ? (
                        <span className="inline-flex items-center gap-1.5">
                          <CheckCircle2 size={14} />
                          {t('shared.addedAndLocate')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Plus size={14} />
                          {t('shared.addToWorkspace')}
                        </span>
                      )}
                    </button>
                    {imported && !hasTask && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {t('shared.existingRefHint')}
                      </p>
                    )}
                  </div>
                </div>
              );
              })}
              {filteredListings.length === 0 && (
                <div className="col-span-full bg-white border border-dashed border-slate-200 rounded-xl p-8 text-sm text-slate-400 text-center">
                  {t('shared.empty.listings')}
                </div>
              )}
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-3">
              {filteredRules.map((rule) => {
                const imported = isRuleImported(rule);
                const busy = busyId === `rule-${getRuleCountry(rule)}-${rule.id}`;
                return (
                <div key={`${rule.createdByCountry ?? 'GLOBAL'}-${rule.id}`} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">
                        {localizeSystemText(rule.name, rule.nameI18n, systemLanguage)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {rule.category} · {rule.targetSection} · {rule.type}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-purple-50 text-purple-700 border border-purple-100">
                        {getRuleCountry(rule)}
                      </span>
                      {canImport && (
                        <button
                          type="button"
                          disabled={imported || busy}
                          onClick={() => handleImportRule(rule)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition disabled:cursor-not-allowed inline-flex items-center gap-1 bg-[#0052D9] text-white border-[#0052D9] hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
                        >
                          {imported ? (
                            <><CheckCircle2 size={12} /> {t('shared.addedToLocal')}</>
                          ) : (
                            <><Plus size={12} /> {t('shared.addToLocal')}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
              {filteredRules.length === 0 && (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-sm text-slate-400 text-center">
                  {t('shared.empty.rules')}
                </div>
              )}
            </div>
          )}

          {activeTab === 'personas' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredPersonas.map((persona) => {
                const imported = isPersonaImported(persona);
                const busy = busyId === `persona-${getPersonaCountry(persona)}-${persona.id}`;
                return (
                <div key={`${getPersonaCountry(persona)}-${persona.id}`} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {localizeSystemText(persona.name, persona.nameI18n, systemLanguage)}
                      </p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {localizeSystemText(persona.description, persona.descriptionI18n, systemLanguage)}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-purple-50 text-purple-700 border border-purple-100">
                        {getPersonaCountry(persona)}
                      </span>
                      {canImport && (
                        <button
                          type="button"
                          disabled={imported || busy}
                          onClick={() => handleImportPersona(persona)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition disabled:cursor-not-allowed inline-flex items-center gap-1 bg-[#0052D9] text-white border-[#0052D9] hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
                        >
                          {imported ? (
                            <><CheckCircle2 size={12} /> {t('shared.addedToLocal')}</>
                          ) : (
                            <><Plus size={12} /> {t('shared.addToLocal')}</>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                );
              })}
              {filteredPersonas.length === 0 && (
                <div className="col-span-full bg-white border border-dashed border-slate-200 rounded-xl p-8 text-sm text-slate-400 text-center">
                  {t('shared.empty.personas')}
                </div>
              )}
            </div>
          )}

          {activeTab === 'keywords' && (
            <div className="space-y-4">
              {filteredKeywordItems.map((item) => (
                <div key={item.sourceCountry} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-800">{t('shared.sourceTag', { country: item.sourceCountry })}</h3>
                    <span className="text-[11px] text-slate-500">{item.categoryEntries.length} categories</span>
                  </div>
                  <div className="space-y-2">
                    {item.categoryEntries.map(([category, set]) => {
                      const refAsins = item.refAsins?.[category] ?? [];
                      const imported = isKeywordCategoryImported(category, set);
                      const busy = busyId === `kw-${item.sourceCountry}-${category}`;
                      return (
                        <div key={`${item.sourceCountry}-${category}`} className="border border-slate-100 rounded-lg p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-slate-700">{category}</p>
                              <p className="text-xs text-slate-600 mt-1">
                                Primary: <span className="font-medium">{set.primary || '-'}</span>
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Secondary: {(set.secondary ?? []).length > 0 ? set.secondary.join(', ') : '-'}
                              </p>
                              <p className="text-xs text-slate-500 mt-1">
                                Ref ASIN: {refAsins.length > 0 ? refAsins.join(', ') : '-'}
                              </p>
                            </div>
                            {canImport && (
                              <button
                                type="button"
                                disabled={imported || busy}
                                onClick={() => handleImportKeywordCategory(item.sourceCountry, category, set, refAsins)}
                                className="px-2.5 py-1 rounded-lg text-[11px] font-medium border transition disabled:cursor-not-allowed inline-flex items-center gap-1 shrink-0 bg-[#0052D9] text-white border-[#0052D9] hover:bg-blue-800 disabled:bg-slate-100 disabled:text-slate-400 disabled:border-slate-200"
                              >
                                {imported ? (
                                  <><CheckCircle2 size={12} /> {t('shared.addedToLocal')}</>
                                ) : (
                                  <><Plus size={12} /> {t('shared.addToLocal')}</>
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {filteredKeywordItems.length === 0 && (
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-8 text-sm text-slate-400 text-center">
                  {t('shared.empty.keywords')}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
