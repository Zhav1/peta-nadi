'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { api, setAuthToken } from '@/lib/api';
import { getSupabaseClient } from '@/lib/supabaseClient';
import { dashboardIdentityKey, dashboardMemoryCache } from '@/lib/dashboardMemoryCache';
import type { UserProfile, UserRole } from '@/lib/types';

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

const AUTH_SERVICE_UNAVAILABLE_MESSAGE = 'Layanan autentikasi database sedang tidak tersedia';

// Shown when a supplied credential was rejected (401) — never silently guest.
const REAUTH_NOTICE =
  'Sesi Anda telah berakhir atau tidak valid. Silakan masuk kembali untuk melanjutkan.';

function isAuthServiceUnavailable(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  const candidate = err as { status?: number; name?: string } | null;
  return candidate?.status === 0 || candidate?.name === 'AuthRetryableFetchError';
}

/** A 401 from the backend means the token is dead; other errors are transient. */
function isUnauthorized(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 401;
}

interface AuthContextType {
  user: UserProfile;
  token: string | null;
  role: UserRole;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAuthModalOpen: boolean;
  authNotice: string | null;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  clearAuthNotice: () => void;
  switchRole: (role: UserRole) => Promise<{ success: boolean; error?: string }>;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, role?: UserRole, companyId?: string) => Promise<{ success: boolean; error?: string }>;
  loginWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'prehub_auth_token';
// Phase 161 (M8 decision #12): 7-day sliding cookie. The Supabase access token
// lives ~1h, so the cookie must be renewed on every TOKEN_REFRESHED; a 48h cookie
// around a 1h token was the root cause of the "silent guest" failure.
const TOKEN_COOKIE_MAX_AGE_SECONDS = 604800; // 7 days

