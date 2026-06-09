import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { UserProfile } from '@/types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  /** true while onAuthStateChanged hasn't fired yet */
  authLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setAuthLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  profile: null,
  authLoading: true,
  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),
  setAuthLoading: (authLoading) => set({ authLoading }),
}));
