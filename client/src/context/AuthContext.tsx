import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setAccessToken, tryRefresh, ApiError } from "../api/client";
import { DESIGN_ACCOUNTS, DESIGN_MODE, getDesignRole } from "../design/designMode";

export type Role = "STUDENT" | "SUPERVISOR" | "ADMIN";

export interface CurrentUser {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
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
      // Dashboard design files sign in as their exported role. The shared login
      // design deliberately stays signed out.
      const designRole = getDesignRole();
      if (designRole === "login") {
        setLoading(false);
        return;
      }
      if (designRole) {
        try {
          const data = await api.post<{ accessToken: string; user: CurrentUser }>(
            "/auth/login",
            DESIGN_ACCOUNTS[designRole]
          );
          setAccessToken(data.accessToken);
          setUser(data.user);
        } catch {
          setUser(null);
        }
        setLoading(false);
        return;
      }

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
    // Signing out of a design file would strand the designer on the login page.
    if (DESIGN_MODE) return;
    try {
      await api.post("/auth/logout");
    } catch {
      // best-effort - clear client state regardless
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
