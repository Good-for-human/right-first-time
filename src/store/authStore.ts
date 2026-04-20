import { create } from 'zustand';
import type { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  /** true while onAuthStateChanged hasn't fired yet */
  authLoading: boolean;
  setUser: (user: User | null) => void;
  setAuthLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  authLoading: true,
  setUser: (user) => set({ user }),
  setAuthLoading: (authLoading) => set({ authLoading }),
}));
