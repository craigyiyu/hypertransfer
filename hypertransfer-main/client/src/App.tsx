import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, Redirect } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DemoProvider } from "./contexts/DemoContext";
import { DemoModeProvider } from "./contexts/DemoModeContext";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import DemoModeToggle from "./components/DemoModeToggle";
import { I18nProvider } from "./contexts/I18nContext";
import type { ComponentType } from "react";
import Landing from "./pages/Landing";
import Invite from "./pages/Invite";
import Setup2FA from "./pages/Setup2FA";
import Login from "./pages/Login";
import StaffLogin from "./pages/StaffLogin";
import ForgotPassword from "./pages/ForgotPassword";
import Verify2FA from "./pages/Verify2FA";
import KYC from "./pages/KYC";
import KYCStatus from "./pages/KYCStatus";
import TravelRule from "./pages/TravelRule";
import Dashboard from "./pages/Dashboard";
import NewDeposit from "./pages/NewDeposit";
import WalletScreening from "./pages/WalletScreening";
import DepositAddress from "./pages/DepositAddress";
import TestPayment from "./pages/TestPayment";
import MainDeposit from "./pages/MainDeposit";
import DepositSuccess from "./pages/DepositSuccess";
import RefundProcess from "./pages/RefundProcess";
import CasinoOpsPortal from "./pages/CasinoOpsPortal";
import History from "./pages/History";
import Support from "./pages/Support";
import Settings from "./pages/Settings";

/** 受登录态保护的路由:未登录自动重定向到 /login。 */
function guard(Component: ComponentType) {
  return () => (
    <ProtectedRoute>
      <Component />
    </ProtectedRoute>
  );
}

/** 后台路由:仅 staff 角色可访问，patron 重定向回 dashboard（越权修复）。 */
function staffGuard(Component: ComponentType) {
  return () => (
    <ProtectedRoute requireStaff>
      <Component />
    </ProtectedRoute>
  );
}

function Router() {
  return (
    <Switch>
      {/* 公共 / 认证流程页 */}
      <Route path="/" component={Landing} />
      {/* 邀请制: 旧自助注册路由重定向到登录(注册仅走 /invite 邀请落地) */}
      <Route path="/register"><Redirect to="/login" /></Route>
      <Route path="/invite" component={Invite} />
      <Route path="/setup-2fa" component={Setup2FA} />
      <Route path="/login" component={Login} />
      <Route path="/ops" component={StaffLogin} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/verify-2fa" component={Verify2FA} />
      {/* 登录后受保护页 */}
      <Route path={"/kyc"} component={guard(KYC)} />
      <Route path={"/kyc-status"} component={guard(KYCStatus)} />
      <Route path={"/travel-rule"} component={guard(TravelRule)} />
      <Route path="/dashboard" component={guard(Dashboard)} />
      <Route path="/new-deposit" component={guard(NewDeposit)} />
      <Route path="/wallet-screening" component={guard(WalletScreening)} />
      <Route path="/deposit-address" component={guard(DepositAddress)} />
      <Route path="/test-payment" component={guard(TestPayment)} />
      <Route path="/main-deposit" component={guard(MainDeposit)} />
      <Route path="/deposit-success" component={guard(DepositSuccess)} />
      <Route path="/refund" component={guard(RefundProcess)} />
      {/* Staff operations portal. Kept out of customer navigation. */}
      <Route path="/casino-ops" component={staffGuard(CasinoOpsPortal)} />
      <Route path="/treasury-controls" component={staffGuard(CasinoOpsPortal)} />
      <Route path="/history" component={guard(History)} />
      <Route path="/support" component={guard(Support)} />
      <Route path="/settings" component={guard(Settings)} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <I18nProvider>
          <AuthProvider>
            <DemoProvider>
              <DemoModeProvider>
                <TooltipProvider>
                  <Toaster
                    toastOptions={{
                      style: {
                        background: "oklch(0.18 0.008 20)",
                        border: "1px solid oklch(0.25 0.01 20)",
                        color: "oklch(0.93 0.005 85)",
                      },
                    }}
                  />
                  <Router />
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

export default App;
