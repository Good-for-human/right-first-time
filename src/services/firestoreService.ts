/**
 * Firestore persistence layer — user-scoped paths.
 *
 * All data lives under:  /users/{uid}/{collection or doc}
 *
 *   users/{uid}/config/categories  → { list: string[] }
 *   users/{uid}/config/settings    → AppSettings document
 *   users/{uid}/rules/{id}         → Rule document
 *   users/{uid}/personas/{id}      → Persona document
 *   users/{uid}/tasks/{id}         → Task document
 *
 * Seed policy: on first run (empty collections / missing docs), ALL entries
 * from INITIAL_* are written in a single batch so the UI is never empty.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { AppSettings, Rule, Persona, Task, KeywordMap } from '@/types';
import {
  INITIAL_SETTINGS,
  INITIAL_CATEGORIES,
  INITIAL_RULES,
  INITIAL_PERSONAS,
  INITIAL_TASKS,
} from '@/data/defaults';

// ── Current authenticated user ────────────────────────────────
let _uid: string | null = null;

/** Call this when auth state changes (sign-in / sign-out). */
export function setCurrentUser(uid: string | null): void {
  _uid = uid;
}

// ── Scoped Firestore refs (require active _uid) ───────────────
function requireUid(): string {
  if (!_uid) throw new Error('[Firestore] No authenticated user — call setCurrentUser first');
  return _uid;
}

const settingsDoc = () => doc(db, 'users', requireUid(), 'config', 'settings');
const catDoc      = () => doc(db, 'users', requireUid(), 'config', 'categories');
const kwDoc       = () => doc(db, 'users', requireUid(), 'config', 'keywords');
const ruleCol     = () => collection(db, 'users', requireUid(), 'rules');
const perCol      = () => collection(db, 'users', requireUid(), 'personas');
const taskCol     = () => collection(db, 'users', requireUid(), 'tasks');

// ── Full-data seed (runs once when user's data is missing) ────
export async function seedIfEmpty(): Promise<void> {
  const uid = requireUid();

  const [settingsSnap, catSnap, rulesSnap, personasSnap, tasksSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'config', 'settings')),
    getDoc(doc(db, 'users', uid, 'config', 'categories')),
    getDocs(collection(db, 'users', uid, 'rules')),
    getDocs(collection(db, 'users', uid, 'personas')),
    getDocs(collection(db, 'users', uid, 'tasks')),
  ]);

  const batch = writeBatch(db);
  let dirty = false;

  if (!settingsSnap.exists()) {
    batch.set(doc(db, 'users', uid, 'config', 'settings'), INITIAL_SETTINGS);
    dirty = true;
  }
  if (!catSnap.exists()) {
    batch.set(doc(db, 'users', uid, 'config', 'categories'), { list: INITIAL_CATEGORIES });
    dirty = true;
  }
  if (rulesSnap.empty) {
    INITIAL_RULES.forEach((rule) => {
      batch.set(doc(db, 'users', uid, 'rules', String(rule.id)), rule);
    });
    dirty = true;
  }
  if (personasSnap.empty) {
    INITIAL_PERSONAS.forEach((persona) => {
      batch.set(doc(db, 'users', uid, 'personas', persona.id), persona);
    });
    dirty = true;
  }
  if (tasksSnap.empty) {
    INITIAL_TASKS.forEach((task) => {
      batch.set(doc(db, 'users', uid, 'tasks', task.id), task);
    });
    dirty = true;
  }

  if (dirty) await batch.commit();
}

// ── Real-time listeners ───────────────────────────────────────
export function subscribeSettings(cb: (settings: AppSettings) => void): Unsubscribe {
  return onSnapshot(settingsDoc(), (snap) => {
    if (snap.exists()) cb(snap.data() as AppSettings);
  });
}

export function subscribeCategories(cb: (list: string[]) => void): Unsubscribe {
  return onSnapshot(catDoc(), (snap) => {
    if (snap.exists()) cb((snap.data().list as string[]) ?? []);
  });
}

export function subscribeKeywords(cb: (map: KeywordMap) => void): Unsubscribe {
  return onSnapshot(kwDoc(), (snap) => {
    cb(snap.exists() ? ((snap.data().map as KeywordMap) ?? {}) : {});
  });
}

export function subscribeRules(cb: (rules: Rule[]) => void): Unsubscribe {
  return onSnapshot(ruleCol(), (snap) => {
    cb(snap.docs.map((d) => d.data() as Rule));
  });
}

export function subscribePersonas(cb: (personas: Persona[]) => void): Unsubscribe {
  return onSnapshot(perCol(), (snap) => {
    cb(snap.docs.map((d) => d.data() as Persona));
  });
}

export function subscribeTasks(cb: (tasks: Task[]) => void): Unsubscribe {
  return onSnapshot(taskCol(), (snap) => {
    cb(snap.docs.map((d) => d.data() as Task));
  });
}

// ── Utilities ─────────────────────────────────────────────────
/**
 * Firestore refuses `undefined`. Recursively drop `undefined` fields from a value.
 * Arrays / primitives pass through untouched.
 */
function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefined(v)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined) continue;
      out[k] = stripUndefined(v);
    }
    return out as T;
  }
  return value;
}

// ── Settings mutations ────────────────────────────────────────
export async function fsUpdateSettings(settings: AppSettings): Promise<void> {
  await setDoc(settingsDoc(), stripUndefined(settings));
}

// ── Category mutations ────────────────────────────────────────
export function fsUpdateCategories(list: string[]): void {
  setDoc(catDoc(), { list }).catch(console.error);
}

// ── Keyword mutations ─────────────────────────────────────────
export function fsSetKeywords(map: KeywordMap): void {
  setDoc(kwDoc(), { map: stripUndefined(map) }).catch(console.error);
}

// ── Rule mutations ────────────────────────────────────────────
export function fsSetRule(rule: Rule): void {
  setDoc(doc(ruleCol(), String(rule.id)), stripUndefined(rule)).catch(console.error);
}

export function fsDeleteRule(id: number): void {
  deleteDoc(doc(ruleCol(), String(id))).catch(console.error);
}

// ── Persona mutations ─────────────────────────────────────────
export function fsSetPersona(persona: Persona): void {
  setDoc(doc(perCol(), persona.id), stripUndefined(persona)).catch(console.error);
}

export function fsDeletePersona(id: string): void {
  deleteDoc(doc(perCol(), id)).catch(console.error);
}

// ── Task mutations ────────────────────────────────────────────
export function fsSetTask(task: Task): void {
  setDoc(
    doc(taskCol(), task.id),
    stripUndefined({ ...task, createdAt: task.createdAt ?? new Date().toISOString() }),
  ).catch(console.error);
}

export function fsDeleteTask(id: string): void {
  deleteDoc(doc(taskCol(), id)).catch(console.error);
}
