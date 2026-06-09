import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, User, X, RefreshCw, Languages, Loader2, ListChecks, ChevronDown } from 'lucide-react';
import type { Task, Persona, AppSettings, CategoryLabelMap, LanguageCode } from '@/types';
import { LANGUAGES } from '@/constants';
import { localizeSystemText } from '@/lib/systemTextI18n';

interface GenSettingsBarProps {
  task: Task;
  personas: Persona[];
  categories: string[];
  categoryLabels: CategoryLabelMap;
  appSettings: AppSettings;
  globalLoading: boolean;
  translationLoading: boolean;
  isArchived: boolean;
  systemLanguage: AppSettings['systemLanguage'];
  onModelKeyChange: (model: string) => void;
  onCategoryChange: (category: string) => void;
  onPersonaAdd: (personaId: string) => void;
  onPersonaRemove: (personaId: string) => void;
  onGlobalRegenerate: () => void;
  onTranslationLangChange: (lang: LanguageCode) => void;
  onTranslate: () => void;
  /** Listing rule checkboxes — only checked rules participate in AI rewrite. */
  ruleOptions: { key: string; name: string }[];
  selectedRuleKeys: string[];
  onToggleRule: (key: string) => void;
  onSelectAllRules: () => void;
  onClearRules: () => void;
}

