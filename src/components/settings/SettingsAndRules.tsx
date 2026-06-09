import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, Check, Save, Loader2, AlertCircle } from 'lucide-react';
import { LLMConfig } from './LLMConfig';
import { TinyfishConfig } from './TinyfishConfig';
import { PersonaLibrary } from './PersonaLibrary';
import { CategoryRulesLibrary } from './CategoryRulesLibrary';
import type {
  AppSettings,
  Persona,
  Rule,
  Task,
  KeywordMap,
  CategoryLabelMap,
  KeywordSet,
  CategoryRefAsinMap,
  UserProfile,
  BusinessCountryCode,
  CountryCode,
  SharedKeywordLibraryItem,
} from '@/types';
import { LANGUAGES } from '@/constants';
import { toI18nLanguage } from '@/lib/systemLanguage';
import { fsAppendApiKeyAuditLog } from '@/services/firestoreService';

interface SettingsAndRulesProps {
  appSettings: AppSettings;
  setAppSettings: (partial: Partial<AppSettings>) => void;
  /** Explicit save — full document to Firestore + finalize key flags */
  persistAppSettings: () => Promise<void>;
  categories: string[];
  categoryLabels: CategoryLabelMap;
  rules: Rule[];
  personas: Persona[];
  tasks: Task[];
  onAddCategory: () => void;
  onDeleteCategory: (name: string) => void;
  onAddRule: (type: Rule['type'], category: string) => void;
  onEditRule: (rule: Rule) => void;
  onDeleteRule: (rule: Rule) => void;
  onAddPersona: () => void;
  onEditPersona: (persona: Persona) => void;
  onDeletePersona: (persona: Persona) => void;
  keywords?: KeywordMap;
  sharedKeywordLibrary?: Partial<Record<CountryCode, SharedKeywordLibraryItem>>;
  onSetKeywords?: (category: string, set: KeywordSet) => void;
  categoryRefAsins?: CategoryRefAsinMap;
  onAddCategoryRefAsin?: (category: string, asin: string) => void;
  onRemoveCategoryRefAsin?: (category: string, asin: string) => void;
  profile?: UserProfile | null;
  onUpdateUserCountry?: (countryCode: BusinessCountryCode) => Promise<void>;
}

