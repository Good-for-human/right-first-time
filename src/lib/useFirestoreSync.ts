/**
 * Single hook that owns both the Firebase Auth listener and the Firestore
 * real-time subscriptions.
 *
 * Lifecycle:
 *   1. onAuthStateChanged fires → update authStore
 *   2. If user present  → setCurrentUser(uid) → seedIfEmpty → 5× onSnapshot
 *   3. If user absent   → clear stores, stop any active Firestore listeners
 *   4. On user switch   → tear down old listeners, start fresh ones
 *
 * Ready-gate: a Set<string> so each of the 5 subscriptions is counted
 * exactly once (not on every subsequent snapshot update).
 *
 * Subscriptions:
 *   settings | categories | rules | personas | tasks
 */
import { useEffect } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  setCurrentUser,
  setCurrentWorkspaceScope,
  seedIfEmpty,
  applySystemPresets,
  ensureUserProfileByUid,
  ensureTaskCountryConsistency,
  subscribeUserProfile,
  subscribeSharedLibrary,
  subscribeCountryWorkspace,
  subscribeSettings,
  subscribeCategories,
  subscribeCategoryLabels,
  subscribeRules,
  subscribePersonas,
  subscribeTasks,
  subscribeKeywords,
  subscribeSharedKeywords,
} from '@/services/firestoreService';
import { INITIAL_SETTINGS } from '@/data/defaults';
import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRulesStore }    from '@/store/rulesStore';
import { useTaskStore }     from '@/store/taskStore';
import { useKeywordsStore } from '@/store/keywordsStore';
import { useWorkspaceLibraryStore } from '@/store/workspaceLibraryStore';
import type { BusinessCountryCode, CountryCode, SharedKeywordLibraryItem } from '@/types';

const pendingCountryStorageKey = (email: string) => `rft.pendingCountry.${email.trim().toLowerCase()}`;
const ADMIN_EMAIL = 'admin@tp-link.com';
const authNoticeStorageKey = 'rft.auth.notice';