export function GenSettingsBar({
  task,
  personas,
  categories,
  categoryLabels,
  appSettings,
  globalLoading,
  translationLoading,
  isArchived,
  systemLanguage,
  onModelKeyChange,
  onCategoryChange,
  onPersonaAdd,
  onPersonaRemove,
  onGlobalRegenerate,
  onTranslationLangChange,
  onTranslate,
  ruleOptions,
  selectedRuleKeys,
  onToggleRule,
  onSelectAllRules,
  onClearRules,
}: GenSettingsBarProps) {
  const { t } = useTranslation();
  const [rulesOpen, setRulesOpen] = useState(false);

  const availablePersonas = personas.filter((p) => !(task.personaIds ?? []).includes(p.id));
  const displayCategoryName = (value: string): string =>
    categoryLabels[value]?.[systemLanguage] || value;

  return (
    <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 shadow-[0_4px_6px_-1px_rgb(0,0,0,0.02)]">
      {/* Left: label + category + personas */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-[#0052D9]" />
          <h2 className="font-semibold text-slate-800 text-sm">{t('ws.genSettings')}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <input
            value={task.modelKey ?? ''}
            onChange={(e) => onModelKeyChange(e.target.value)}
            disabled={isArchived}
            placeholder={t('ws.modelPlaceholder')}
            className="w-40 border border-slate-200 rounded px-2 py-1.5 bg-white text-slate-700 outline-none focus:border-blue-400 disabled:opacity-60"
            title={t('ws.modelLabel')}
          />

          {/* Category selector */}
          <select
            value={task.category}
            onChange={(e) => onCategoryChange(e.target.value)}
            disabled={isArchived}
            className="border border-slate-200 rounded px-2 py-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 disabled:opacity-60 cursor-pointer"
          >
            {categories.map((c) => <option key={c} value={c}>{displayCategoryName(c)}</option>)}
          </select>

          {/* Listing rule picker — only checked rules participate in AI rewrite */}
          {!isArchived && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setRulesOpen((v) => !v)}
                className="flex items-center gap-1 border border-slate-200 rounded px-2 py-1.5 bg-slate-50 text-slate-700 outline-none hover:border-blue-400 cursor-pointer"
                title={t('ws.rulesPickHint')}
              >
                <ListChecks size={13} className="text-[#0052D9]" />
                {t('ws.rulesPick')}
                <span className="text-slate-400">({selectedRuleKeys.length}/{ruleOptions.length})</span>
                <ChevronDown size={12} className={`transition-transform ${rulesOpen ? 'rotate-180' : ''}`} />
              </button>

              {rulesOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setRulesOpen(false)} />
                  <div className="absolute left-0 top-full mt-1 z-40 w-72 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{t('ws.rulesPickHint')}</p>
                    {ruleOptions.length === 0 ? (
                      <p className="text-xs text-slate-400 py-2">{t('ws.noRulesAvailable')}</p>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-slate-100">
                          <button
                            type="button"
                            onClick={onSelectAllRules}
                            className="px-2 py-0.5 text-[11px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            {t('ws.selectAll')}
                          </button>
                          <button
                            type="button"
                            onClick={onClearRules}
                            className="px-2 py-0.5 text-[11px] rounded border border-slate-200 text-slate-600 hover:bg-slate-50"
                          >
                            {t('ws.clearAll')}
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {ruleOptions.map((opt) => (
                            <label
                              key={opt.key}
                              className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1 py-1"
                            >
                              <input
                                type="checkbox"
                                checked={selectedRuleKeys.includes(opt.key)}
                                onChange={() => onToggleRule(opt.key)}
                                className="mt-0.5 accent-[#0052D9]"
                              />
                              <span className="leading-snug">{opt.name}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Persona tags */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(task.personaIds ?? []).map((pid) => {
              const p = personas.find((x) => x.id === pid);
              if (!p) return null;
              return (
                <span
                  key={pid}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-purple-50 text-purple-700 border border-purple-200 text-xs"
                >
                  <User size={10} /> {localizeSystemText(p.name, p.nameI18n, systemLanguage)}
                  {!isArchived && (
                    <X
                      size={12}
                      className="cursor-pointer hover:text-purple-900 ml-0.5"
                      onClick={() => onPersonaRemove(pid)}
                    />
                  )}
                </span>
              );
            })}
            {(!task.personaIds || task.personaIds.length < 5) && !isArchived && availablePersonas.length > 0 && (
              <select
                value=""
                onChange={(e) => { if (e.target.value) onPersonaAdd(e.target.value); }}
                className="border border-dashed border-slate-300 rounded px-2 py-1 bg-white text-slate-500 outline-none focus:border-purple-400 cursor-pointer hover:bg-slate-50 text-xs"
              >
                <option value="" disabled>+ {t('modal.add')}</option>
                {availablePersonas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {localizeSystemText(p.name, p.nameI18n, systemLanguage)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Right: global rewrite + global translate + lang toggle */}
      <div className="flex items-center gap-2">
        {!isArchived && (
          <>
            <button
              onClick={onGlobalRegenerate}
              disabled={globalLoading}
              className="px-3 py-1.5 bg-blue-50 text-[#0052D9] hover:bg-blue-100 border border-blue-200 rounded font-medium transition flex items-center gap-1.5 disabled:opacity-50 shrink-0 text-xs"
            >
              <RefreshCw size={12} className={globalLoading ? 'animate-spin' : ''} />
              {t('ws.globalRegen')}
            </button>

            <button
              onClick={onTranslate}
              disabled={translationLoading || globalLoading}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded font-medium transition flex items-center gap-1.5 disabled:opacity-50 shrink-0 text-xs"
            >
              {translationLoading
                ? <Loader2 size={12} className="animate-spin" />
                : <Languages size={12} />}
              {t('ws.globalTranslate')}
            </button>
          </>
        )}

        <div className="h-4 w-px bg-slate-200 mx-1" />

        {/* Translation language toggle: zh / en + the target country language from settings */}
        <div className="flex items-center gap-1">
          {Array.from(new Set<LanguageCode>(['zh', 'en', appSettings.targetLanguage])).map((lang) => {
            const langObj = LANGUAGES.find((l) => l.code === lang);
            const label   = appSettings.systemLanguage === 'cn' ? langObj?.zhLabel : langObj?.label;
            return (
              <button
                key={lang}
                onClick={() => onTranslationLangChange(lang)}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-all border ${
                  appSettings.translationLang === lang
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-indigo-300 hover:text-indigo-600'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
