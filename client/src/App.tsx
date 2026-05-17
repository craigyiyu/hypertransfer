import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { DemoProvider } from "./contexts/DemoContext";
import Landing from "./pages/Landing";
import Register from "./pages/Register";
import Setup2FA from "./pages/Setup2FA";
import Login from "./pages/Login";
import Verify2FA from "./pages/Verify2FA";
import KYC from "./pages/KYC";
import TravelRule from "./pages/TravelRule";
import Dashboard from "./pages/Dashboard";
import NewDeposit from "./pages/NewDeposit";
import WalletScreening from "./pages/WalletScreening";
import DepositAddress from "./pages/DepositAddress";
import TestPayment from "./pages/TestPayment";
import MainDeposit from "./pages/MainDeposit";
import DepositSuccess from "./pages/DepositSuccess";
import History from "./pages/History";
import Support from "./pages/Support";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Landing} />
      <Route path="/register" component={Register} />
      <Route path="/setup-2fa" component={Setup2FA} />
      <Route path="/login" component={Login} />
      <Route path="/verify-2fa" component={Verify2FA} />
      <Route path="/kyc" component={KYC} />
      <Route path="/travel-rule" component={TravelRule} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/new-deposit" component={NewDeposit} />
      <Route path="/wallet-screening" component={WalletScreening} />
      <Route path="/deposit-address" component={DepositAddress} />
      <Route path="/test-payment" component={TestPayment} />
      <Route path="/main-deposit" component={MainDeposit} />
      <Route path="/deposit-success" component={DepositSuccess} />
      <Route path="/history" component={History} />
      <Route path="/support" component={Support} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <DemoProvider>
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
          </TooltipProvider>
        </DemoProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