export function useFirestoreSync() {
  const setUser        = useAuthStore((s) => s.setUser);
  const setProfile     = useAuthStore((s) => s.setProfile);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);

  const _setSettings   = useSettingsStore((s) => s._setSettings);
  const initSettingsScope = useSettingsStore((s) => s.initSettingsScope);
  const setCategories  = useRulesStore((s) => s.setCategories);
  const setCategoryLabels = useRulesStore((s) => s.setCategoryLabels);
  const setRules       = useRulesStore((s) => s.setRules);
  const setPersonas    = useRulesStore((s) => s.setPersonas);
  const setTasks       = useTaskStore((s) => s.setTasks);
  const setLoading     = useTaskStore((s) => s.setLoading);
  const setKeywords        = useKeywordsStore((s) => s.setKeywords);
  const setCategoryRefAsins = useKeywordsStore((s) => s.setCategoryRefAsins);
  const setSharedKeywordLibrary = useKeywordsStore((s) => s.setSharedKeywordLibrary);
  const setSharedLibrary = useWorkspaceLibraryStore((s) => s.setSharedLibrary);
  const setCountryWorkspaceItems = useWorkspaceLibraryStore((s) => s.setCountryWorkspaceItems);
  const clearWorkspaceLibrary = useWorkspaceLibraryStore((s) => s.clear);

  useEffect(() => {
    let fsUnsubs: Array<() => void> = [];

    const stopFirestore = () => {
      fsUnsubs.splice(0).forEach((fn) => fn());
    };

    const startFirestore = async (uid: string, email: string | null) => {
      setCurrentUser(uid);
      setLoading(true);
      let activeWorkspaceScope: string | null = null;

      const fired = new Set<string>();
      let expectedSubscriptions = 10;
      const markFired = (name: string) => {
        if (fired.has(name)) return;
        fired.add(name);
        if (fired.size === expectedSubscriptions) setLoading(false);
      };

      try {
        const safeEmail = (email ?? '').trim().toLowerCase();
        const preferredCountry = safeEmail
          ? (localStorage.getItem(pendingCountryStorageKey(safeEmail)) ?? undefined)
          : undefined;
        const bootProfile = await ensureUserProfileByUid({
          uid,
          email,
          preferredCountryCode: preferredCountry as BusinessCountryCode | undefined,
        });
        if (safeEmail && preferredCountry) {
          localStorage.removeItem(pendingCountryStorageKey(safeEmail));
        }
        const workspaceScope =
          bootProfile.role === 'admin'
            ? 'GLOBAL'
            : (bootProfile.countryCode as BusinessCountryCode);
        activeWorkspaceScope = workspaceScope;
        setCurrentWorkspaceScope(workspaceScope);
        initSettingsScope(workspaceScope);
        setProfile(bootProfile);
        if (bootProfile.role !== 'admin' && bootProfile.countryCode !== 'GLOBAL') {
          await ensureTaskCountryConsistency(bootProfile.countryCode as BusinessCountryCode);
        }
        if (bootProfile.role !== 'admin' && bootProfile.countryCode !== 'GLOBAL') {
          expectedSubscriptions += 1;
        }
        await seedIfEmpty();
        await applySystemPresets();
      } catch (err) {
        console.error('[Firestore] seedIfEmpty failed:', err);
        // Rules misconfigured → don't leave the UI spinning forever.
        setLoading(false);
        return;
      }

      // Count a subscription as "ready" even on permission errors so the
      // loading gate can clear; data will stay empty until rules are fixed.
      const markReady = (name: string) => () => markFired(name);

      fsUnsubs = [
        subscribeUserProfile((p) => {
          const nextScope =
            p.role === 'admin'
              ? 'GLOBAL'
              : (p.countryCode as BusinessCountryCode);
          const scopeChanged = activeWorkspaceScope !== null && nextScope !== activeWorkspaceScope;
          setProfile(p);
          if (scopeChanged) {
            activeWorkspaceScope = nextScope;
            setCurrentWorkspaceScope(nextScope);
            initSettingsScope(nextScope);
            // Prevent stale old-country data from staying visible while re-subscribing.
            setCategories([]);
            setCategoryLabels({});
            setRules([]);
            setPersonas([]);
            setTasks([]);
            setKeywords({});
            setCategoryRefAsins({});
            setSharedKeywordLibrary({});
            clearWorkspaceLibrary();
            setLoading(true);
            setTimeout(() => {
              stopFirestore();
              void startFirestore(uid, email);
            }, 0);
            return;
          }
          markFired('profile');
        }, markReady('profile')),
        subscribeSharedLibrary((items) => { setSharedLibrary(items); markFired('sharedLibrary'); }, markReady('sharedLibrary')),
        subscribeSettings((s) => { _setSettings(s); markFired('settings'); }, markReady('settings')),
        subscribeCategories((l) => { setCategories(l); markFired('categories'); }, markReady('categories')),
        subscribeCategoryLabels((m) => { setCategoryLabels(m); markFired('categoryLabels'); }, markReady('categoryLabels')),
        subscribeRules((r) => { setRules(r); markFired('rules'); }, markReady('rules')),
        subscribePersonas((p) => { setPersonas(p); markFired('personas'); }, markReady('personas')),
        subscribeTasks((t) => { setTasks(t); markFired('tasks'); }, markReady('tasks')),
        subscribeKeywords(
          (m, r) => { setKeywords(m); setCategoryRefAsins(r); markFired('keywords'); },
          markReady('keywords'),
        ),
        subscribeSharedKeywords(
          (items) => {
            const mapped = items.reduce<Partial<Record<CountryCode, SharedKeywordLibraryItem>>>((acc, item) => {
              acc[item.sourceCountry] = item;
              return acc;
            }, {});
            setSharedKeywordLibrary(mapped);
            markFired('sharedKeywords');
          },
          markReady('sharedKeywords'),
        ),
      ];
      const currentProfile = useAuthStore.getState().profile;
      if (currentProfile && currentProfile.role !== 'admin' && currentProfile.countryCode !== 'GLOBAL') {
        fsUnsubs.push(
          subscribeCountryWorkspace(
            currentProfile.countryCode as BusinessCountryCode,
            (items) => { setCountryWorkspaceItems(items); markFired('countryWorkspace'); },
            markReady('countryWorkspace'),
          ),
        );
      } else {
        setCountryWorkspaceItems([]);
      }

      // Safety net: if settings/categories docs don't exist yet, their
      // listeners never call the success cb — unblock after 5 s regardless.
      setTimeout(() => {
        if (fired.size < expectedSubscriptions) setLoading(false);
      }, 5000);
    };

    const clearStores = () => {
      setCurrentUser(null);
      setCurrentWorkspaceScope(null);
      initSettingsScope(null);
      _setSettings(INITIAL_SETTINGS);
      setProfile(null);
      setCategories([]);
      setCategoryLabels({});
      setRules([]);
      setPersonas([]);
      setTasks([]);
      setKeywords({});
      setCategoryRefAsins({});
      setSharedKeywordLibrary({});
      clearWorkspaceLibrary();
      setLoading(false);
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      stopFirestore();

      const normalizedEmail = user?.email?.trim().toLowerCase() ?? null;
      const bypassVerification = normalizedEmail === ADMIN_EMAIL;
      let isRegistrationBootstrap = false;
      if (normalizedEmail) {
        try {
          isRegistrationBootstrap = localStorage.getItem(pendingCountryStorageKey(normalizedEmail)) != null;
        } catch {
          isRegistrationBootstrap = false;
        }
      }
      if (user && !bypassVerification && !user.emailVerified && !isRegistrationBootstrap) {
        try {
          localStorage.setItem(
            authNoticeStorageKey,
            'Email is not verified yet. Please verify your email before logging in. If you cannot find the email, check your Spam/Junk folder.',
          );
        } catch {
          // ignore localStorage failures
        }
        setUser(null);
        setAuthLoading(false);
        clearStores();
        void signOut(auth);
        return;
      }

      setUser(user);
      setAuthLoading(false);

      if (user) {
        startFirestore(user.uid, user.email);
      } else {
        clearStores();
      }
    });

    return () => {
      unsubAuth();
      stopFirestore();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
