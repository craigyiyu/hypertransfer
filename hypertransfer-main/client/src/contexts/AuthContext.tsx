/**
 * AuthContext — 真实认证态管理。
 * 持有当前用户 + token(localStorage 持久化),提供登录/登出/刷新。
 * 应用启动时若本地有 token,调用 /me 校验并恢复会话。
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
} from "react";
import { authApi, getToken, setToken, clearToken, AuthUser } from "@/lib/api";

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  loading: boolean;            // 启动时恢复会话中
  setSession: (token: string, user: AuthUser) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const setSession = useCallback((token: string, u: AuthUser) => {
    setToken(token);
    setUser(u);
  }, []);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      return;
    }
    try {
      const { data } = await authApi.me();
      setUser(data.user);
    } catch {
      clearToken();
      setUser(null);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await authApi.logout();
    } catch {
      /* 忽略:本地清理优先 */
    }
    clearToken();
    setUser(null);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        loading,
        setSession,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
