"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import {
  login,
  logout,
  me,
  signup,
  type AuthUser,
} from "@/shared/api/cash-master";

type AuthMode = "login" | "register";
type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  authMode: AuthMode;
  error: string | null;
  isSubmitting: boolean;
  status: SessionStatus;
  user: AuthUser | null;
  authenticate: (payload: { email: string; password: string }) => Promise<boolean>;
  clearError: () => void;
  refreshSession: () => Promise<void>;
  setAuthMode: (mode: AuthMode) => void;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function refreshSession() {
    setStatus("loading");
    setError(null);

    try {
      const currentUser = await me();
      setUser(currentUser.user);
      setAuthMode("login");
      setStatus("authenticated");
    } catch {
      setUser(null);
      setStatus("unauthenticated");
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshSession().catch((sessionError: unknown) => {
      setUser(null);
      setAuthMode("login");
      setStatus("unauthenticated");
      setError(
        sessionError instanceof Error ? sessionError.message : "Failed to restore session",
      );
    });
  }, []);

  async function authenticate(payload: { email: string; password: string }) {
    setIsSubmitting(true);
    setError(null);

    try {
      const result =
        authMode === "register"
          ? await signup(payload.email, payload.password)
          : await login(payload.email, payload.password);

      setUser(result.user);
      setAuthMode("login");
      setStatus("authenticated");
      return true;
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Authentication failed");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }

  async function signOut() {
    setIsSubmitting(true);
    setError(null);

    try {
      await logout();
      setUser(null);
      await refreshSession();
    } catch (logoutError) {
      setError(logoutError instanceof Error ? logoutError.message : "Logout failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  const value: SessionContextValue = {
    authMode,
    error,
    isSubmitting,
    status,
    user,
    authenticate,
    clearError: () => setError(null),
    refreshSession,
    setAuthMode,
    signOut,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }

  return context;
}
