import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from "react";

import { ApiError, SESSION_EXPIRED_EVENT, api } from "@/lib/api";
import type { Permission, Session } from "@/lib/types";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  can: (permission: Permission) => boolean;
  login: (email: string, password: string) => Promise<Session>;
  logout: () => Promise<void>;
  refresh: (session: Session) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const SESSION_KEY = ["session"] as const;

async function fetchSession(): Promise<Session | null> {
  try {
    return await api.get<Session>("/api/auth/me");
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: SESSION_KEY,
    queryFn: fetchSession,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  // Qualquer 401 em outra chamada encerra a sessão local e leva ao login.
  useEffect(() => {
    const onExpired = () => {
      queryClient.setQueryData(SESSION_KEY, null);
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== SESSION_KEY[0] });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  const loginMutation = useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api.post<Session>("/api/auth/login", credentials),
    onSuccess: (session) => queryClient.setQueryData(SESSION_KEY, session),
  });

  const logoutMutation = useMutation({
    mutationFn: () => api.post<void>("/api/auth/logout"),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(SESSION_KEY, null);
    },
  });

  const session = sessionQuery.data ?? null;
  const can = useCallback(
    (permission: Permission) => session?.permissions.includes(permission) ?? false,
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading: sessionQuery.isPending,
      can,
      login: (email, password) => loginMutation.mutateAsync({ email, password }),
      logout: () => logoutMutation.mutateAsync().catch(() => undefined),
      refresh: (next) => queryClient.setQueryData(SESSION_KEY, next),
    }),
    [session, sessionQuery.isPending, can, loginMutation, logoutMutation, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
