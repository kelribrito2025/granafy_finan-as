import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import AuthPage from "@/pages/AuthPage";
import NotFound from "@/pages/NotFound";
import {
  ForgotPasswordPage,
  ResetPasswordPage,
} from "@/pages/PasswordResetPage";
import { useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFF4F1]">
      <div className="flex flex-col items-center gap-3 text-[#0B1F14]">
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[#12B85C] text-[15px] font-bold text-white shadow-[0_10px_28px_rgba(18,184,92,.2)]">
          NV
        </span>
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/25 border-t-[#12B85C]" />
        <span className="text-[11px] font-medium text-[#718077]">Verificando seu acesso</span>
      </div>
    </main>
  );
}

function ProtectedDashboard() {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      setLocation("/login", { replace: true });
    }
  }, [isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) {
    return <AuthLoading />;
  }

  return <Home />;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><AuthPage mode="login" /></Route>
      <Route path="/cadastro"><AuthPage mode="signup" /></Route>
      <Route path="/esqueci-senha" component={ForgotPasswordPage} />
      <Route path="/redefinir-senha" component={ResetPasswordPage} />
      <Route path="/" component={ProtectedDashboard} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
