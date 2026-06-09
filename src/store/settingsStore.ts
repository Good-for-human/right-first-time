import { create } from 'zustand';
import type { AppSettings, LanguageCode, LLMModel, SystemLanguage } from '@/types';
import { fsUpdateSettings } from '@/services/firestoreService';
import { INITIAL_SETTINGS } from '@/data/defaults';
import { coerceLLMModel } from '@/lib/llmModelCoerce';
import i18n from '@/i18n';
import { normalizeSystemLanguage, toI18nLanguage } from '@/lib/systemLanguage';

interface SettingsState {
  appSettings: AppSettings;
  settingsScopeKey: string | null;

  /**
   * Called ONLY by the Firestore sync hook to hydrate state from a remote
   * snapshot — does NOT write back to Firestore (avoids echo loop).
   */
  _setSettings: (settings: AppSettings) => void;
  initSettingsScope: (scopeKey: string | null) => void;

  // User-triggered mutations — each writes to Firestore
  setAppSettings:     (settings: Partial<AppSettings>) => void;
  setSystemLanguage:  (lang: SystemLanguage) => void;
  setTargetLanguage:  (lang: LanguageCode) => void;
  setModel:           (model: LLMModel) => void;
  saveApiKey:         (key: string) => void;
  clearApiKey:        () => void;
  saveTinyfishKey:    (key: string) => void;
  clearTinyfishKey:   () => void;

  /** Full settings document write — used by 系统设置「保存」按钮（可 await / 捕获错误） */
  persistAppSettings: () => Promise<void>;
}

function normalizeScopeKey(scopeKey: string | null | undefined): string | null {
  const normalized = (scopeKey ?? '').trim().toUpperCase();
  return normalized || null;
}

function settingsCacheKey(scopeKey: string): string {
  return `rft.settings.${scopeKey}`;
}

function loadCachedSettings(scopeKey: string): AppSettings | null {
  try {
    const raw = localStorage.getItem(settingsCacheKey(scopeKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...INITIAL_SETTINGS,
      ...parsed,
      systemLanguage: normalizeSystemLanguage(parsed.systemLanguage),
      model: coerceLLMModel(parsed.model),
    };
  } catch (err) {
    console.warn('[Settings] failed to parse scope-scoped cache', err);
    return null;
  }
}

function saveCachedSettings(scopeKey: string | null, settings: AppSettings): void {
  if (!scopeKey) return;
  try {
    localStorage.setItem(settingsCacheKey(scopeKey), JSON.stringify(settings));
  } catch (err) {
    console.warn('[Settings] failed to persist scope-scoped cache', err);
  }
}

// Helper: merge partial updates, apply to state and persist to Firestore
function applyAndSync(
  get: () => SettingsState,
  set: (fn: (s: SettingsState) => Partial<SettingsState>) => void,
  partial: Partial<AppSettings>,
) {
  const current = get();
  const next: AppSettings = { ...current.appSettings, ...partial };
  set(() => ({ appSettings: next }));
  saveCachedSettings(current.settingsScopeKey, next);
  void fsUpdateSettings(next).catch((e) => console.error('[Firestore] settings', e));
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  appSettings: INITIAL_SETTINGS,
  settingsScopeKey: null,

  // ── Remote sync (no write-back) ──────────────────────────
  _setSettings: (settings) => {
    const normalized: AppSettings = {
      ...INITIAL_SETTINGS,
      ...settings,
      systemLanguage: normalizeSystemLanguage(settings.systemLanguage),
      model: coerceLLMModel(settings.model),
    };
    set(() => ({ appSettings: normalized }));
    saveCachedSettings(get().settingsScopeKey, normalized);
  },

  initSettingsScope: (scopeKey) => {
    const normalizedScope = normalizeScopeKey(scopeKey);
    const cached = normalizedScope ? loadCachedSettings(normalizedScope) : null;
    const next = cached ?? INITIAL_SETTINGS;
    set(() => ({
      settingsScopeKey: normalizedScope,
      appSettings: next,
    }));
    i18n.changeLanguage(toI18nLanguage(next.systemLanguage));
  },

  // ── User-triggered mutations ─────────────────────────────
  setAppSettings: (partial) => applyAndSync(get, set, partial),

  setSystemLanguage: (lang) => {
    i18n.changeLanguage(toI18nLanguage(lang));
    applyAndSync(get, set, { systemLanguage: lang });
  },

  setTargetLanguage: (lang) => applyAndSync(get, set, { targetLanguage: lang }),

  setModel: (model) => applyAndSync(get, set, { model }),

  saveApiKey: (key) => applyAndSync(get, set, { apiKey: key, isSaved: true }),

  clearApiKey: () => applyAndSync(get, set, { apiKey: '', isSaved: false }),

  saveTinyfishKey: (key) =>
    applyAndSync(get, set, { tinyfishApiKey: key, isTinyfishSaved: true }),

  clearTinyfishKey: () =>
    applyAndSync(get, set, { tinyfishApiKey: '', isTinyfishSaved: false }),

  persistAppSettings: async () => {
    const s = get().appSettings;
    const next: AppSettings = {
      ...s,
      ...(s.apiKey.trim() && !s.isSaved ? { isSaved: true } : {}),
      ...(s.tinyfishApiKey.trim() && !s.isTinyfishSaved ? { isTinyfishSaved: true } : {}),
    };
    set(() => ({ appSettings: next }));
    saveCachedSettings(get().settingsScopeKey, next);
    await fsUpdateSettings(next);
  },
}));
