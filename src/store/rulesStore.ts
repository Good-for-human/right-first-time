import { create } from 'zustand';
import type { Rule, Persona, CategoryLabelMap, SystemLanguageTextMap } from '@/types';
import {
  fsUpdateCategories,
  fsSetCategoryLabels,
  fsSetRule,
  fsDeleteRule,
  fsSetPersona,
  fsDeletePersona,
} from '@/services/firestoreService';
import { isGlobalCategory } from '@/lib/systemTextI18n';
import { useAuthStore } from '@/store/authStore';

interface RulesState {
  categories: string[];
  categoryLabels: CategoryLabelMap;
  rules: Rule[];
  personas: Persona[];

  // Bulk setters — used by the Firestore onSnapshot sync hook
  setCategories: (list: string[]) => void;
  setCategoryLabels: (map: CategoryLabelMap) => void;
  upsertCategoryLabel: (category: string, label: SystemLanguageTextMap) => void;
  setRules: (rules: Rule[]) => void;
  setPersonas: (personas: Persona[]) => void;

  // Category CRUD
  addCategory: (name: string) => void;
  removeCategory: (name: string) => void;

  // Rule CRUD
  addRule: (rule: Omit<Rule, 'id'>) => void;
  updateRule: (id: number, updates: Partial<Rule>) => void;
  removeRule: (id: number) => void;
  toggleRule: (id: number) => void;

  // Persona CRUD
  addPersona: (persona: Omit<Persona, 'id'>) => void;
  updatePersona: (id: string, updates: Partial<Persona>) => void;
  removePersona: (id: string) => void;

  // Selectors
  getRulesForCategory: (category: string, type?: Rule['type']) => Rule[];
  getPersonaById: (id: string) => Persona | undefined;
}

export const useRulesStore = create<RulesState>()((set, get) => ({
  // Start empty — Firestore snapshot will populate
  categories: [],
  categoryLabels: {},
  rules: [],
  personas: [],

  // ── Bulk setters (called by useFirestoreSync) ────────────
  setCategories: (list) => set({ categories: list }),
  setCategoryLabels: (map) => set({ categoryLabels: map }),
  upsertCategoryLabel: (category, label) => {
    const next = {
      ...get().categoryLabels,
      [category]: { ...(get().categoryLabels[category] ?? {}), ...label },
    };
    set({ categoryLabels: next });
    fsSetCategoryLabels(next);
  },
  setRules: (rules) => set({ rules }),
  setPersonas: (personas) => set({ personas }),

  // ── Category mutations ───────────────────────────────────
  addCategory: (name) => {
    const list = [...get().categories, name];
    const labels = {
      ...get().categoryLabels,
      [name]: {
        ...(get().categoryLabels[name] ?? {}),
        en: get().categoryLabels[name]?.en ?? name,
        cn: get().categoryLabels[name]?.cn ?? name,
      },
    };
    set({ categories: list, categoryLabels: labels });
    fsUpdateCategories(list);
    fsSetCategoryLabels(labels);
  },

  removeCategory: (name) => {
    // Capture the rules to delete BEFORE mutating state
    const rulesToDelete = get().rules.filter((r) => r.category === name);
    const list  = get().categories.filter((c) => c !== name);
    const rules = get().rules.filter((r) => r.category !== name);
    const labels = { ...get().categoryLabels };
    delete labels[name];
    set({ categories: list, rules, categoryLabels: labels });
    fsUpdateCategories(list);
    fsSetCategoryLabels(labels);
    rulesToDelete.forEach((r) => fsDeleteRule(r.id));
  },

  // ── Rule mutations ───────────────────────────────────────
  // When cross-country rules are visible, ids may repeat across countries.
  // Always resolve mutations to the current country first.
  // (Fallback to the first id match for backward compatibility.)
  addRule: (rule) => {
    const now = new Date().toISOString();
    const newRule: Rule = { ...rule, id: Date.now(), createdAt: now, updatedAt: now };
    set((state) => ({ rules: [...state.rules, newRule] }));
    fsSetRule(newRule);
  },

  updateRule: (id, updates) => {
    const now = new Date().toISOString();
    const localCountry = useAuthStore.getState().profile?.countryCode;
    const currentRules = get().rules;
    const target = (
      localCountry && localCountry !== 'GLOBAL'
        ? currentRules.find((r) => r.id === id && (r.createdByCountry ?? localCountry) === localCountry)
        : undefined
    ) ?? currentRules.find((r) => r.id === id);
    if (!target) return;
    const targetCountry = target.createdByCountry ?? '';
    set((state) => ({
      rules: state.rules.map((r) => (
        r.id === id && (r.createdByCountry ?? '') === targetCountry
          ? { ...r, ...updates, updatedAt: now }
          : r
      )),
    }));
    const updated = get().rules.find((r) => r.id === id && (r.createdByCountry ?? '') === targetCountry);
    if (updated) fsSetRule(updated);
  },

  removeRule: (id) => {
    const localCountry = useAuthStore.getState().profile?.countryCode;
    const currentRules = get().rules;
    const target = (
      localCountry && localCountry !== 'GLOBAL'
        ? currentRules.find((r) => r.id === id && (r.createdByCountry ?? localCountry) === localCountry)
        : undefined
    ) ?? currentRules.find((r) => r.id === id);
    if (!target) return;
    const targetCountry = target.createdByCountry ?? '';
    set((state) => ({
      rules: state.rules.filter((r) => !(r.id === id && (r.createdByCountry ?? '') === targetCountry)),
    }));
    fsDeleteRule(id);
  },

  toggleRule: (id) => {
    const localCountry = useAuthStore.getState().profile?.countryCode;
    const currentRules = get().rules;
    const target = (
      localCountry && localCountry !== 'GLOBAL'
        ? currentRules.find((r) => r.id === id && (r.createdByCountry ?? localCountry) === localCountry)
        : undefined
    ) ?? currentRules.find((r) => r.id === id);
    if (!target) return;
    const targetCountry = target.createdByCountry ?? '';
    set((state) => ({
      rules: state.rules.map((r) => (
        r.id === id && (r.createdByCountry ?? '') === targetCountry
          ? { ...r, active: !r.active }
          : r
      )),
    }));
    const updated = get().rules.find((r) => r.id === id && (r.createdByCountry ?? '') === targetCountry);
    if (updated) fsSetRule(updated);
  },

  // ── Persona mutations ────────────────────────────────────
  addPersona: (persona) => {
    const now = new Date().toISOString();
    const newPersona: Persona = { ...persona, id: `p${Date.now()}`, createdAt: now, updatedAt: now };
    set((state) => ({ personas: [...state.personas, newPersona] }));
    fsSetPersona(newPersona);
  },

  updatePersona: (id, updates) => {
    const now = new Date().toISOString();
    set((state) => ({
      personas: state.personas.map((p) => (p.id === id ? { ...p, ...updates, updatedAt: now } : p)),
    }));
    const updated = get().personas.find((p) => p.id === id);
    if (updated) fsSetPersona(updated);
  },

  removePersona: (id) => {
    set((state) => ({ personas: state.personas.filter((p) => p.id !== id) }));
    fsDeletePersona(id);
  },

  // ── Selectors ────────────────────────────────────────────
  getRulesForCategory: (category, type) => {
    const { rules } = get();
    return rules.filter(
      (r) =>
        r.active &&
        (r.category === category || isGlobalCategory(r.category)) &&
        (type ? r.type === type : true)
    );
  },

  getPersonaById: (id) => get().personas.find((p) => p.id === id),
}));
