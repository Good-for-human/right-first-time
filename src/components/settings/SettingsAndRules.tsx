import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, Save, Loader2, AlertCircle } from 'lucide-react';
import { LLMConfig } from './LLMConfig';
import { TinyfishConfig } from './TinyfishConfig';
import { PersonaLibrary } from './PersonaLibrary';
import { CategoryRulesLibrary } from './CategoryRulesLibrary';
import type { AppSettings, Persona, Rule, Task } from '@/types';
import { LANGUAGES } from '@/constants';

interface SettingsAndRulesProps {
  appSettings: AppSettings;
  setAppSettings: (partial: Partial<AppSettings>) => void;
  /** Explicit save — full document to Firestore + finalize key flags */
  persistAppSettings: () => Promise<void>;
  categories: string[];
  rules: Rule[];
  personas: Persona[];
  tasks: Task[];
  onAddCategory: () => void;
  onDeleteCategory: (name: string) => void;
  onAddRule: (type: Rule['type']) => void;
  onEditRule: (rule: Rule) => void;
  onDeleteRule: (rule: Rule) => void;
  onAddPersona: () => void;
  onEditPersona: (persona: Persona) => void;
  onDeletePersona: (persona: Persona) => void;
}

export function SettingsAndRules({
  appSettings,
  setAppSettings,
  persistAppSettings,
  categories,
  rules,
  personas,
  tasks,
  onAddCategory,
  onDeleteCategory,
  onAddRule,
  onEditRule,
  onDeleteRule,
  onAddPersona,
  onEditPersona,
  onDeletePersona,
}: SettingsAndRulesProps) {
  const { t, i18n } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const archivedTasks = tasks.filter((task) => task.status === 'archived');

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await persistAppSettings();
      i18n.changeLanguage(appSettings.systemLanguage);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`${t('global.saveFailed')}: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7F9FC]">
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-4xl mx-auto space-y-8 pb-10">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{t('set.title')}</h2>
            <p className="text-slate-500 text-sm mt-1">{t('set.desc')}</p>
          </div>

          {/* Language settings */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                <Globe size={18} className="text-[#0052D9]" /> {t('set.lang')}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('set.sysLang')}</label>
                <select
                  value={appSettings.systemLanguage}
                  onChange={(e) => setAppSettings({ systemLanguage: e.target.value as 'zh' | 'en' })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
                >
                  <option value="zh">简体中文 (Chinese)</option>
                  <option value="en">English (英文)</option>
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('set.targetLang')}</label>
                <select
                  value={appSettings.targetLanguage}
                  onChange={(e) => setAppSettings({ targetLanguage: e.target.value as AppSettings['targetLanguage'] })}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
                >
                  {LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {appSettings.systemLanguage === 'zh' ? lang.zhLabel : lang.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1.5">{t('set.targetLangDesc')}</p>
              </div>
            </div>
          </div>

          <LLMConfig appSettings={appSettings} onChange={setAppSettings} />
          <TinyfishConfig appSettings={appSettings} onChange={setAppSettings} />

          <PersonaLibrary
            personas={personas}
            onAdd={onAddPersona}
            onEdit={onEditPersona}
            onDelete={onDeletePersona}
          />

          <CategoryRulesLibrary
            categories={categories}
            rules={rules}
            archivedTasks={archivedTasks}
            onAddCategory={onAddCategory}
            onDeleteCategory={onDeleteCategory}
            onAddRule={onAddRule}
            onEditRule={onEditRule}
            onDeleteRule={onDeleteRule}
          />
        </div>
      </div>

      {/* Save bar */}
      <div className="bg-white border-t border-slate-200 px-8 py-4 flex flex-col gap-3 shrink-0 shadow-[0_-4px_6px_-1px_rgb(0,0,0,0.05)] z-10 relative">
        {saveError && (
          <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{saveError}</span>
          </div>
        )}
        <div className="flex justify-end items-center">
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-6 py-2.5 bg-[#0052D9] text-white text-sm font-medium rounded-lg hover:bg-blue-800 transition flex items-center gap-2 shadow-sm disabled:opacity-60 disabled:pointer-events-none"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Save size={16} />}
            {isSaving ? t('global.saving') : saved ? t('global.saved') : t('global.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
