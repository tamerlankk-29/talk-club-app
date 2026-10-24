'use client';

import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api, call, refreshSession, session } from './api/client';
import type { AuthTokens, SessionUser } from './api/types';

/** 'unavailable': the API couldn't be reached to restore the session (offline, restarting). */
type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';

interface AuthContextValue {
  status: AuthStatus;
  user: SessionUser | null;
  /** Child profile a parent is currently acting for (null = own profile). */
  actingClientId: string | null;
  setActingClient(id: string | null): void;
  /** Stores tokens returned by login / verify / register. */
  applySession(tokens: AuthTokens): void;
  reloadUser(): Promise<void>;
  /** Tries to restore the session again after it was 'unavailable'. */
  retry(): void;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const ACTING_KEY = 'tc.actingClient';

function readActing(userId: string): string | null {
  try {
    const raw = localStorage.getItem(ACTING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { userId: string; clientId: string };
    return parsed.userId === userId ? parsed.clientId : null;
  } catch {
    return null;
  }
}

function writeActing(userId: string, clientId: string | null): void {
  try {
    if (clientId) localStorage.setItem(ACTING_KEY, JSON.stringify({ userId, clientId }));
    else localStorage.removeItem(ACTING_KEY);
  } catch {
    /* storage unavailable (private mode) — acting choice lasts for this page view only */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const [actingClientId, setActingClientState] = useState<string | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleRefresh = useCallback((expiresIn: number) => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    const ms = Math.max(30, expiresIn - 60) * 1000;
    refreshTimer.current = setTimeout(() => {
      // On a network hiccup keep the current token and try again shortly.
      refreshSession().catch(() => scheduleRefresh(90));
    }, ms);
  }, []);

  const adopt = useCallback(
    (tokens: AuthTokens | null) => {
      if (!tokens) {
        session.setToken(null);
        session.setActingClient(null);
        setUser(null);
        setActingClientState(null);
        setStatus('anonymous');
        return;
      }
      session.setToken(tokens.accessToken);
      setUser(tokens.user);
      const acting = readActing(tokens.user.id);
      const valid = acting && tokens.user.managedClients.some((c) => c.id === acting) ? acting : null;
      session.setActingClient(valid);
      setActingClientState(valid);
      setStatus('authenticated');
      scheduleRefresh(tokens.expiresIn);
    },
    [scheduleRefresh],
  );

  const restore = useCallback(() => {
    refreshSession().then(
      (tokens) => adopt(tokens),
      () => setStatus('unavailable'),
    );
  }, [adopt]);

  useEffect(() => {
    session.onChange(adopt);
    restore();
    return () => {
      session.onChange(null);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [adopt, restore]);

  const retry = useCallback(() => {
    setStatus('loading');
    restore();
  }, [restore]);

  // While the API is unreachable, try again when the connection returns and every few seconds.
  useEffect(() => {
    if (status !== 'unavailable') return;
    window.addEventListener('online', restore);
    const timer = setInterval(restore, 10_000);
    return () => {
      window.removeEventListener('online', restore);
      clearInterval(timer);
    };
  }, [status, restore]);

  const applySession = useCallback(
    (tokens: AuthTokens) => {
      adopt(tokens);
      void queryClient.invalidateQueries();
    },
    [adopt, queryClient],
  );

  const reloadUser = useCallback(async () => {
    const fresh = await call(api.GET('/api/auth/session'));
    setUser(fresh);
  }, []);

  const setActingClient = useCallback(
    (id: string | null) => {
      if (!user) return;
      writeActing(user.id, id);
      session.setActingClient(id);
      setActingClientState(id);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] === 'my' });
      void queryClient.invalidateQueries();
    },
    [user, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      const registration = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      const subscription = await registration?.pushManager?.getSubscription();
      if (subscription) {
        await call(api.POST('/api/notifications/push/unsubscribe', { body: { endpoint: subscription.endpoint } })).catch(() => undefined);
      }
      registration?.active?.postMessage({ type: 'CLEAR_USER_CACHE' });
    } catch {
      /* best effort */
    }
    await call(api.POST('/api/auth/logout', { body: {} })).catch(() => undefined);
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    adopt(null);
    queryClient.clear();
  }, [adopt, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({ status, user, actingClientId, setActingClient, applySession, reloadUser, retry, logout }),
    [status, user, actingClientId, setActingClient, applySession, reloadUser, retry, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

export function useCan(permission: string): boolean {
  const { user } = useAuth();
  return !!user?.permissions.includes(permission);
}
