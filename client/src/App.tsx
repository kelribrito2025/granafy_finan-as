import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import AuthPage from "@/pages/AuthPage";
import BalanceSheetPage from "@/pages/BalanceSheetPage";
import ConciliacaoPage from "@/pages/ConciliacaoPage";
import DrePage from "@/pages/DrePage";
import FluxoCaixaPage from "@/pages/FluxoCaixaPage";
import LancamentosPage from "@/pages/LancamentosPage";
import LegalPage from "@/pages/LegalPage";
import NotFound from "@/pages/NotFound";
import OrganizationPage from "@/pages/OrganizationPage";
import PagarReceberPage from "@/pages/PagarReceberPage";
import SettingsPage from "@/pages/SettingsPage";
import { type ReactNode, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GranafySymbol } from "./components/GranafyLogo";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFF4F1]">
      <div className="flex flex-col items-center gap-3 text-[#0B1F14]">
        <GranafySymbol size={44} />
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/25 border-t-[#12B85C]" />
        <span className="text-[11px] font-medium text-[#718077]">Verificando seu acesso</span>
      </div>
    </main>
  );
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (loading || isAuthenticated) return;
    /*
     * Quem chega em "/" sem estar logado é visita, não usuário perdido: vai
     * para o site, que é onde a explicação do produto está. Qualquer outra
     * página protegida continua indo direto para a entrada.
     */
    if (window.location.pathname === "/") {
      window.location.replace("/site");
      return;
    }
    setLocation("/login", { replace: true });
  }, [isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) {
    return <AuthLoading />;
  }

  return <PreferencesProvider><PrivacyProvider>{children}</PrivacyProvider></PreferencesProvider>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><AuthPage mode="login" /></Route>
      <Route path="/cadastro"><AuthPage mode="signup" /></Route>
      <Route path="/termos"><LegalPage document="termos" /></Route>
      <Route path="/privacidade"><LegalPage document="privacidade" /></Route>
      <Route path="/conciliacao"><ProtectedPage><ConciliacaoPage /></ProtectedPage></Route>
      <Route path="/fluxo-de-caixa"><ProtectedPage><FluxoCaixaPage /></ProtectedPage></Route>
      <Route path="/a-pagar-e-receber"><ProtectedPage><PagarReceberPage /></ProtectedPage></Route>
      <Route path="/dre"><ProtectedPage><DrePage /></ProtectedPage></Route>
      <Route path="/balanco-patrimonial"><ProtectedPage><BalanceSheetPage /></ProtectedPage></Route>
      <Route path="/organizacao"><ProtectedPage><OrganizationPage /></ProtectedPage></Route>
      <Route path="/configuracoes"><ProtectedPage><SettingsPage /></ProtectedPage></Route>
      <Route path="/lancamentos"><ProtectedPage><LancamentosPage /></ProtectedPage></Route>
      <Route path="/"><ProtectedPage><Home /></ProtectedPage></Route>
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
        switchable
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
