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
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  setCurrentUser,
  seedIfEmpty,
  subscribeSettings,
  subscribeCategories,
  subscribeRules,
  subscribePersonas,
  subscribeTasks,
} from '@/services/firestoreService';
import { INITIAL_SETTINGS } from '@/data/defaults';
import { useAuthStore }     from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useRulesStore }    from '@/store/rulesStore';
import { useTaskStore }     from '@/store/taskStore';

const TOTAL_SUBSCRIPTIONS = 5;

export function useFirestoreSync() {
  const setUser        = useAuthStore((s) => s.setUser);
  const setAuthLoading = useAuthStore((s) => s.setAuthLoading);

  const _setSettings   = useSettingsStore((s) => s._setSettings);
  const setCategories  = useRulesStore((s) => s.setCategories);
  const setRules       = useRulesStore((s) => s.setRules);
  const setPersonas    = useRulesStore((s) => s.setPersonas);
  const setTasks       = useTaskStore((s) => s.setTasks);
  const setLoading     = useTaskStore((s) => s.setLoading);

  useEffect(() => {
    let fsUnsubs: Array<() => void> = [];

    const stopFirestore = () => {
      fsUnsubs.splice(0).forEach((fn) => fn());
    };

    const startFirestore = async (uid: string) => {
      setCurrentUser(uid);
      setLoading(true);

      const fired = new Set<string>();
      const markFired = (name: string) => {
        if (fired.has(name)) return;
        fired.add(name);
        if (fired.size === TOTAL_SUBSCRIPTIONS) setLoading(false);
      };

      try {
        await seedIfEmpty();
      } catch (err) {
        console.error('[Firestore] seedIfEmpty failed:', err);
      }

      fsUnsubs = [
        subscribeSettings((s)   => { _setSettings(s);   markFired('settings');   }),
        subscribeCategories((l) => { setCategories(l);  markFired('categories'); }),
        subscribeRules((r)      => { setRules(r);        markFired('rules');      }),
        subscribePersonas((p)   => { setPersonas(p);     markFired('personas');   }),
        subscribeTasks((t)      => { setTasks(t);        markFired('tasks');      }),
      ];
    };

    const clearStores = () => {
      setCurrentUser(null);
      _setSettings(INITIAL_SETTINGS);
      setCategories([]);
      setRules([]);
      setPersonas([]);
      setTasks([]);
      setLoading(false);
    };

    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthLoading(false);

      stopFirestore();

      if (user) {
        startFirestore(user.uid);
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
