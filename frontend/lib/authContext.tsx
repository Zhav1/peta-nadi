'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { api, setAuthToken } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabaseClient';
import type { UserProfile, UserRole, AuthTokenResponse } from '@/lib/types';

// Unauthenticated visitors enter a restricted guest mode: no operational
// permissions are granted until a verified session (login/signup) exists.
export const DEFAULT_GUEST_PROFILE: UserProfile = {
  id: 'guest-evaluator',
  email: 'evaluator@kompetisi-lrip.id',
  role: 'GUEST',
  org_name: 'Kompetisi LRIP Demo Sandbox',
  name: 'Evaluator Sandbox (Guest)',
  permissions: [],
  is_offline_guest: true,
};

export const GUEST_LOCK_MESSAGE =
  'Diperlukan autentikasi akun resmi untuk beralih peran operasional.';

interface AuthContextType {
  user: UserProfile;
  token: string | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  switchRole: (role: UserRole) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  loginWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'prehub_auth_token';
const TOKEN_COOKIE_MAX_AGE_SECONDS = 172800; // 48 hours, mirrors backend session TTL

// Keep the middleware-readable auth cookie in lockstep with the stored token so
// /dashboard route protection never sees a stale session state.
function syncAuthCookie(nextToken: string | null) {
  if (typeof document === 'undefined') return;
  const cookieName = TOKEN_STORAGE_KEY;
  if (nextToken) {
    document.cookie = `${cookieName}=${nextToken}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE_SECONDS}; samesite=lax`;
  } else {
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax`;
  }
}

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
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    syncAuthCookie(newToken);
  }, []);

  // Initialize session on mount
  useEffect(() => {
    let isMounted = true;

    async function initAuth() {
      try {
        const storedToken = typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;

        if (storedToken) {
          setAuthToken(storedToken);
          try {
            const profile = await api.auth.me();
            if (isMounted && profile) {
              setTokenState(storedToken);
              setUser(profile);
              syncAuthCookie(storedToken);
              setIsLoading(false);
              return;
            }
          } catch (err) {
            console.warn('Stored session could not be verified, requiring re-authentication:', err);
            setAuthToken(null);
          }
        }

        // No valid stored session: enter restricted guest mode. No operational
        // sandbox token or elevated permissions are auto-assigned.
        if (isMounted) {
          applyToken(null, DEFAULT_GUEST_PROFILE);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('Auth initialization fallback:', err);
        if (isMounted) {
          applyToken(null, DEFAULT_GUEST_PROFILE);
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
    async (newRole: UserRole): Promise<{ success: boolean; error?: string }> => {
      // Persona flipping is an operational capability: it requires an active,
      // verified session token. Unauthenticated guests are rejected outright.
      if (!token) {
        return { success: false, error: GUEST_LOCK_MESSAGE };
      }

      setIsLoading(true);
      try {
        const res = await api.auth.switchRole(newRole);
        if (!res || !res.access_token) {
          return { success: false, error: 'Server tidak mengembalikan sesi peran baru.' };
        }
        applyToken(res.access_token, res.user);
        return { success: true };
      } catch (err) {
        console.warn('Switch role API failed:', err);
        return {
          success: false,
          error: 'Gagal beralih peran: sesi autentikasi tidak dapat diverifikasi oleh server.',
        };
      } finally {
        setIsLoading(false);
      }
    },
    [token, applyToken]
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
    } catch (err) {
      console.warn('Logout notice:', err);
    } finally {
      // Logout always returns to the unauthenticated guest state: no token and
      // no operational permissions are retained or auto-issued.
      applyToken(null, DEFAULT_GUEST_PROFILE);
      setIsLoading(false);
    }
  }, [applyToken]);

  const value: AuthContextType = {
    user,
    token,
    role: user.role,
    isLoading,
    isAuthenticated: token !== null,
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
