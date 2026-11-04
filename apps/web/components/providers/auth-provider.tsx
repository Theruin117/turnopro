'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  AuthOrganization,
  AuthSession,
  LoginInput,
  RegisterInput,
} from '@turnopro/contracts';

import {
  apiFetch,
  logoutRequest,
  refreshSession,
  setAccessToken,
  subscribeToSessionRefresh,
} from '@/lib/api';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  session: AuthSession | null;
  login: (input: LoginInput) => Promise<AuthSession>;
  register: (input: RegisterInput) => Promise<AuthSession>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateOrganization: (organization: AuthOrganization) => void;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    let active = true;

    subscribeToSessionRefresh((refreshed) => {
      if (active) {
        setSession(refreshed);
        setStatus('authenticated');
      }
    });

    refreshSession()
      .then((refreshed) => {
        if (active) {
          setSession(refreshed);
          setStatus('authenticated');
        }
      })
      .catch(() => {
        if (active) {
          setSession(null);
          setStatus('anonymous');
        }
      });

    return () => {
      active = false;
      subscribeToSessionRefresh(null);
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const next = await apiFetch<AuthSession>('/auth/login', {
      method: 'POST',
      body: input,
    });
    setAccessToken(next.accessToken);
    setSession(next);
    setStatus('authenticated');
    return next;
  }, []);

  const register = useCallback(async (input: RegisterInput) => {
    const next = await apiFetch<AuthSession>('/auth/register', {
      method: 'POST',
      body: input,
    });
    setAccessToken(next.accessToken);
    setSession(next);
    setStatus('authenticated');
    return next;
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setSession(null);
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    const next = await refreshSession();
    setSession(next);
    setStatus('authenticated');
  }, []);

  const updateOrganization = useCallback((organization: AuthOrganization) => {
    setSession((current) =>
      current ? { ...current, organization } : current,
    );
  }, []);

  const hasPermission = useCallback(
    (permission: string) =>
      session?.membership.permissions.includes(permission as never) ?? false,
    [session],
  );

  const value = useMemo(
    () => ({
      status,
      session,
      login,
      register,
      logout,
      refresh,
      updateOrganization,
      hasPermission,
    }),
    [status, session, login, register, logout, refresh, updateOrganization, hasPermission],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return context;
}
