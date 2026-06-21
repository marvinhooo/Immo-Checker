import { create } from 'zustand';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { buildAuthRedirectUrl } from '../lib/authRedirect';

export interface Profile {
  id: string;
  is_admin: boolean;
  approved: boolean;
  created_at: string;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  authView: 'login' | 'register' | 'reset' | 'set-password';

  setAuthView: (view: AuthState['authView']) => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (newPassword: string) => Promise<string | null>;
  initialize: () => () => void;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  session: null,
  profile: null,
  isLoading: true,
  authView: 'login',

  setAuthView: (view) => set({ authView: view }),

  refreshProfile: async () => {
    const user = get().user;
    if (!user) {
      set({ profile: null });
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, is_admin, approved, created_at')
      .eq('id', user.id)
      .single();
    if (error) console.error('Profile fetch error:', error.message);
    set({ profile: data ?? null });
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    return null;
  },

  signUp: async (email, password) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: buildAuthRedirectUrl() },
    });
    if (error) return error.message;
    return null;
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, session: null, profile: null, authView: 'login' });
  },

  resetPassword: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: buildAuthRedirectUrl(),
    });
    if (error) return error.message;
    return null;
  },

  updatePassword: async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return error.message;
    return null;
  },

  initialize: () => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      set({ session, user: session?.user ?? null, isLoading: false });
      if (session?.user) get().refreshProfile();
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      set({ session, user: session?.user ?? null });

      if (event === 'PASSWORD_RECOVERY') {
        set({ authView: 'set-password' });
      }

      if (session?.user) {
        get().refreshProfile();
      } else {
        set({ profile: null });
      }
    });

    return () => subscription.unsubscribe();
  },
}));
