"use client";

import ErrorBoundary from "@/components/ErrorBoundary";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { I18nProvider } from "@/contexts/I18nContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { DemoProvider } from "@/contexts/DemoContext";
import { DemoModeProvider } from "@/contexts/DemoModeContext";
import { TooltipProvider } from "@workspace/ui/components/tooltip";
import { Toaster } from "@workspace/ui/components/sonner";
import DemoModeToggle from "@/components/DemoModeToggle";
import { RouterBridge } from "@/lib/wouter";

/**
 * 根 Provider 栈(原 Vite 版 App.tsx 的 Provider 包裹层)。
 * 所有页面共享:主题 / i18n / 认证 / demo 会话 / demo 便利 / tooltip / toast / 路由桥接。
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark" switchable>
        <I18nProvider>
          <AuthProvider>
            <DemoProvider>
              <DemoModeProvider>
                <TooltipProvider>
                  <RouterBridge />
                  <Toaster richColors position="top-center" />
                  {children}
                  <DemoModeToggle />
                </TooltipProvider>
              </DemoModeProvider>
            </DemoProvider>
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
