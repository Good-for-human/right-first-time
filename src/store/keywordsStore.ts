import { create } from 'zustand';
import type { KeywordMap, KeywordSet } from '@/types';
import { fsSetKeywords } from '@/services/firestoreService';

interface KeywordsState {
  keywords: KeywordMap;

  /** Bulk setter — used by the Firestore onSnapshot sync hook */
  setKeywords: (map: KeywordMap) => void;

  /** Upsert keyword set for a category */
  setKeywordSet: (category: string, set: KeywordSet) => void;

  /** Remove keyword set for a category */
  removeKeywordSet: (category: string) => void;

  /** Get keyword set for a category (returns undefined if not set) */
  getKeywordSet: (category: string) => KeywordSet | undefined;
}

export const useKeywordsStore = create<KeywordsState>()((set, get) => ({
  keywords: {},

  setKeywords: (map) => set({ keywords: map }),

  setKeywordSet: (category, kwSet) => {
    const updated = { ...get().keywords, [category]: kwSet };
    set({ keywords: updated });
    fsSetKeywords(updated);
  },

  removeKeywordSet: (category) => {
    const updated = { ...get().keywords };
    delete updated[category];
    set({ keywords: updated });
    fsSetKeywords(updated);
  },

  getKeywordSet: (category) => get().keywords[category],
}));
