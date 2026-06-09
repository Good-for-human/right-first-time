/**
 * Firestore persistence layer.
 *
 * Profile/auth ownership still lives under:
 *   users/{uid}/config/profile
 *
 * Shared operation data is country-scoped:
 *   workspace_data/{country}/config/categories  → { list: string[] }
 *   workspace_data/{country}/config/settings    → AppSettings document
 *   workspace_data/{country}/rules/{id}         → Rule document
 *   workspace_data/{country}/personas/{id}      → Persona document
 *   workspace_data/{country}/tasks/{id}         → Task document
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
  updateDoc,
  deleteField,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getLanguageForCountry } from '@/lib/countryLanguage';
import type {
  AppSettings,
  CategoryLabelMap,
  Rule,
  Persona,
  Task,
  KeywordMap,
  CategoryRefAsinMap,
  CountryCode,
  BusinessCountryCode,
  UserProfile,
  UserRole,
  ModelRecord,
  CountryListing,
  SharedLibraryItem,
  WorkspaceItem,
} from '@/types';
import {
  INITIAL_SETTINGS,
  INITIAL_CATEGORIES,
  INITIAL_CATEGORY_LABELS,
  INITIAL_RULES,
  INITIAL_PERSONAS,
} from '@/data/defaults';
import {
  CANONICAL_CATEGORIES,
  GLOBAL_RULE_CATEGORY,
  mapToCanonicalCategory,
} from '@/lib/categoryTaxonomy';

// ── Current authenticated user ────────────────────────────────
let _uid: string | null = null;
let _workspaceScope: string | null = null;

/** Call this when auth state changes (sign-in / sign-out). */
export function setCurrentUser(uid: string | null): void {
  _uid = uid;
}

/** Country-scoped shared workspace key (e.g. UK / DE / GLOBAL). */
export function setCurrentWorkspaceScope(scope: string | null): void {
  _workspaceScope = scope;
}

// ── Scoped Firestore refs (require active _uid) ───────────────
function requireUid(): string {
  if (!_uid) throw new Error('[Firestore] No authenticated user — call setCurrentUser first');
  return _uid;
}

function requireWorkspaceScope(): string {
  if (!_workspaceScope) throw new Error('[Firestore] No workspace scope — call setCurrentWorkspaceScope first');
  return _workspaceScope;
}

const settingsDoc = () => doc(db, 'workspace_data', requireWorkspaceScope(), 'config', 'settings');
const catDoc      = () => doc(db, 'workspace_data', requireWorkspaceScope(), 'config', 'categories');
const catLabelsDoc = () => doc(db, 'workspace_data', requireWorkspaceScope(), 'config', 'category_labels');
const kwDoc       = () => doc(db, 'workspace_data', requireWorkspaceScope(), 'config', 'keywords');
const profileDoc  = () => doc(db, 'users', requireUid(), 'config', 'profile');
const ruleCol     = () => collection(db, 'workspace_data', requireWorkspaceScope(), 'rules');
const perCol      = () => collection(db, 'workspace_data', requireWorkspaceScope(), 'personas');
const taskCol     = () => collection(db, 'workspace_data', requireWorkspaceScope(), 'tasks');
const keywordDocByScope = (scope: CountryCode) =>
  doc(db, 'workspace_data', scope, 'config', 'keywords');
const personaColByScope = (scope: CountryCode) =>
  collection(db, 'workspace_data', scope, 'personas');
const ruleColByScope = (scope: CountryCode) =>
  collection(db, 'workspace_data', scope, 'rules');

const ADMIN_EMAIL = 'admin@tp-link.com';
const DEFAULT_COUNTRY: CountryCode = 'UK';
const SYSTEM_RULE_AUTHOR_EMAIL = 'system@rightfirsttime.local';
const SHARED_SCOPES: CountryCode[] = ['GLOBAL', 'UK', 'DE', 'IT', 'ES', 'FR', 'BE', 'NL', 'PL', 'SE'];

const profileDocByUid = (uid: string) => doc(db, 'users', uid, 'config', 'profile');
const modelDocByKey = (modelKey: string) => doc(db, 'models', modelKey);
const listingDocByModelAndCountry = (modelKey: string, countryCode: BusinessCountryCode) =>
  doc(db, 'models', modelKey, 'countryListings', countryCode);
const sharedLibraryCol = () => collection(db, 'shared_library');
const sharedLibraryDocById = (id: string) => doc(db, 'shared_library', id);
const countryWorkspaceColByCountry = (countryCode: BusinessCountryCode) =>
  collection(db, 'country_workspaces', countryCode, 'items');
