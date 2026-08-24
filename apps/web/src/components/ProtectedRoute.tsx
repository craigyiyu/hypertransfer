/**
 * ProtectedRoute — 登录态路由守卫。
 * 未登录访问受保护页面 -> 重定向到 /login;会话恢复中显示占位。
 */
import { ReactNode } from "react";
import { Redirect } from "@/lib/wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
  requireStaff = false,
}: {
  children: ReactNode;
  requireStaff?: boolean;
}) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[100svh] bg-background flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gold animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // 后台路由未登录 → 工作人员专用入口 /ops; 客户端路由 → patron /login。
    return <Redirect to={requireStaff ? "/ops" : "/login"} />;
  }

  // 后台仅 staff 可访问；客户(patron)重定向回 dashboard。
  // 前端守卫只是 UX；真正防越权靠后端 require_role（见 backend /api/staff/*）。
  if (requireStaff && user?.userType !== "staff") {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
