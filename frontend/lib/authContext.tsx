'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, setAuthToken } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { UserProfile, UserRole, AuthTokenResponse } from '@/lib/types';

export const DEFAULT_GUEST_PROFILE: UserProfile = {
  id: 'guest-evaluator',
  email: 'evaluator@kompetisi-lrip.id',
  role: 'GUEST',
  org_name: 'Kompetisi LRIP Demo Sandbox',
  name: 'Evaluator Sandbox (Guest)',
  permissions: [
    'all:sandbox',
    'benchmark:read',
    'scenarios:run',
    'simulation:write',
    'approvals:write',
    'fleet:read',
    'routes:plan',
    'reports:read',
    'reports:export',
  ],
  is_offline_guest: true,
};

interface AuthContextType {
  user: UserProfile;
  token: string | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  switchRole: (role: UserRole) => Promise<void>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  loginWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'prehub_auth_token';
const ROLE_STORAGE_KEY = 'prehub_auth_role';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(DEFAULT_GUEST_PROFILE);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const applyToken = useCallback((newToken: string | null, newUser: UserProfile) => {
    setTokenState(newToken);
    setUser(newUser);
    setAuthToken(newToken);
    if (typeof window !== 'undefined') {
      if (newToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
        localStorage.setItem(ROLE_STORAGE_KEY, newUser.role);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(ROLE_STORAGE_KEY);
      }
    }
  }, []);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
        const storedRole = typeof window !== 'undefined' ? (localStorage.getItem(ROLE_STORAGE_KEY) as UserRole) : null;

        if (storedToken) {
          setAuthToken(storedToken);
          try {
            const profile = await api.auth.me();
            if (isMounted && profile) {
              setTokenState(storedToken);
              setUser(profile);
              setIsLoading(false);
              return;
            }
          } catch (err) {
            console.warn('Stored token expired or invalid, regenerating fresh persona session:', err);
          }
        }

        // Generate clean session for stored role or default GUEST
        const targetRole = storedRole || 'GUEST';
        try {
          const res = await api.auth.createGuestSession({ role: targetRole });
          if (isMounted && res && res.access_token) {
            applyToken(res.access_token, res.user);
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.warn('Backend guest-session endpoint offline, using local fallback context:', e);
        }

        if (isMounted) {
          applyToken(null, DEFAULT_GUEST_PROFILE);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Auth initialization fallback:', err);
        if (isMounted) {
          setUser(DEFAULT_GUEST_PROFILE);
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, [applyToken]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const switchRole = useCallback(
    async (newRole: UserRole) => {
      setIsLoading(true);
      try {
        const res = await api.auth.switchRole(newRole);
        if (res && res.access_token) {
          applyToken(res.access_token, res.user);
        }
      } catch (err) {
        console.warn('Switch role API failed, applying local persona mock:', err);
        const mockProfile: UserProfile = {
          ...DEFAULT_GUEST_PROFILE,
          role: newRole,
          name:
            newRole === 'DISPATCHER'
              ? 'Budi Santoso (Lead Dispatcher)'
              : newRole === 'REGULATOR'
              ? 'Dr. Hendra Wijaya (Analis Ketahanan Pangan)'
              : 'Evaluator Sandbox (Guest)',
          org_name:
            newRole === 'DISPATCHER'
              ? 'PT Samudera Logistik Sumatra'
              : newRole === 'REGULATOR'
              ? 'Badan Pangan Nasional / Kemenhub'
              : 'Kompetisi LRIP Demo Sandbox',
        };
        applyToken(null, mockProfile);
      } finally {
        setIsLoading(false);
        setIsAuthModalOpen(false);
      }
    },
    [applyToken]
  );

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { data, error } = await sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          if (data.session) {
            const token = data.session.access_token;
            setAuthToken(token);
            const profile = await api.auth.me();
            applyToken(token, profile);
            setIsAuthModalOpen(false);
            return { success: true };
          }
        }

        // Offline / demo fallback login
        const res = await api.auth.createGuestSession({
          role: 'DISPATCHER',
          email,
          name: email.split('@')[0],
        });
        applyToken(res.access_token, res.user);
        setIsAuthModalOpen(false);
        return { success: true };
      } catch (err: any) {
        console.error('Login error:', err);
        return { success: false, error: err?.message || 'Gagal masuk. Periksa email dan kata sandi Anda.' };
      } finally {
        setIsLoading(false);
      }
    },
    [applyToken]
  );

  const signUp = useCallback(
    async (email: string, password: string, selectedRole: UserRole = 'DISPATCHER'): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { data, error } = await sb.auth.signUp({
            email,
            password,
            options: {
              data: { role: selectedRole },
            },
          });
          if (error) throw error;
          if (data.session) {
            const token = data.session.access_token;
            setAuthToken(token);
            const profile = await api.auth.me();
            applyToken(token, profile);
            setIsAuthModalOpen(false);
            return { success: true };
          }
        }

        // Demo fallback
        const res = await api.auth.createGuestSession({
          role: selectedRole,
          email,
          name: email.split('@')[0],
        });
        applyToken(res.access_token, res.user);
        setIsAuthModalOpen(false);
        return { success: true };
      } catch (err: any) {
        console.error('Sign up error:', err);
        return { success: false, error: err?.message || 'Gagal mendaftar akun baru.' };
      } finally {
        setIsLoading(false);
      }
    },
    [applyToken]
  );

  const loginWithMagicLink = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (sb) {
          const { error } = await sb.auth.signInWithOtp({ email });
          if (error) throw error;
          return { success: true };
        }

        // Demo fallback
        const res = await api.auth.createGuestSession({
          role: 'REGULATOR',
          email,
          name: email.split('@')[0],
        });
        applyToken(res.access_token, res.user);
        setIsAuthModalOpen(false);
        return { success: true };
      } catch (err: any) {
        console.error('Magic link error:', err);
        return { success: false, error: err?.message || 'Gagal mengirim tautan masuk.' };
      } finally {
        setIsLoading(false);
      }
    },
    [applyToken]
  );

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      const sb = getSupabaseClient();
      if (sb) {
        await sb.auth.signOut();
      }
      const res = await api.auth.createGuestSession({ role: 'GUEST' });
      applyToken(res.access_token, res.user);
    } catch (err) {
      console.warn('Logout fallback:', err);
      applyToken(null, DEFAULT_GUEST_PROFILE);
    } finally {
      setIsLoading(false);
    }
  }, [applyToken]);

  const value: AuthContextType = {
    user,
    token,
    role: user.role,
    isLoading,
    isAuthenticated: !user.is_offline_guest || token !== null,
    isAuthModalOpen,
    openAuthModal,
    closeAuthModal,
    switchRole,
    login,
    signUp,
    loginWithMagicLink,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
