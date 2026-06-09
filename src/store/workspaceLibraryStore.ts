import { create } from 'zustand';
import type { SharedLibraryItem, WorkspaceItem, Rule, Persona, SharedKeywordLibraryItem } from '@/types';

interface WorkspaceLibraryState {
  sharedLibrary: SharedLibraryItem[];
  sharedRules: Rule[];
  sharedPersonas: Persona[];
  sharedKeywords: SharedKeywordLibraryItem[];
  countryWorkspaceItems: WorkspaceItem[];
  setSharedLibrary: (items: SharedLibraryItem[]) => void;
  setSharedRules: (items: Rule[]) => void;
  setSharedPersonas: (items: Persona[]) => void;
  setSharedKeywords: (items: SharedKeywordLibraryItem[]) => void;
  setCountryWorkspaceItems: (items: WorkspaceItem[]) => void;
  clear: () => void;
}

export const useWorkspaceLibraryStore = create<WorkspaceLibraryState>()((set) => ({
  sharedLibrary: [],
  sharedRules: [],
  sharedPersonas: [],
  sharedKeywords: [],
  countryWorkspaceItems: [],
  setSharedLibrary: (items) => set({ sharedLibrary: items }),
  setSharedRules: (items) => set({ sharedRules: items }),
  setSharedPersonas: (items) => set({ sharedPersonas: items }),
  setSharedKeywords: (items) => set({ sharedKeywords: items }),
  setCountryWorkspaceItems: (items) => set({ countryWorkspaceItems: items }),
  clear: () => set({
    sharedLibrary: [],
    sharedRules: [],
    sharedPersonas: [],
    sharedKeywords: [],
    countryWorkspaceItems: [],
  }),
}));
