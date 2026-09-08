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
import { type ReactNode, useEffect, useRef } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GranafyLoader } from "./components/GranafyLoader";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFF4F1]">
      <GranafyLoader label="Verificando seu acesso" />
    </main>
  );
}

function ProtectedPage({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  /*
   * Quem já esteve logado nesta aba e deixou de estar acabou de sair da conta,
   * e sair da conta termina na tela de entrada. Sem esta marca o "Sair" feito
   * a partir do painel caía na regra de visita abaixo e jogava a pessoa no
   * site institucional.
   */
  const esteveLogado = useRef(false);
  if (isAuthenticated) esteveLogado.current = true;

  useEffect(() => {
    if (loading || isAuthenticated) return;
    /*
     * Quem chega em "/" sem estar logado é visita, não usuário perdido: vai
     * para o site, que é onde a explicação do produto está. Qualquer outra
     * página protegida continua indo direto para a entrada.
     */
    if (window.location.pathname === "/" && !esteveLogado.current) {
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
