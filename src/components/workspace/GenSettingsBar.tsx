import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SlidersHorizontal, User, X, RefreshCw, Languages, Loader2, Bookmark } from 'lucide-react';
import type { Task, Persona, AppSettings } from '@/types';
import { LANGUAGES } from '@/constants';

const MAX_REF_ASINS = 3;

interface GenSettingsBarProps {
  task: Task;
  personas: Persona[];
  categories: string[];
  appSettings: AppSettings;
  globalLoading: boolean;
  translationLoading: boolean;
  isArchived: boolean;
  onCategoryChange: (category: string) => void;
  onPersonaAdd: (personaId: string) => void;
  onPersonaRemove: (personaId: string) => void;
  onGlobalRegenerate: () => void;
  onTranslationLangChange: (lang: 'en' | 'zh') => void;
  onTranslate: () => void;
  onReferenceAsinAdd: (asin: string) => void;
  onReferenceAsinRemove: (asin: string) => void;
}

export function GenSettingsBar({
  task,
  personas,
  categories,
  appSettings,
  globalLoading,
  translationLoading,
  isArchived,
  onCategoryChange,
  onPersonaAdd,
  onPersonaRemove,
  onGlobalRegenerate,
  onTranslationLangChange,
  onTranslate,
  onReferenceAsinAdd,
  onReferenceAsinRemove,
}: GenSettingsBarProps) {
  const { t } = useTranslation();
  const asinInputRef = useRef<HTMLInputElement>(null);

  const availablePersonas = personas.filter((p) => !(task.personaIds ?? []).includes(p.id));
  const referenceAsins = task.referenceAsins ?? [];

  const handleAsinKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const val = (e.currentTarget.value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (val && !referenceAsins.includes(val)) {
        onReferenceAsinAdd(val);
      }
      e.currentTarget.value = '';
    }
  };

  return (
    <div className="px-5 py-3 border-b border-slate-200 bg-white flex flex-col gap-2.5 shrink-0 shadow-[0_4px_6px_-1px_rgb(0,0,0,0.02)]">
      {/* ── Row 1: category / persona / global rewrite / translate ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={16} className="text-[#0052D9]" />
            <h2 className="font-semibold text-slate-800 text-sm">{t('ws.genSettings')}</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Category selector */}
            <select
              value={task.category}
              onChange={(e) => onCategoryChange(e.target.value)}
              disabled={isArchived}
              className="border border-slate-200 rounded px-2 py-1.5 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 disabled:opacity-60 cursor-pointer"
            >
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>

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
                    <User size={10} /> {p.name}
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

              {/* Add persona dropdown */}
              {(!task.personaIds || task.personaIds.length < 5) && !isArchived && availablePersonas.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) onPersonaAdd(e.target.value); }}
                  className="border border-dashed border-slate-300 rounded px-2 py-1 bg-white text-slate-500 outline-none focus:border-purple-400 cursor-pointer hover:bg-slate-50 text-xs"
                >
                  <option value="" disabled>+ {t('modal.add')}</option>
                  {availablePersonas.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isArchived && (
            <button
              onClick={onGlobalRegenerate}
              disabled={globalLoading}
              className="px-3 py-1.5 bg-blue-50 text-[#0052D9] hover:bg-blue-100 border border-blue-200 rounded font-medium transition flex items-center gap-1.5 disabled:opacity-50 shrink-0 text-xs"
            >
              <RefreshCw size={12} className={globalLoading ? 'animate-spin' : ''} />
              {t('ws.globalRegen')}
            </button>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1" />

          {/* Translation language toggle + translate button */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-500 flex items-center gap-1 mr-1">
              <Languages size={12} /> {t('ws.translation')}:
            </span>
            {(['zh', 'en'] as const).map((lang) => {
              const langObj = LANGUAGES.find((l) => l.code === lang);
              const label   = appSettings.systemLanguage === 'zh' ? langObj?.zhLabel : langObj?.label;
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

            <button
              onClick={onTranslate}
              disabled={translationLoading || globalLoading}
              className="ml-1 px-3 py-1.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 rounded font-medium transition flex items-center gap-1.5 disabled:opacity-50 shrink-0 text-xs"
            >
              {translationLoading
                ? <><Loader2 size={12} className="animate-spin" /> 翻译中...</>
                : <><Languages size={12} /> 翻译</>
              }
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: Reference ASINs (max 3, highest AI priority) ── */}
      <div className="flex items-center gap-2 text-xs flex-wrap">
        <span className="flex items-center gap-1 text-[11px] text-amber-700 font-semibold shrink-0">
          <Bookmark size={12} className="text-amber-500" />
          {t('ws.refAsins')}
        </span>
        <span className="text-[10px] text-slate-400 shrink-0">AI 最高优先级 · 最多 3 个</span>

        {referenceAsins.map((asin) => (
          <span
            key={asin}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 font-mono text-[11px] shrink-0"
          >
            {asin}
            {!isArchived && (
              <X
                size={11}
                className="cursor-pointer hover:text-red-600 ml-0.5"
                onClick={() => onReferenceAsinRemove(asin)}
              />
            )}
          </span>
        ))}

        {referenceAsins.length < MAX_REF_ASINS && !isArchived && (
          <input
            ref={asinInputRef}
            type="text"
            placeholder={t('ws.refAsinAdd')}
            onKeyDown={handleAsinKeyDown}
            className="border border-dashed border-amber-300 rounded-md px-2 py-0.5 bg-amber-50/50 text-amber-900 placeholder-amber-400 outline-none focus:border-amber-500 text-[11px] font-mono w-36"
            autoComplete="off"
          />
        )}

        {referenceAsins.length > 0 && (
          <span className="text-[10px] text-amber-600 ml-auto">
            {t('ws.refAsinMax', { count: referenceAsins.length })}
          </span>
        )}
      </div>
    </div>
  );
}
