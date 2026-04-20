import { create } from 'zustand';
import type { AppSettings, LanguageCode, LLMModel, SystemLanguage } from '@/types';
import { fsUpdateSettings } from '@/services/firestoreService';
import { INITIAL_SETTINGS } from '@/data/defaults';
import { coerceLLMModel } from '@/lib/llmModelCoerce';
import i18n from '@/i18n';

interface SettingsState {
  appSettings: AppSettings;

  /**
   * Called ONLY by the Firestore sync hook to hydrate state from a remote
   * snapshot — does NOT write back to Firestore (avoids echo loop).
   */
  _setSettings: (settings: AppSettings) => void;

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

// Helper: merge partial updates, apply to state and persist to Firestore
function applyAndSync(
  get: () => SettingsState,
  set: (fn: (s: SettingsState) => Partial<SettingsState>) => void,
  partial: Partial<AppSettings>,
) {
  const next: AppSettings = { ...get().appSettings, ...partial };
  set(() => ({ appSettings: next }));
  void fsUpdateSettings(next).catch((e) => console.error('[Firestore] settings', e));
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  appSettings: INITIAL_SETTINGS,

  // ── Remote sync (no write-back) ──────────────────────────
  _setSettings: (settings) =>
    set(() => ({
      appSettings: {
        ...INITIAL_SETTINGS,
        ...settings,
        model: coerceLLMModel(settings.model),
      },
    })),

  // ── User-triggered mutations ─────────────────────────────
  setAppSettings: (partial) => applyAndSync(get, set, partial),

  setSystemLanguage: (lang) => {
    i18n.changeLanguage(lang);
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
    await fsUpdateSettings(next);
  },
}));
