import { create } from 'zustand';
import type { KeywordMap, KeywordSet, CategoryRefAsinMap } from '@/types';
import { fsSetKeywords, fsSetCategoryRefAsins } from '@/services/firestoreService';

interface KeywordsState {
  keywords: KeywordMap;
  categoryRefAsins: CategoryRefAsinMap;

  // Bulk setters — used by the Firestore onSnapshot sync hook
  setKeywords: (map: KeywordMap) => void;
  setCategoryRefAsins: (refAsins: CategoryRefAsinMap) => void;

  // Keyword set CRUD
  setKeywordSet: (category: string, set: KeywordSet) => void;
  removeKeywordSet: (category: string) => void;
  getKeywordSet: (category: string) => KeywordSet | undefined;

  // Category reference ASIN CRUD (max 3)
  addCategoryRefAsin: (category: string, asin: string) => void;
  removeCategoryRefAsin: (category: string, asin: string) => void;
  getCategoryRefAsins: (category: string) => string[];
}

export const useKeywordsStore = create<KeywordsState>()((set, get) => ({
  keywords: {},
  categoryRefAsins: {},

  setKeywords: (map) => set({ keywords: map }),
  setCategoryRefAsins: (refAsins) => set({ categoryRefAsins: refAsins }),

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

  addCategoryRefAsin: (category, asin) => {
    const current = get().categoryRefAsins[category] ?? [];
    if (current.length >= 3 || current.includes(asin)) return;
    const updated = { ...get().categoryRefAsins, [category]: [...current, asin] };
    set({ categoryRefAsins: updated });
    fsSetCategoryRefAsins(updated);
  },

  removeCategoryRefAsin: (category, asin) => {
    const current = get().categoryRefAsins[category] ?? [];
    const updated = {
      ...get().categoryRefAsins,
      [category]: current.filter((a) => a !== asin),
    };
    set({ categoryRefAsins: updated });
    fsSetCategoryRefAsins(updated);
  },

  getCategoryRefAsins: (category) => get().categoryRefAsins[category] ?? [],
}));
