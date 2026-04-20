import { create } from 'zustand';
import type { Rule, Persona } from '@/types';
import {
  fsUpdateCategories,
  fsSetRule,
  fsDeleteRule,
  fsSetPersona,
  fsDeletePersona,
} from '@/services/firestoreService';

interface RulesState {
  categories: string[];
  rules: Rule[];
  personas: Persona[];

  // Bulk setters — used by the Firestore onSnapshot sync hook
  setCategories: (list: string[]) => void;
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
  rules: [],
  personas: [],

  // ── Bulk setters (called by useFirestoreSync) ────────────
  setCategories: (list) => set({ categories: list }),
  setRules: (rules) => set({ rules }),
  setPersonas: (personas) => set({ personas }),

  // ── Category mutations ───────────────────────────────────
  addCategory: (name) => {
    const list = [...get().categories, name];
    set({ categories: list });
    fsUpdateCategories(list);
  },

  removeCategory: (name) => {
    // Capture the rules to delete BEFORE mutating state
    const rulesToDelete = get().rules.filter((r) => r.category === name);
    const list  = get().categories.filter((c) => c !== name);
    const rules = get().rules.filter((r) => r.category !== name);
    set({ categories: list, rules });
    fsUpdateCategories(list);
    rulesToDelete.forEach((r) => fsDeleteRule(r.id));
  },

  // ── Rule mutations ───────────────────────────────────────
  addRule: (rule) => {
    const newRule: Rule = { ...rule, id: Date.now() };
    set((state) => ({ rules: [...state.rules, newRule] }));
    fsSetRule(newRule);
  },

  updateRule: (id, updates) => {
    set((state) => ({
      rules: state.rules.map((r) => (r.id === id ? { ...r, ...updates } : r)),
    }));
    const updated = get().rules.find((r) => r.id === id);
    if (updated) fsSetRule(updated);
  },

  removeRule: (id) => {
    set((state) => ({ rules: state.rules.filter((r) => r.id !== id) }));
    fsDeleteRule(id);
  },

  toggleRule: (id) => {
    set((state) => ({
      rules: state.rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)),
    }));
    const updated = get().rules.find((r) => r.id === id);
    if (updated) fsSetRule(updated);
  },

  // ── Persona mutations ────────────────────────────────────
  addPersona: (persona) => {
    const newPersona: Persona = { ...persona, id: `p${Date.now()}` };
    set((state) => ({ personas: [...state.personas, newPersona] }));
    fsSetPersona(newPersona);
  },

  updatePersona: (id, updates) => {
    set((state) => ({
      personas: state.personas.map((p) => (p.id === id ? { ...p, ...updates } : p)),
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
        (r.category === category || r.category === '通用') &&
        (type ? r.type === type : true)
    );
  },

  getPersonaById: (id) => get().personas.find((p) => p.id === id),
}));
