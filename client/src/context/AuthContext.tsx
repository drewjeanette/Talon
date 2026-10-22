import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken, tryRefresh, ApiError } from "../api/client";

export type Role = "STUDENT" | "SUPERVISOR" | "ADMIN";

export interface CurrentUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  role: Role;
  payType: "BIWEEKLY" | "MONTHLY";
  mustResetPw: boolean;
  department: { id: number; name: string; college: { id: number; name: string } | null } | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    const me = await api.get<CurrentUser>("/auth/me");
    setUser(me);
  }, []);

  useEffect(() => {
    (async () => {
      const restored = await tryRefresh();
      if (restored) {
        try {
          await refreshUser();
        } catch {
          setUser(null);
        }
      }
      setLoading(false);
    })();
  }, [refreshUser]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ accessToken: string; user: CurrentUser }>("/auth/login", { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Clear local state even if the server session has already expired.
    }
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

export { ApiError };