const ROLE_ORG_FALLBACK: Record<UserRole, string> = {
  DISPATCHER: 'PT Samudera Logistik Sumatra',
  REGULATOR: 'Badan Pangan Nasional / Kemenhub',
  GUEST: 'Kompetisi LRIP Demo Sandbox',
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeRole(raw: unknown): UserRole {
  const candidate = String(raw ?? 'GUEST').toUpperCase();
  return candidate === 'DISPATCHER' || candidate === 'REGULATOR' ? candidate : 'GUEST';
}

/**
 * Optimistic profile from the JWT claims themselves, so first paint does not wait
 * for `/auth/me`. The backend still owns authorization; `/auth/me` reconciles and
 * corrects this shape (and clears the session on 401).
 */
function profileFromToken(token: string): UserProfile | null {
  const payload = decodeJwtPayload(token);
  if (!payload) return null;

  const appMeta = (payload.app_metadata ?? {}) as Record<string, unknown>;
  const userMeta = (payload.user_metadata ?? {}) as Record<string, unknown>;
  const role = normalizeRole(appMeta.role ?? userMeta.role);
  const email = typeof payload.email === 'string' ? payload.email : '';
  const exp = typeof payload.exp === 'number' ? payload.exp : undefined;

  return {
    id: String(payload.sub ?? (email || `${role.toLowerCase()}-session`)),
    email,
    role,
    company_id:
      (typeof appMeta.company_id === 'string' && appMeta.company_id) ||
      (typeof userMeta.company_id === 'string' && userMeta.company_id) ||
      undefined,
    org_name:
      (typeof appMeta.org_name === 'string' && appMeta.org_name) ||
      (typeof userMeta.org_name === 'string' && userMeta.org_name) ||
      ROLE_ORG_FALLBACK[role],
    name:
      (typeof userMeta.name === 'string' && userMeta.name) ||
      (typeof userMeta.full_name === 'string' && userMeta.full_name) ||
      email ||
      ROLE_ORG_FALLBACK[role],
    permissions: Array.isArray(appMeta.permissions) ? (appMeta.permissions as string[]) : [],
    is_offline_guest: appMeta.provider === 'guest_session' || payload.iss === 'prehub-auth-engine',
    exp,
  };
}

// Keep the middleware-readable auth cookie in lockstep with the stored token so
// /dashboard route protection never sees a stale session state.
function syncAuthCookie(nextToken: string | null) {
  if (typeof document === 'undefined') return;
  const cookieName = TOKEN_STORAGE_KEY;
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; secure' : '';
  if (nextToken) {
    document.cookie = `${cookieName}=${nextToken}; path=/; max-age=${TOKEN_COOKIE_MAX_AGE_SECONDS}; samesite=lax${secure}`;
  } else {
    document.cookie = `${cookieName}=; path=/; max-age=0; samesite=lax${secure}`;
  }
}

/**
 * A verified session supersedes the middleware's `?guest=1` flag. The middleware
 * cannot cryptographically verify the cookie, so a stale cookie sends the first
 * server render to `?guest=1`; once the client has a real session this strips the
 * flag without a Next.js navigation (history.replaceState does not remount).
 */
function clearGuestQueryFlag() {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('guest')) return;
    url.searchParams.delete('guest');
    window.history.replaceState(
      window.history.state,
      '',
      `${url.pathname}${url.search}${url.hash}`,
    );
  } catch {
    /* history is best-effort: never let URL cleanup break auth */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(DEFAULT_GUEST_PROFILE);
  const [token, setTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const tokenRef = useRef<string | null>(null);
  // Monotonic counter: any async completion from an older generation is dropped.
  // Logout increments it first, so an in-flight login cannot resurrect the session.
  const authGenerationRef = useRef(0);
  const intentionalSignOutRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /** Single write path for token + profile + transport + persistence. */
  const commitAuth = useCallback((nextToken: string | null, nextUser: UserProfile) => {
    dashboardMemoryCache.setIdentity(
      nextToken
        ? dashboardIdentityKey({ id: nextUser.id, role: nextUser.role, companyId: nextUser.company_id })
        : null,
    );
    tokenRef.current = nextToken;
    setAuthToken(nextToken);
    if (isMountedRef.current) {
      setTokenState(nextToken);
      setUser(nextUser);
    }
    if (typeof window !== 'undefined') {
      if (nextToken) {
        localStorage.setItem(TOKEN_STORAGE_KEY, nextToken);
      } else {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }
    syncAuthCookie(nextToken);
    if (nextToken) clearGuestQueryFlag();
  }, []);

  /**
   * Background reconciliation with the authoritative backend. Never blocks first
   * paint: the optimistic JWT profile is already rendering. A 401 clears the
   * session and asks for re-authentication; a 5xx/network error keeps it.
   */
  const reconcileProfile = useCallback(
    async (accessToken: string, generation: number) => {
      if (generation !== authGenerationRef.current) return;
      setAuthToken(accessToken);
      try {
        const profile = await api.auth.me();
        if (!isMountedRef.current || generation !== authGenerationRef.current) return;
        if (profile) setUser(profile);
      } catch (err) {
        if (generation !== authGenerationRef.current) return;
        if (isUnauthorized(err)) {
          // Dead token: clear it and demand re-auth. Never downgrade silently.
          authGenerationRef.current += 1;
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          if (isMountedRef.current) {
            setAuthNotice(REAUTH_NOTICE);
            setIsAuthModalOpen(true);
          }
          return;
        }
        console.warn('Session reconciliation deferred (backend unavailable):', err);
      }
    },
    [commitAuth],
  );

  // ---------------------------------------------------------------------------
  // Boot: Supabase session first; localStorage only as a migration fallback.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const sb = getSupabaseClient();

      // 1) Supabase owns the session. getSession() reads its own storage and
      //    refreshes an expired access token while a refresh token is valid.
      if (sb) {
        try {
          const { data } = await sb.auth.getSession();
          if (cancelled) return;
          const session = data.session;
          if (session?.access_token) {
            const optimistic = profileFromToken(session.access_token);
            if (optimistic) {
              commitAuth(session.access_token, optimistic);
              setIsLoading(false);
              void reconcileProfile(session.access_token, authGenerationRef.current);
              return;
            }
          }
        } catch (err) {
          console.warn('Supabase getSession failed; trying the stored token:', err);
        }
      }

      // 2) Migration path only: a token persisted by an older build. Validate it
      //    against /auth/me so an expired token cannot masquerade as a session.
      const legacyToken =
        typeof window !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;

      if (legacyToken && !cancelled) {
        setAuthToken(legacyToken);
        try {
          const profile = await api.auth.me();
          if (cancelled || !isMountedRef.current) return;
          if (profile) {
            commitAuth(legacyToken, profile);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          if (cancelled) return;
          if (isUnauthorized(err)) {
            // Stored token is invalid: clear it and show an explicit re-auth state.
            commitAuth(null, DEFAULT_GUEST_PROFILE);
            setAuthNotice(REAUTH_NOTICE);
            setIsAuthModalOpen(true);
            setIsLoading(false);
            return;
          }
          // Backend cold/unreachable: hydrate from claims rather than blocking the
          // app on a health check, and let the next call reconcile.
          const optimistic = profileFromToken(legacyToken);
          if (optimistic) {
            console.warn('Stored session could not be verified yet; using JWT claims.');
            commitAuth(legacyToken, optimistic);
            setIsLoading(false);
            void reconcileProfile(legacyToken, authGenerationRef.current);
            return;
          }
          // A stored token we cannot even parse is not a session: clear it and ask
          // for an explicit sign-in instead of degrading to guest.
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          setAuthNotice(REAUTH_NOTICE);
          setIsAuthModalOpen(true);
          setIsLoading(false);
          return;
        }
      }

      // 3) No session at all: restricted guest mode (no operational permissions).
      if (!cancelled) {
        commitAuth(null, DEFAULT_GUEST_PROFILE);
        setIsLoading(false);
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [commitAuth, reconcileProfile]);

  // ---------------------------------------------------------------------------
  // Supabase auth events: every SIGNED_IN / TOKEN_REFRESHED writes the new token
  // to localStorage AND the cookie (7-day sliding). Magic-link landings arrive as
  // SIGNED_IN via detectSessionInUrl — no manual login step required.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sb = getSupabaseClient();
    if (!sb) return;

    const { data } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        const wasIntentional = intentionalSignOutRef.current;
        intentionalSignOutRef.current = false;
        authGenerationRef.current += 1;
        commitAuth(null, DEFAULT_GUEST_PROFILE);
        if (!wasIntentional && isMountedRef.current) {
          setAuthNotice(REAUTH_NOTICE);
          setIsAuthModalOpen(true);
        }
        return;
      }

      if (!session?.access_token) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        const generation = authGenerationRef.current;
        const optimistic = profileFromToken(session.access_token);
        if (!optimistic) return;

        // Optimistic first, reconcile after: first paint never waits on /auth/me.
        commitAuth(session.access_token, optimistic);
        setAuthNotice(null);
        setIsLoading(false);
        if (event === 'SIGNED_IN') setIsAuthModalOpen(false);
        void reconcileProfile(session.access_token, generation);
      }
    });

    // Phase 161: the listener must not survive the provider.
    return () => {
      data.subscription.unsubscribe();
    };
  }, [commitAuth, reconcileProfile]);

  // ---------------------------------------------------------------------------
  // Cross-tab sync: login/refresh in one tab propagates; logout in one tab clears
  // the others (including the Supabase session, so a reload cannot resurrect it).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_STORAGE_KEY || event.storageArea !== window.localStorage) return;

      if (!event.newValue) {
        authGenerationRef.current += 1;
        commitAuth(null, DEFAULT_GUEST_PROFILE);
        setIsLoading(false);
        const sb = getSupabaseClient();
        if (sb) {
          intentionalSignOutRef.current = true;
          void sb.auth.signOut({ scope: 'local' }).catch(() => {
            intentionalSignOutRef.current = false;
          });
        }
        return;
      }

      if (event.newValue === tokenRef.current) return;
      const optimistic = profileFromToken(event.newValue);
      if (!optimistic) return;

      authGenerationRef.current += 1;
      commitAuth(event.newValue, optimistic);
      setIsLoading(false);
      void reconcileProfile(event.newValue, authGenerationRef.current);
    };

    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [commitAuth, reconcileProfile]);

  const openAuthModal = useCallback(() => setIsAuthModalOpen(true), []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);
  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);

  const switchRole = useCallback(
    async (newRole: UserRole): Promise<{ success: boolean; error?: string }> => {
      // Persona flipping is an operational capability: it requires an active,
      // verified session token. Unauthenticated guests are rejected outright.
      if (!token) {
        return { success: false, error: GUEST_LOCK_MESSAGE };
      }

      const generation = ++authGenerationRef.current;
      setIsLoading(true);
      try {
        const res = await api.auth.switchRole(newRole);
        if (!res || !res.access_token) {
          return { success: false, error: 'Server tidak mengembalikan sesi peran baru.' };
        }
        if (generation !== authGenerationRef.current || !isMountedRef.current) {
          return { success: false, error: 'Pergantian peran dibatalkan.' };
        }
        commitAuth(res.access_token, res.user);
        setAuthNotice(null);
        return { success: true };
      } catch (err) {
        console.warn('Switch role API failed:', err);
        return {
          success: false,
          error: isUnauthorized(err)
            ? 'Sesi Anda tidak valid lagi. Silakan masuk kembali.'
            : 'Gagal beralih peran: sesi autentikasi tidak dapat diverifikasi oleh server.',
        };
      } finally {
        if (isMountedRef.current && generation === authGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [token, commitAuth],
  );

  const login = useCallback(
    async (email: string, password: string): Promise<{ success: boolean; error?: string }> => {
      const generation = ++authGenerationRef.current;
      intentionalSignOutRef.current = false;
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (!sb) {
          return { success: false, error: AUTH_SERVICE_UNAVAILABLE_MESSAGE };
        }

        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session) {
          return { success: false, error: AUTH_SERVICE_UNAVAILABLE_MESSAGE };
        }
        if (generation !== authGenerationRef.current) {
          // A logout landed while sign-in was in flight. Supabase has already
          // persisted the session, so purge it locally as well — otherwise the
          // next boot would resurrect it through getSession().
          intentionalSignOutRef.current = true;
          void sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          return { success: false, error: 'Proses masuk dibatalkan.' };
        }
        if (!isMountedRef.current) {
          return { success: false, error: 'Proses masuk dibatalkan.' };
        }

        const accessToken = data.session.access_token;
        const optimistic = profileFromToken(accessToken);
        if (optimistic) {
          commitAuth(accessToken, optimistic);
          setAuthNotice(null);
          setIsAuthModalOpen(false);
          setIsLoading(false); // release the form; /auth/me reconciles in the background
          void reconcileProfile(accessToken, generation);
          return { success: true };
        }

        // Unparseable JWT (should not happen): fall back to the authoritative call.
        setAuthToken(accessToken);
        const profile = await api.auth.me();
        if (generation !== authGenerationRef.current) {
          intentionalSignOutRef.current = true;
          void sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          return { success: false, error: 'Proses masuk dibatalkan.' };
        }
        if (!isMountedRef.current) {
          return { success: false, error: 'Proses masuk dibatalkan.' };
        }
        commitAuth(accessToken, profile);
        setIsAuthModalOpen(false);
        return { success: true };
      } catch (err: any) {
        console.error('Login error:', err);
        return {
          success: false,
          error: isAuthServiceUnavailable(err)
            ? AUTH_SERVICE_UNAVAILABLE_MESSAGE
            : err?.message || 'Gagal masuk. Periksa email dan kata sandi Anda.',
        };
      } finally {
        if (isMountedRef.current && generation === authGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [commitAuth, reconcileProfile],
  );

  const signUp = useCallback(
    async (
      email: string,
      password: string,
      selectedRole: UserRole = 'GUEST',
      companyId?: string,
    ): Promise<{ success: boolean; error?: string }> => {
      const generation = ++authGenerationRef.current;
      intentionalSignOutRef.current = false;
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (!sb) {
          return { success: false, error: AUTH_SERVICE_UNAVAILABLE_MESSAGE };
        }

        const effectiveCompanyId = companyId || 'demo_sandbox';

        const { data, error } = await sb.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: selectedRole,
              company_id: effectiveCompanyId,
            },
          },
        });
        if (error) throw error;
        if (!data.session) {
          return {
            success: false,
            error:
              'Pendaftaran diterima. Periksa email Anda untuk konfirmasi sebelum masuk.',
          };
        }
        if (generation !== authGenerationRef.current) {
          intentionalSignOutRef.current = true;
          void sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          return { success: false, error: 'Proses pendaftaran dibatalkan.' };
        }
        if (!isMountedRef.current) {
          return { success: false, error: 'Proses pendaftaran dibatalkan.' };
        }

        const accessToken = data.session.access_token;
        const optimistic = profileFromToken(accessToken);
        if (optimistic) {
          commitAuth(accessToken, optimistic);
          setAuthNotice(null);
          setIsAuthModalOpen(false);
          setIsLoading(false);
          void reconcileProfile(accessToken, generation);
          return { success: true };
        }

        setAuthToken(accessToken);
        const profile = await api.auth.me();
        if (generation !== authGenerationRef.current) {
          intentionalSignOutRef.current = true;
          void sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
          commitAuth(null, DEFAULT_GUEST_PROFILE);
          return { success: false, error: 'Proses pendaftaran dibatalkan.' };
        }
        if (!isMountedRef.current) {
          return { success: false, error: 'Proses pendaftaran dibatalkan.' };
        }
        commitAuth(accessToken, profile);
        setIsAuthModalOpen(false);
        return { success: true };
      } catch (err: any) {
        console.error('Sign up error:', err);
        return {
          success: false,
          error: isAuthServiceUnavailable(err)
            ? AUTH_SERVICE_UNAVAILABLE_MESSAGE
            : err?.message || 'Gagal mendaftar akun baru.',
        };
      } finally {
        if (isMountedRef.current && generation === authGenerationRef.current) {
          setIsLoading(false);
        }
      }
    },
    [commitAuth, reconcileProfile],
  );

  const loginWithMagicLink = useCallback(
    async (email: string): Promise<{ success: boolean; error?: string }> => {
      // No session exists yet: this only sends the email. The session is applied
      // by the SIGNED_IN event when the user follows the link (detectSessionInUrl),
      // so the caller must NOT treat this as "logged in".
      setIsLoading(true);
      try {
        const sb = getSupabaseClient();
        if (!sb) {
          return { success: false, error: AUTH_SERVICE_UNAVAILABLE_MESSAGE };
        }

        const { error } = await sb.auth.signInWithOtp({ email });
        if (error) throw error;
        return { success: true };
      } catch (err: any) {
        console.error('Magic link error:', err);
        return {
          success: false,
          error: isAuthServiceUnavailable(err)
            ? AUTH_SERVICE_UNAVAILABLE_MESSAGE
            : err?.message || 'Gagal mengirim tautan masuk.',
        };
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    // Invalidate every in-flight login/reconcile before touching Supabase, so a
    // login that resolves after this point cannot restore the session.
    authGenerationRef.current += 1;
    intentionalSignOutRef.current = true;
    dashboardMemoryCache.setIdentity(null);
    setIsLoading(true);
    try {
      const sb = getSupabaseClient();
      if (sb) {
        try {
          await sb.auth.signOut();
        } catch (err) {
          console.warn('Supabase signOut failed; clearing the local session only:', err);
          await sb.auth.signOut({ scope: 'local' }).catch(() => undefined);
        }
      }
    } catch (err) {
      console.warn('Logout notice:', err);
    } finally {
      // Logout always returns to the unauthenticated guest state: no token and
      // no operational permissions are retained or auto-issued.
      commitAuth(null, DEFAULT_GUEST_PROFILE);
      setAuthNotice(null);
      setIsLoading(false);
    }
  }, [commitAuth]);

  const value: AuthContextType = {
    user,
    token,
    role: user.role,
    isLoading,
    isAuthenticated: token !== null,
    isAuthModalOpen,
    authNotice,
    openAuthModal,
    closeAuthModal,
    clearAuthNotice,
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