const countryWorkspaceDocByModel = (countryCode: BusinessCountryCode, modelKey: string) =>
  doc(db, 'country_workspaces', countryCode, 'items', modelKey);

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeModelKey(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, ' ');
  const sanitized = compact.replace(/[\\/#[\]?]/g, '-');
  return sanitized.toUpperCase();
}

function sharedLibraryId(modelKey: string, sourceCountry: BusinessCountryCode): string {
  return `${modelKey}_${sourceCountry}`;
}

function inferRole(email: string): UserRole {
  return email.toLowerCase() === ADMIN_EMAIL ? 'admin' : 'user';
}

function normalizeCountryForRole(
  role: UserRole,
  countryCode?: CountryCode,
  existingCountryCode?: CountryCode,
): CountryCode {
  if (role === 'admin') return 'GLOBAL';
  return countryCode ?? existingCountryCode ?? DEFAULT_COUNTRY;
}

function buildProfile(params: {
  uid: string;
  email: string;
  countryCode?: CountryCode;
  existingCountryCode?: CountryCode;
  role?: UserRole;
  existingCreatedAt?: string;
}): UserProfile {
  const role = params.role ?? inferRole(params.email);
  const now = new Date().toISOString();
  return {
    uid: params.uid,
    email: params.email,
    countryCode: normalizeCountryForRole(role, params.countryCode, params.existingCountryCode),
    role,
    createdAt: params.existingCreatedAt ?? now,
    updatedAt: now,
  };
}

export async function upsertUserProfileByUid(params: {
  uid: string;
  email: string;
  countryCode?: CountryCode;
  role?: UserRole;
}): Promise<UserProfile> {
  const existing = await getDoc(profileDocByUid(params.uid));
  const existingData = existing.exists() ? (existing.data() as Partial<UserProfile>) : undefined;
  const profile = buildProfile({
    ...params,
    existingCountryCode: existingData?.countryCode,
    existingCreatedAt: existingData?.createdAt,
  });
  await setDoc(profileDocByUid(params.uid), profile, { merge: true });
  return profile;
}

export async function ensureUserProfileByUid(params: {
  uid: string;
  email: string | null;
  preferredCountryCode?: CountryCode;
}): Promise<UserProfile> {
  const safeEmail = (params.email ?? '').trim().toLowerCase();
  if (!safeEmail) {
    throw new Error('[Firestore] Missing user email for profile bootstrap');
  }
  const existing = await getDoc(profileDocByUid(params.uid));
  if (existing.exists()) {
    const existingProfile = existing.data() as UserProfile;
    const expectedRole = inferRole(safeEmail);
    const expectedCountry =
      expectedRole === 'admin'
        ? 'GLOBAL'
        : (params.preferredCountryCode ?? existingProfile.countryCode ?? DEFAULT_COUNTRY);

    const needRoleFix = existingProfile.role !== expectedRole;
    const needCountryFix =
      expectedRole !== 'admin' && existingProfile.countryCode !== expectedCountry;

    if (needRoleFix || needCountryFix) {
      return upsertUserProfileByUid({
        uid: params.uid,
        email: safeEmail,
        role: expectedRole,
        countryCode: expectedCountry,
      });
    }
    return existingProfile;
  }
  return upsertUserProfileByUid({
    uid: params.uid,
    email: safeEmail,
    countryCode: params.preferredCountryCode,
  });
}

export async function ensureTaskCountryConsistency(countryCode: BusinessCountryCode): Promise<void> {
  const snap = await getDocs(taskCol());
  if (snap.empty) return;

  const batch = writeBatch(db);
  let dirty = false;
  const forcedLanguage = getLanguageForCountry(countryCode);
  snap.docs.forEach((d) => {
    const task = d.data() as Task;
    const nextModelKey = normalizeModelKey(task.modelKey || task.name || task.asin);
    if (
      task.countryCode !== countryCode ||
      task.modelKey !== nextModelKey ||
      task.language !== forcedLanguage
    ) {
      batch.set(
        d.ref,
        stripUndefined({
          ...task,
          countryCode,
          modelKey: nextModelKey,
          language: forcedLanguage,
        }),
      );
      dirty = true;
    }
  });

  if (dirty) await batch.commit();
}

export async function fsUpdateCurrentUserCountry(countryCode: BusinessCountryCode): Promise<UserProfile> {
  const snap = await getDoc(profileDoc());
  if (!snap.exists()) {
    throw new Error('[Firestore] Missing profile document');
  }
  const current = snap.data() as UserProfile;
  if (current.role === 'admin') {
    throw new Error('[Firestore] Admin country is fixed to GLOBAL');
  }
  const next: UserProfile = {
    ...current,
    countryCode,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(profileDoc(), next, { merge: true });
  return next;
}

// ── Shared library & cross-country workspace ───────────────────
export async function upsertModelRecord(params: {
  modelKey: string;
  displayName: string;
  asinList?: string[];
  countriesAvailable?: BusinessCountryCode[];
}): Promise<ModelRecord> {
  const key = normalizeModelKey(params.modelKey);
  if (!key) throw new Error('[Firestore] modelKey is required');

  const now = new Date().toISOString();
  const existing = await getDoc(modelDocByKey(key));
  const existingData = existing.exists() ? (existing.data() as Partial<ModelRecord>) : {};

  const modelRecord: ModelRecord = {
    modelKey: key,
    displayName: params.displayName.trim() || existingData.displayName || key,
    asinList: uniqueStrings([...(existingData.asinList ?? []), ...(params.asinList ?? [])]),
    countriesAvailable: uniqueStrings(
      [
        ...(existingData.countriesAvailable ?? []),
        ...(params.countriesAvailable ?? []),
      ] as string[],
    ) as BusinessCountryCode[],
    createdAt: existingData.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(modelDocByKey(key), modelRecord, { merge: true });
  return modelRecord;
}

export async function upsertCountryListing(params: {
  modelKey: string;
  countryCode: BusinessCountryCode;
  asin?: string;
  status: CountryListing['status'];
  title?: string;
  bullets?: string[];
  description?: string;
  attributes?: Record<string, string>;
  media?: string[];
  sourceType?: CountryListing['sourceType'];
  sourceListingId?: string;
}): Promise<CountryListing> {
  const modelKey = normalizeModelKey(params.modelKey);
  const now = new Date().toISOString();
  const next: CountryListing = {
    modelKey,
    countryCode: params.countryCode,
    asin: params.asin,
    status: params.status,
    title: params.title,
    bullets: params.bullets,
    description: params.description,
    attributes: params.attributes,
    media: params.media,
    approvedAt: params.status === 'approved' ? now : undefined,
    sourceType: params.sourceType ?? 'native',
    sourceListingId: params.sourceListingId,
    updatedAt: now,
  };

  await setDoc(listingDocByModelAndCountry(modelKey, params.countryCode), stripUndefined(next), { merge: true });
  await upsertModelRecord({
    modelKey,
    displayName: params.title ?? modelKey,
    asinList: params.asin ? [params.asin] : [],
    countriesAvailable: [params.countryCode],
  });
  return next;
}

export async function getCountryListing(
  modelKey: string,
  countryCode: BusinessCountryCode,
): Promise<CountryListing | null> {
  const ref = listingDocByModelAndCountry(normalizeModelKey(modelKey), countryCode);
  const snap = await getDoc(ref);
  return snap.exists() ? (snap.data() as CountryListing) : null;
}

export async function publishApprovedListingToSharedLibrary(params: {
  modelKey: string;
  sourceCountry: BusinessCountryCode;
  asinList?: string[];
  summaryTitle?: string;
  summaryBullets?: string[];
  thumbnail?: string;
  snapshot: Partial<CountryListing>;
  searchKeywords?: string[];
}): Promise<SharedLibraryItem> {
  const modelKey = normalizeModelKey(params.modelKey);
  const now = new Date().toISOString();
  const id = sharedLibraryId(modelKey, params.sourceCountry);
  const existing = await getDoc(sharedLibraryDocById(id));
  const existingData = existing.exists() ? (existing.data() as Partial<SharedLibraryItem>) : {};

  const item: SharedLibraryItem = {
    id,
    modelKey,
    sourceCountry: params.sourceCountry,
    asinList: uniqueStrings([...(existingData.asinList ?? []), ...(params.asinList ?? [])]),
    summaryTitle: params.summaryTitle ?? existingData.summaryTitle,
    summaryBullets: params.summaryBullets ?? existingData.summaryBullets,
    thumbnail: params.thumbnail ?? existingData.thumbnail,
    approvedAt: now,
    snapshot: {
      ...existingData.snapshot,
      ...stripUndefined(params.snapshot),
      modelKey,
      countryCode: params.sourceCountry,
      status: 'approved',
      sourceType: 'native',
      approvedAt: now,
    },
    searchKeywords: uniqueStrings([...(existingData.searchKeywords ?? []), ...(params.searchKeywords ?? [])]),
    createdAt: existingData.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(sharedLibraryDocById(id), stripUndefined(item), { merge: true });
  return item;
}

export async function addSharedItemToCountryWorkspace(params: {
  countryCode: BusinessCountryCode;
  sharedItem: SharedLibraryItem;
  localOverrides?: WorkspaceItem['localOverrides'];
}): Promise<WorkspaceItem> {
  const now = new Date().toISOString();
  const modelKey = normalizeModelKey(params.sharedItem.modelKey);
  const ref = countryWorkspaceDocByModel(params.countryCode, modelKey);
  const existing = await getDoc(ref);
  const existingData = existing.exists() ? (existing.data() as Partial<WorkspaceItem>) : {};

  const next: WorkspaceItem = {
    modelKey,
    countryCode: params.countryCode,
    fromSharedId: params.sharedItem.id,
    fromSharedCountry: params.sharedItem.sourceCountry,
    workspaceStatus: existingData.workspaceStatus ?? 'active',
    localOverrides: {
      ...(existingData.localOverrides ?? {}),
      ...(params.localOverrides ?? {}),
    },
    createdAt: existingData.createdAt ?? now,
    updatedAt: now,
  };

  await setDoc(ref, stripUndefined(next), { merge: true });
  return next;
}

export async function updateCountryWorkspaceOverrides(
  countryCode: BusinessCountryCode,
  modelKey: string,
  localOverrides: WorkspaceItem['localOverrides'],
): Promise<void> {
  const key = normalizeModelKey(modelKey);
  const now = new Date().toISOString();
  await setDoc(
    countryWorkspaceDocByModel(countryCode, key),
    stripUndefined({ modelKey: key, countryCode, localOverrides, updatedAt: now }),
    { merge: true },
  );
}

export async function removeCountryWorkspaceItem(
  countryCode: BusinessCountryCode,
  modelKey: string,
): Promise<void> {
  await deleteDoc(countryWorkspaceDocByModel(countryCode, normalizeModelKey(modelKey)));
}

export async function markCountryListingPending(
  modelKey: string,
  countryCode: BusinessCountryCode,
): Promise<void> {
  const ref = listingDocByModelAndCountry(normalizeModelKey(modelKey), countryCode);
  const existing = await getDoc(ref);
  if (!existing.exists()) return;
  await updateDoc(ref, {
    status: 'pending',
    updatedAt: new Date().toISOString(),
    approvedAt: deleteField(),
  });
}

export async function unpublishSharedListingForCountry(
  modelKey: string,
  sourceCountry: BusinessCountryCode,
): Promise<void> {
  const id = sharedLibraryId(normalizeModelKey(modelKey), sourceCountry);
  await deleteDoc(sharedLibraryDocById(id));
}

export function subscribeSharedLibrary(
  cb: (items: SharedLibraryItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(sharedLibraryCol(), orderBy('approvedAt', 'desc')),
    (snap) => {
      const all = snap.docs.map((d) => d.data() as SharedLibraryItem);
      cb(
        all.filter((item) =>
          item.snapshot?.status === 'approved' || Boolean(item.approvedAt),
        ),
      );
    },
    (err) => {
      console.error('[Firestore] subscribeSharedLibrary:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeCountryWorkspace(
  countryCode: BusinessCountryCode,
  cb: (items: WorkspaceItem[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(countryWorkspaceColByCountry(countryCode), orderBy('updatedAt', 'desc')),
    (snap) => {
      cb(snap.docs.map((d) => d.data() as WorkspaceItem));
    },
    (err) => {
      console.error('[Firestore] subscribeCountryWorkspace:', err);
      onError?.(err as Error);
    },
  );
}

// ── Full-data seed (runs once when user's data is missing) ────
export async function seedIfEmpty(): Promise<void> {
  const scope = requireWorkspaceScope();

  const [settingsSnap, catSnap, catLabelsSnap, rulesSnap, personasSnap] = await Promise.all([
    getDoc(doc(db, 'workspace_data', scope, 'config', 'settings')),
    getDoc(doc(db, 'workspace_data', scope, 'config', 'categories')),
    getDoc(doc(db, 'workspace_data', scope, 'config', 'category_labels')),
    getDocs(collection(db, 'workspace_data', scope, 'rules')),
    getDocs(collection(db, 'workspace_data', scope, 'personas')),
  ]);

  const batch = writeBatch(db);
  let dirty = false;

  if (!settingsSnap.exists()) {
    batch.set(doc(db, 'workspace_data', scope, 'config', 'settings'), INITIAL_SETTINGS);
    dirty = true;
  }
  if (!catSnap.exists()) {
    batch.set(doc(db, 'workspace_data', scope, 'config', 'categories'), { list: INITIAL_CATEGORIES });
    dirty = true;
  }
  if (!catLabelsSnap.exists()) {
    batch.set(doc(db, 'workspace_data', scope, 'config', 'category_labels'), { map: INITIAL_CATEGORY_LABELS });
    dirty = true;
  }
  if (rulesSnap.empty) {
    INITIAL_RULES.forEach((rule) => {
      batch.set(doc(db, 'workspace_data', scope, 'rules', String(rule.id)), rule);
    });
    dirty = true;
  }
  if (personasSnap.empty) {
    INITIAL_PERSONAS.forEach((persona) => {
      batch.set(doc(db, 'workspace_data', scope, 'personas', persona.id), persona);
    });
    dirty = true;
  }
  // Do NOT auto-seed demo tasks.
  // Reason: users expect crawler-created tasks to be the single source of truth.
  // Auto-injecting defaults on empty collections makes refresh look like a rollback.

  if (dirty) await batch.commit();
}

/**
 * Ensure current workspace always has the latest system presets:
 * - enforce canonical category taxonomy
 * - upsert default rules/personas (English-first with i18n baseline)
 *
 * This runs after bootstrap to keep existing workspaces aligned without
 * deleting user content.
 */
export async function applySystemPresets(): Promise<void> {
  const scope = requireWorkspaceScope();
  const [catSnap, catLabelsSnap, rulesSnap, personasSnap, tasksSnap, kwSnap] = await Promise.all([
    getDoc(doc(db, 'workspace_data', scope, 'config', 'categories')),
    getDoc(doc(db, 'workspace_data', scope, 'config', 'category_labels')),
    getDocs(collection(db, 'workspace_data', scope, 'rules')),
    getDocs(collection(db, 'workspace_data', scope, 'personas')),
    getDocs(collection(db, 'workspace_data', scope, 'tasks')),
    getDoc(doc(db, 'workspace_data', scope, 'config', 'keywords')),
  ]);

  const canonicalCategories = [...CANONICAL_CATEGORIES];
  const existingCategories = catSnap.exists() ? ((catSnap.data().list as string[]) ?? []) : [];
  const existingCategoryLabels = catLabelsSnap.exists()
    ? ((catLabelsSnap.data().map as CategoryLabelMap) ?? {})
    : {};
  const forcedCategoryLabels: Partial<Record<string, { en: string; cn: string }>> = {
    [GLOBAL_RULE_CATEGORY]: { en: 'general', cn: '通用' },
    'smart home IoT': { en: 'smart home IoT', cn: '智能电子' },
  };
  const canonicalCategoryLabels = stripUndefined(
    canonicalCategories.reduce<CategoryLabelMap>((acc, category) => {
      const existing = existingCategoryLabels[category] ?? {};
      const preset = INITIAL_CATEGORY_LABELS[category] ?? {};
      const forced = forcedCategoryLabels[category];
      acc[category] = {
        ...preset,
        ...existing,
        en: forced?.en || existing.en || preset.en || category,
        cn: forced?.cn || existing.cn || existing.en || preset.en || category,
      };
      return acc;
    }, {}),
  );

  const existingRules = new Map<string, Rule>();
  rulesSnap.docs.forEach((d) => existingRules.set(d.id, d.data() as Rule));
  const existingPersonas = new Map<string, Persona>();
  personasSnap.docs.forEach((d) => existingPersonas.set(d.id, d.data() as Persona));
  const presetRulesById = new Map<string, Rule>(
    INITIAL_RULES.map((rule) => [String(rule.id), rule]),
  );
  const presetPersonasById = new Map<string, Persona>(
    INITIAL_PERSONAS.map((persona) => [persona.id, persona]),
  );

  const batch = writeBatch(db);
  let dirty = false;

  if (!catSnap.exists() || JSON.stringify(existingCategories) !== JSON.stringify(canonicalCategories)) {
    batch.set(doc(db, 'workspace_data', scope, 'config', 'categories'), { list: canonicalCategories });
    dirty = true;
  }
  if (!catLabelsSnap.exists() || JSON.stringify(existingCategoryLabels) !== JSON.stringify(canonicalCategoryLabels)) {
    batch.set(doc(db, 'workspace_data', scope, 'config', 'category_labels'), { map: stripUndefined(canonicalCategoryLabels) });
    dirty = true;
  }

  rulesSnap.docs.forEach((d) => {
    const rule = d.data() as Rule;
    const mappedCategory = mapToCanonicalCategory(rule.category);
    const shouldLocalizeSystemRuleCountry =
      scope !== 'GLOBAL' &&
      rule.createdByEmail === SYSTEM_RULE_AUTHOR_EMAIL &&
      (rule.createdByCountry ?? 'GLOBAL') === 'GLOBAL';
    if (rule.category === mappedCategory && !shouldLocalizeSystemRuleCountry) return;
    batch.set(
      d.ref,
      stripUndefined({
        ...rule,
        category: mappedCategory,
        createdByCountry: shouldLocalizeSystemRuleCountry
          ? (scope as CountryCode)
          : rule.createdByCountry,
        updatedAt: new Date().toISOString(),
      }),
    );
    dirty = true;
  });

  tasksSnap.docs.forEach((d) => {
    const task = d.data() as Task;
    const mappedCategory = mapToCanonicalCategory(task.category);
    if (task.category === mappedCategory) return;
    batch.set(d.ref, stripUndefined({ ...task, category: mappedCategory }));
    dirty = true;
  });

  for (const [id, presetRule] of presetRulesById.entries()) {
    const existingPresetRule = existingRules.get(id);
    const scopedPresetRule: Rule =
      scope === 'GLOBAL'
        ? presetRule
        : {
            ...presetRule,
            createdByCountry: scope as CountryCode,
          };

    if (!existingPresetRule) {
      batch.set(doc(db, 'workspace_data', scope, 'rules', id), stripUndefined(scopedPresetRule));
      dirty = true;
      continue;
    }

    const existingUpdatedAt = existingPresetRule.updatedAt ?? existingPresetRule.createdAt ?? '';
    const existingCreatedAt = existingPresetRule.createdAt ?? '';
    const isSystemRule = existingPresetRule.createdByEmail === SYSTEM_RULE_AUTHOR_EMAIL;
    const isUntouchedSystemRule = isSystemRule && existingUpdatedAt === existingCreatedAt;

    if (!isUntouchedSystemRule) continue;

    const shouldRefreshPreset =
      existingPresetRule.name !== scopedPresetRule.name ||
      JSON.stringify(existingPresetRule.nameI18n ?? {}) !== JSON.stringify(scopedPresetRule.nameI18n ?? {}) ||
      existingPresetRule.category !== scopedPresetRule.category ||
      existingPresetRule.type !== scopedPresetRule.type ||
      existingPresetRule.targetSection !== scopedPresetRule.targetSection ||
      existingPresetRule.priority !== scopedPresetRule.priority ||
      existingPresetRule.severity !== scopedPresetRule.severity ||
      existingPresetRule.active !== scopedPresetRule.active ||
      JSON.stringify(existingPresetRule.referenceAsins ?? []) !== JSON.stringify(scopedPresetRule.referenceAsins ?? []) ||
      existingPresetRule.createdByCountry !== scopedPresetRule.createdByCountry;

    if (!shouldRefreshPreset) continue;

    batch.set(
      doc(db, 'workspace_data', scope, 'rules', id),
      stripUndefined({
        ...existingPresetRule,
        ...scopedPresetRule,
        // Keep initial creation timestamp stable for untouched system presets.
        createdAt: existingPresetRule.createdAt ?? scopedPresetRule.createdAt,
        updatedAt: new Date().toISOString(),
      }),
    );
    dirty = true;
  }

  for (const [id, presetPersona] of presetPersonasById.entries()) {
    if (existingPersonas.has(id)) continue;
    batch.set(doc(db, 'workspace_data', scope, 'personas', id), stripUndefined(presetPersona));
    dirty = true;
  }

  if (kwSnap.exists()) {
    const kwData = kwSnap.data() as { map?: KeywordMap; refAsins?: CategoryRefAsinMap };
    const existingKwMap = kwData.map ?? {};
    const existingRefAsinsMap = kwData.refAsins ?? {};

    const nextKwMap: KeywordMap = {};
    let kwMapDirty = false;
    Object.entries(existingKwMap).forEach(([rawCategory, set]) => {
      const mappedCategory = mapToCanonicalCategory(rawCategory);
      const prev = nextKwMap[mappedCategory] ?? { primary: '', secondary: [] };
      const mergedSecondary = uniqueStrings([...(prev.secondary ?? []), ...(set.secondary ?? [])]);
      if (rawCategory !== mappedCategory || nextKwMap[mappedCategory]) {
        kwMapDirty = true;
      }
      nextKwMap[mappedCategory] = {
        primary: prev.primary || set.primary || '',
        secondary: mergedSecondary,
      };
    });

    const nextRefAsinsMap: CategoryRefAsinMap = {};
    let refAsinDirty = false;
    Object.entries(existingRefAsinsMap).forEach(([rawCategory, asins]) => {
      const mappedCategory = mapToCanonicalCategory(rawCategory);
      const prev = nextRefAsinsMap[mappedCategory] ?? [];
      const merged = uniqueStrings([...prev, ...(asins ?? [])]);
      if (rawCategory !== mappedCategory || nextRefAsinsMap[mappedCategory]) {
        refAsinDirty = true;
      }
      nextRefAsinsMap[mappedCategory] = merged;
    });

    if (kwMapDirty || refAsinDirty) {
      batch.set(
        doc(db, 'workspace_data', scope, 'config', 'keywords'),
        stripUndefined({ map: nextKwMap, refAsins: nextRefAsinsMap }),
        { merge: true },
      );
      dirty = true;
    }
  }

  if (dirty) {
    await batch.commit();
  }
}

function scopedPriority(localScope: string, sourceCountry?: string): number {
  if (sourceCountry === localScope) return 0;
  if (sourceCountry === 'GLOBAL') return 1;
  return 2;
}

function orderSharedScopes(localScope: string): CountryCode[] {
  const unique = Array.from(new Set([localScope, ...SHARED_SCOPES])) as CountryCode[];
  return unique.sort((a, b) => {
    const pa = scopedPriority(localScope, a);
    const pb = scopedPriority(localScope, b);
    if (pa !== pb) return pa - pb;
    return a.localeCompare(b);
  });
}

// ── Real-time listeners ───────────────────────────────────────
export function subscribeSettings(
  cb: (settings: AppSettings) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    settingsDoc(),
    (snap) => {
      if (snap.exists()) cb(snap.data() as AppSettings);
    },
    (err) => {
      console.error('[Firestore] subscribeSettings:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeCategories(
  cb: (list: string[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    catDoc(),
    (snap) => {
      if (snap.exists()) cb((snap.data().list as string[]) ?? []);
    },
    (err) => {
      console.error('[Firestore] subscribeCategories:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeCategoryLabels(
  cb: (map: CategoryLabelMap) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    catLabelsDoc(),
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      cb((data.map as CategoryLabelMap) ?? {});
    },
    (err) => {
      console.error('[Firestore] subscribeCategoryLabels:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeKeywords(
  cb: (map: KeywordMap, refAsins: CategoryRefAsinMap) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    kwDoc(),
    (snap) => {
      const data = snap.exists() ? snap.data() : {};
      cb(
        (data.map as KeywordMap) ?? {},
        (data.refAsins as CategoryRefAsinMap) ?? {},
      );
    },
    (err) => {
      console.error('[Firestore] subscribeKeywords:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeSharedKeywords(
  cb: (items: Array<{ sourceCountry: CountryCode; map: KeywordMap; refAsins: CategoryRefAsinMap; updatedAt: string }>) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const localScope = requireWorkspaceScope();
  const scopes = orderSharedScopes(localScope);
  const byScope = new Map<CountryCode, { sourceCountry: CountryCode; map: KeywordMap; refAsins: CategoryRefAsinMap; updatedAt: string }>();

  const emit = () => {
    const ordered = scopes
      .map((scope) => byScope.get(scope))
      .filter((item): item is { sourceCountry: CountryCode; map: KeywordMap; refAsins: CategoryRefAsinMap; updatedAt: string } => Boolean(item));
    cb(ordered);
  };

  const unsubs = scopes.map((scope) =>
    onSnapshot(
      keywordDocByScope(scope),
      (snap) => {
        if (!snap.exists()) {
          byScope.delete(scope);
          emit();
          return;
        }
        const data = snap.data() as { map?: KeywordMap; refAsins?: CategoryRefAsinMap; updatedAt?: string };
        byScope.set(scope, {
          sourceCountry: scope,
          map: data.map ?? {},
          refAsins: data.refAsins ?? {},
          updatedAt: data.updatedAt ?? '',
        });
        emit();
      },
      (err) => {
        console.error(`[Firestore] subscribeSharedKeywords(${scope}):`, err);
        onError?.(err as Error);
      },
    ),
  );

  return () => unsubs.forEach((fn) => fn());
}

export function subscribeUserProfile(
  cb: (profile: UserProfile) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    profileDoc(),
    (snap) => {
      if (snap.exists()) cb(snap.data() as UserProfile);
    },
    (err) => {
      console.error('[Firestore] subscribeUserProfile:', err);
      onError?.(err as Error);
    },
  );
}

export function subscribeRules(
  cb: (rules: Rule[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const localScope = requireWorkspaceScope();
  const scopes = orderSharedScopes(localScope);
  const byScope = new Map<CountryCode, Rule[]>();

  const emit = () => {
    const byCountryAndId = new Map<string, Rule>();
    byScope.forEach((rules, scope) => {
      rules.forEach((raw) => {
        const normalizedCountry = (raw.createdByCountry ?? scope) as CountryCode;
        const normalized: Rule = { ...raw, createdByCountry: normalizedCountry };
        const key = `${normalized.createdByCountry ?? 'UNKNOWN'}:${normalized.id}`;
        const prev = byCountryAndId.get(key);
        if (!prev) {
          byCountryAndId.set(key, normalized);
          return;
        }
        const prevTs = prev.updatedAt ?? prev.createdAt ?? '';
        const nextTs = normalized.updatedAt ?? normalized.createdAt ?? '';
        if (nextTs > prevTs) byCountryAndId.set(key, normalized);
      });
    });

    const merged = Array.from(byCountryAndId.values()).sort((a, b) => {
      const pa = scopedPriority(localScope, a.createdByCountry);
      const pb = scopedPriority(localScope, b.createdByCountry);
      if (pa !== pb) return pa - pb;
      const ta = a.updatedAt ?? a.createdAt ?? '';
      const tb = b.updatedAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });
    cb(merged);
  };

  const unsubs = scopes.map((scope) =>
    onSnapshot(
      ruleColByScope(scope),
      (snap) => {
        byScope.set(scope, snap.docs.map((d) => d.data() as Rule));
        emit();
      },
      (err) => {
        console.error(`[Firestore] subscribeRules(${scope}):`, err);
        onError?.(err as Error);
      },
    ),
  );

  return () => unsubs.forEach((fn) => fn());
}

export function subscribePersonas(
  cb: (personas: Persona[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const localScope = requireWorkspaceScope();
  const scopes = orderSharedScopes(localScope);
  const byScope = new Map<CountryCode, Persona[]>();

  const emit = () => {
    const deduped = new Map<string, Persona>();
    byScope.forEach((personas, scope) => {
      personas.forEach((raw) => {
        const normalizedCountry = (raw.createdByCountry ?? scope) as CountryCode;
        const normalized: Persona = { ...raw, createdByCountry: normalizedCountry };
        const key = `${normalized.createdByCountry ?? 'UNKNOWN'}:${normalized.id}`;
        const prev = deduped.get(key);
        if (!prev) {
          deduped.set(key, normalized);
          return;
        }
        const prevTs = prev.updatedAt ?? prev.createdAt ?? '';
        const nextTs = normalized.updatedAt ?? normalized.createdAt ?? '';
        if (nextTs > prevTs) deduped.set(key, normalized);
      });
    });

    const merged = Array.from(deduped.values()).sort((a, b) => {
      const pa = scopedPriority(localScope, a.createdByCountry);
      const pb = scopedPriority(localScope, b.createdByCountry);
      if (pa !== pb) return pa - pb;
      const ta = a.updatedAt ?? a.createdAt ?? '';
      const tb = b.updatedAt ?? b.createdAt ?? '';
      return tb.localeCompare(ta);
    });
    cb(merged);
  };

  const unsubs = scopes.map((scope) =>
    onSnapshot(
      personaColByScope(scope),
      (snap) => {
        byScope.set(scope, snap.docs.map((d) => d.data() as Persona));
        emit();
      },
      (err) => {
        console.error(`[Firestore] subscribePersonas(${scope}):`, err);
        onError?.(err as Error);
      },
    ),
  );

  return () => unsubs.forEach((fn) => fn());
}

export function subscribeTasks(
  cb: (tasks: Task[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    taskCol(),
    (snap) => {
      cb(snap.docs.map((d) => d.data() as Task));
    },
    (err) => {
      console.error('[Firestore] subscribeTasks:', err);
      onError?.(err as Error);
    },
  );
}

// ── Audit logs ────────────────────────────────────────────────
export async function fsAppendApiKeyAuditLog(params: {
  model: string;
  maskedKey: string;
  actorEmail?: string;
  actorCountry?: CountryCode;
}): Promise<void> {
  const now = new Date().toISOString();
  const ref = doc(
    db,
    'workspace_data',
    requireWorkspaceScope(),
    'audit_logs',
    `api_key_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  );
  await setDoc(
    ref,
    stripUndefined({
      type: 'api_key_update',
      model: params.model,
      maskedKey: params.maskedKey,
      actorUid: requireUid(),
      actorEmail: params.actorEmail,
      actorCountry: params.actorCountry,
      workspaceScope: requireWorkspaceScope(),
      createdAt: now,
    }),
  );
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

export function fsSetCategoryLabels(map: CategoryLabelMap): void {
  setDoc(catLabelsDoc(), { map: stripUndefined(map) }, { merge: true }).catch(console.error);
}

// ── Keyword / RefAsin mutations ───────────────────────────────
export function fsSetKeywords(map: KeywordMap): void {
  setDoc(
    kwDoc(),
    { map: stripUndefined(map), updatedAt: new Date().toISOString() },
    { merge: true },
  ).catch(console.error);
}

export function fsSetCategoryRefAsins(refAsins: CategoryRefAsinMap): void {
  setDoc(
    kwDoc(),
    { refAsins: stripUndefined(refAsins), updatedAt: new Date().toISOString() },
    { merge: true },
  ).catch(console.error);
}

// ── Rule mutations ────────────────────────────────────────────
export function fsSetRule(rule: Rule): void {
  setDoc(
    doc(ruleCol(), String(rule.id)),
    stripUndefined({
      ...rule,
      category: mapToCanonicalCategory(rule.category),
    }),
  ).catch(console.error);
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
    stripUndefined({
      ...task,
      category: mapToCanonicalCategory(task.category),
      createdAt: task.createdAt ?? new Date().toISOString(),
    }),
  ).catch(console.error);
}

export function fsDeleteTask(id: string): void {
  deleteDoc(doc(taskCol(), id)).catch(console.error);
}