export function SettingsAndRules({
  appSettings,
  setAppSettings,
  persistAppSettings,
  categories,
  categoryLabels,
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
  keywords,
  sharedKeywordLibrary,
  onSetKeywords,
  categoryRefAsins,
  onAddCategoryRefAsin,
  onRemoveCategoryRefAsin,
  profile,
  onUpdateUserCountry,
}: SettingsAndRulesProps) {
  const { t, i18n } = useTranslation();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showApiConfirm, setShowApiConfirm] = useState(false);
  const [apiConfirmInput, setApiConfirmInput] = useState('');
  const [countrySaving, setCountrySaving] = useState(false);
  const [countryCode, setCountryCode] = useState<BusinessCountryCode>((profile?.countryCode as BusinessCountryCode) ?? 'UK');
  const [showCountryConfirm, setShowCountryConfirm] = useState(false);
  const [countryConfirmInput, setCountryConfirmInput] = useState('');

  const COUNTRY_OPTIONS: BusinessCountryCode[] = ['UK', 'DE', 'IT', 'ES', 'FR', 'BE', 'NL', 'PL', 'SE'];

  useEffect(() => {
    if (profile?.role !== 'admin' && profile?.countryCode && profile.countryCode !== 'GLOBAL') {
      setCountryCode(profile.countryCode as BusinessCountryCode);
    }
  }, [profile?.countryCode, profile?.role]);

  const archivedTasks = tasks.filter((task) => task.status === 'archived');
  const localCountryCode =
    profile && profile.role !== 'admin' && profile.countryCode !== 'GLOBAL'
      ? (profile.countryCode as BusinessCountryCode)
      : null;
  const hasPendingApiKeyChange = Boolean(appSettings.apiKey.trim()) && !appSettings.isSaved;

  const maskApiKey = (raw: string): string => {
    const tRaw = raw.trim();
    if (!tRaw) return '***';
    return `***${tRaw.slice(-4)} (len:${tRaw.length})`;
  };

  const performSave = async (withApiAudit: boolean) => {
    setIsSaving(true);
    setSaveError(null);
    setSaved(false);
    try {
      await persistAppSettings();
      if (withApiAudit) {
        await fsAppendApiKeyAuditLog({
          model: appSettings.model,
          maskedKey: maskApiKey(appSettings.apiKey),
          actorEmail: profile?.email,
          actorCountry: profile?.countryCode,
        });
      }
      i18n.changeLanguage(toI18nLanguage(appSettings.systemLanguage));
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      setShowApiConfirm(false);
      setApiConfirmInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(`${t('global.saveFailed')}: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    if (hasPendingApiKeyChange) {
      setShowApiConfirm(true);
      setApiConfirmInput('');
      return;
    }
    await performSave(false);
  };

  const handleUpdateCountry = async () => {
    if (!onUpdateUserCountry) return;
    const currentCountry = profile?.countryCode as BusinessCountryCode | undefined;
    if (!currentCountry || currentCountry === countryCode) return;
    setCountrySaving(true);
    setSaveError(null);
    try {
      await onUpdateUserCountry(countryCode);
      setShowCountryConfirm(false);
      setCountryConfirmInput('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveError(t('account.updateCountryFailed', { error: msg }));
    } finally {
      setCountrySaving(false);
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
                  onChange={(e) => {
                    const nextLanguage = e.target.value as AppSettings['systemLanguage'];
                    setAppSettings({ systemLanguage: nextLanguage });
                    i18n.changeLanguage(toI18nLanguage(nextLanguage));
                  }}
                  className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
                >
                  <option value="cn">{t('set.systemLangCn')}</option>
                  <option value="en">{t('set.systemLangEn')}</option>
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
                      {appSettings.systemLanguage === 'cn' ? lang.zhLabel : lang.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1.5">{t('set.targetLangDesc')}</p>
              </div>
            </div>
          </div>

          {profile?.role !== 'admin' && onUpdateUserCountry && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-[15px] font-semibold text-slate-800 flex items-center gap-2">
                  <Globe size={18} className="text-[#0052D9]" /> {t('account.countryBinding')}
                </h3>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-[13px] font-medium text-slate-700 mb-1.5">{t('account.countryWorkspace')}</label>
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value as BusinessCountryCode)}
                    className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none bg-white"
                  >
                    {COUNTRY_OPTIONS.map((code) => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowCountryConfirm(true);
                    setCountryConfirmInput('');
                  }}
                  disabled={countrySaving || profile?.countryCode === countryCode}
                  className="h-[42px] px-5 bg-slate-800 text-white text-sm font-medium rounded-lg hover:bg-slate-900 transition disabled:opacity-60 self-end"
                >
                  {countrySaving ? t('account.updatingCountry') : t('account.updateCountry')}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1.5">{t('account.countryBindingDesc')}</p>
            </div>
          )}

          <LLMConfig appSettings={appSettings} onChange={setAppSettings} />
          <TinyfishConfig appSettings={appSettings} onChange={setAppSettings} />

          <PersonaLibrary
            systemLanguage={appSettings.systemLanguage}
            personas={personas}
            localCountryCode={localCountryCode}
            onAdd={onAddPersona}
            onEdit={onEditPersona}
            onDelete={onDeletePersona}
          />

          <CategoryRulesLibrary
            systemLanguage={appSettings.systemLanguage}
            categories={categories}
            categoryLabels={categoryLabels}
            rules={rules}
            archivedTasks={archivedTasks}
            onAddCategory={onAddCategory}
            onDeleteCategory={onDeleteCategory}
            onAddRule={onAddRule}
            onEditRule={onEditRule}
            onDeleteRule={onDeleteRule}
            keywords={keywords}
            sharedKeywordLibrary={sharedKeywordLibrary}
            onSetKeywords={onSetKeywords}
            categoryRefAsins={categoryRefAsins}
            onAddCategoryRefAsin={onAddCategoryRefAsin}
            onRemoveCategoryRefAsin={onRemoveCategoryRefAsin}
            localCountryCode={localCountryCode}
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

      {showCountryConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">{t('account.confirmSwitchTitle')}</h3>
              <p className="text-sm text-slate-500 mt-1">
                {t('account.confirmSwitchDesc', { country: countryCode })}
              </p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-500">
                {t('account.confirmSwitchHint', { country: countryCode })}
              </p>
              <input
                autoFocus
                value={countryConfirmInput}
                onChange={(e) => setCountryConfirmInput(e.target.value.toUpperCase())}
                placeholder={countryCode}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCountryConfirm(false);
                  setCountryConfirmInput('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                {t('modal.cancel')}
              </button>
              <button
                type="button"
                disabled={countrySaving || countryConfirmInput.trim().toUpperCase() !== countryCode}
                onClick={handleUpdateCountry}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-lg transition disabled:opacity-50"
              >
                {countrySaving ? t('account.updatingCountry') : t('account.confirmSwitchAction')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showApiConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">{t('set.apiChangeConfirmTitle')}</h3>
              <p className="text-sm text-slate-500 mt-1">{t('set.apiChangeConfirmDesc')}</p>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-500">
                {t('set.apiChangeConfirmMeta', {
                  model: appSettings.model,
                  key: maskApiKey(appSettings.apiKey),
                })}
              </p>
              <p className="text-xs text-slate-500">{t('set.apiChangeConfirmHint')}</p>
              <input
                autoFocus
                value={apiConfirmInput}
                onChange={(e) => setApiConfirmInput(e.target.value.toUpperCase())}
                placeholder="CONFIRM"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:border-[#0052D9] focus:ring-1 focus:ring-[#0052D9] outline-none"
              />
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowApiConfirm(false);
                  setApiConfirmInput('');
                }}
                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition"
              >
                {t('modal.cancel')}
              </button>
              <button
                type="button"
                disabled={isSaving || apiConfirmInput.trim().toUpperCase() !== 'CONFIRM'}
                onClick={() => void performSave(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-[#0052D9] hover:bg-blue-800 rounded-lg transition disabled:opacity-50"
              >
                {isSaving ? t('global.saving') : t('set.apiChangeConfirmAction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
