import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/_core/hooks/useAuth";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
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
import PagasRecebidasPage from "@/pages/PagasRecebidasPage";
import SettingsPage from "@/pages/SettingsPage";
import { type ReactNode, useEffect } from "react";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GranafyLoader } from "./components/GranafyLoader";
import { PreferencesProvider } from "./contexts/PreferencesContext";
import { PrivacyProvider } from "./contexts/PrivacyContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import EscolherEmpresaPage from "@/pages/EscolherEmpresaPage";
import AdminVisaoGeral from "@/admin/VisaoGeral";
import AdminContas from "@/admin/Contas";
import AdminContaDetalhe from "@/admin/ContaDetalhe";
import AdminUsuarios from "@/admin/Usuarios";
import AdminAssinaturas from "@/admin/Assinaturas";
import { AdminConfiguracoes } from "@/admin/Configuracoes";
import { AdminReceita, AdminRetencao } from "@/admin/Exemplos";

function AuthLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EFF4F1]">
      <GranafyLoader label="Verificando seu acesso" />
    </main>
  );
}

/*
 * Só o portão da sessão, sem o do primeiro acesso.
 *
 * A escolha de empresa acontece ANTES do onboarding: o primeiro acesso é de
 * uma empresa, e perguntar "cadastre sua primeira conta" antes de a pessoa
 * dizer em qual empresa está entrando é perguntar sobre a empresa errada.
 */
function ApenasAutenticado({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  /*
   * Sem sessão, toda página protegida termina na entrada — inclusive a raiz.
   *
   * A visita anônima não chega mais até aqui: o servidor responde a landing na
   * própria "/" e o painel nem carrega. Quem cai neste caso tem cookie válido
   * e conta que não abre — sessão de usuário removido, por exemplo —, e para
   * essa pessoa o lugar certo é o login, não a página de vendas.
   */
  useEffect(() => {
    if (loading || isAuthenticated) return;
    setLocation("/login", { replace: true });
  }, [isAuthenticated, loading, setLocation]);

  if (loading || !isAuthenticated) {
    return <AuthLoading />;
  }

  return <>{children}</>;
}

function ProtectedPage({ children }: { children: ReactNode }) {
  /*
   * O portão do primeiro acesso fica dentro dos provedores e fora do painel: o
   * primeiro acesso usa formato de moeda e fuso como qualquer outra tela, mas
   * não pode deixar o painel aparecer antes dele.
   */
  return (
    <ApenasAutenticado>
      <PreferencesProvider>
        <PrivacyProvider>
          <OnboardingGate>{children}</OnboardingGate>
        </PrivacyProvider>
      </PreferencesProvider>
    </ApenasAutenticado>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login"><AuthPage mode="login" /></Route>
      <Route path="/cadastro"><AuthPage mode="signup" /></Route>
      <Route path="/escolher-empresa"><ApenasAutenticado><EscolherEmpresaPage /></ApenasAutenticado></Route>
      <Route path="/termos"><LegalPage document="termos" /></Route>
      <Route path="/privacidade"><LegalPage document="privacidade" /></Route>
      <Route path="/conciliacao"><ProtectedPage><ConciliacaoPage /></ProtectedPage></Route>
      <Route path="/fluxo-de-caixa"><ProtectedPage><FluxoCaixaPage /></ProtectedPage></Route>
      <Route path="/a-pagar-e-receber"><ProtectedPage><PagarReceberPage /></ProtectedPage></Route>
      <Route path="/dre"><ProtectedPage><DrePage /></ProtectedPage></Route>
      <Route path="/balanco-patrimonial"><ProtectedPage><BalanceSheetPage /></ProtectedPage></Route>
      <Route path="/organizacao"><ProtectedPage><OrganizationPage /></ProtectedPage></Route>
      <Route path="/configuracoes"><ProtectedPage><SettingsPage /></ProtectedPage></Route>
      <Route path="/pagas-e-recebidas"><ProtectedPage><PagasRecebidasPage /></ProtectedPage></Route>
      <Route path="/lancamentos"><ProtectedPage><LancamentosPage /></ProtectedPage></Route>
      {/* O admin do sistema tem o próprio portão (papel), dentro do AdminShell. */}
      <Route path="/admin"><AdminVisaoGeral /></Route>
      <Route path="/admin/contas"><AdminContas /></Route>
      <Route path="/admin/contas/:id"><AdminContaDetalhe /></Route>
      <Route path="/admin/usuarios"><AdminUsuarios /></Route>
      <Route path="/admin/assinaturas"><AdminAssinaturas /></Route>
      <Route path="/admin/receita"><AdminReceita /></Route>
      <Route path="/admin/retencao"><AdminRetencao /></Route>
      <Route path="/admin/configuracoes"><AdminConfiguracoes /></Route>
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
