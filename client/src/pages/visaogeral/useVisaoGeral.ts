import { useAuth } from "@/_core/hooks/useAuth";
import { activePreferences, maskedMoney, valuesHidden, formatMoney as formatMoneyWithPreferences, formatDate } from "@/lib/appFormat";
import { buildCashCurve } from "@/lib/cashCurve";
import { greetingFor } from "@/lib/greeting";
import { toast } from "@/lib/toast";
import { trpc } from "@/lib/trpc";
import { usePreferences } from "@/contexts/PreferencesContext";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { usePanoramaDaConta } from "@/hooks/useSemContas";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { CURRENCY_LOCALES, type DefaultPeriod } from "@shared/preferences";
import type { TransactionInput } from "@/lib/transactionTypes";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

/*
 * Os dados e o estado da Visão geral, num lugar só.
 *
 * A tela tem dois desenhos — o claro, de sempre, e o escuro do design system
 * Voltura — e quem escolhe é o tema. Se cada desenho buscasse os próprios
 * dados, os dois sairiam do lugar no primeiro ajuste; aqui eles recebem
 * exatamente o mesmo objeto e só decidem como mostrá-lo.
 */

const PERIOD_LABELS: Record<DefaultPeriod, string> = {
  mes: "Mês",
  trimestre: "Trimestre",
  ano: "Ano",
};

export function formatMoney(value: number, compact = false) {
  // A versão compacta ("R$ 62,1 mil") é dos eixos do gráfico e não passa pelas
  // preferências: a moeda escolhida entra pelo símbolo, o resto é escala.
  if (!compact) return formatMoneyWithPreferences(value);
  // O eixo do gráfico também some no modo discreto: um eixo com escala real
  // entrega a ordem de grandeza que o resto da tela está escondendo.
  if (valuesHidden()) return maskedMoney();
  const { currency } = activePreferences();
  return new Intl.NumberFormat(CURRENCY_LOCALES[currency], {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/*
 * As cores categóricas do Voltura, na ordem em que ele as lista. O quinto
 * canal em diante fica cinza: as quatro cores existem para diferenciar
 * categorias, e com mais do que isso a barra vira arco-íris.
 */
const CORES_DOS_CANAIS = ["var(--v-cat-coral)", "var(--v-cat-magenta)", "var(--v-cat-green)", "var(--v-cat-blue)"];

export type VisaoGeral = ReturnType<typeof useVisaoGeral>;

export function useVisaoGeral() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  // O período inicial vem das preferências; depois disso quem manda é o clique.
  const preferences = usePreferences();
  const [period, setPeriod] = useState(PERIOD_LABELS[preferences.defaultPeriod]);
  const appliedDefault = useRef(preferences.defaultPeriod);
  useEffect(() => {
    // As preferências chegam depois do primeiro render; só a primeira mudança
    // reposiciona a tela, para não desfazer a escolha do usuário na sessão.
    if (appliedDefault.current === preferences.defaultPeriod) return;
    appliedDefault.current = preferences.defaultPeriod;
    setPeriod(PERIOD_LABELS[preferences.defaultPeriod]);
  }, [preferences.defaultPeriod]);
  const dashboardRange = period === "Ano" ? "year" : period === "Trimestre" ? "quarter" : "month";
  const dashboardQuery = trpc.transactions.dashboard.useQuery({ range: dashboardRange });
  const dashboard = dashboardQuery.data;
  /*
   * O que o "Precisa de você" tem para dizer. Enquanto a consulta não volta,
   * `nadaPendente` fica falso: sem isso o cartão abriria dizendo que está
   * tudo em paz e trocaria por atrasos meio segundo depois.
   */
  const atrasadas = dashboard?.overdue.count ?? 0;
  const pendentes = (dashboard?.pendingPayable.count ?? 0) + (dashboard?.pendingReceivable.count ?? 0);
  const recebimentosHoje = dashboard?.dueToday.count ?? 0;
  const nadaPendente = Boolean(dashboard) && atrasadas === 0 && pendentes === 0 && recebimentosHoje === 0;
  /*
   * O primeiro acesso: nenhuma conta e nenhum lançamento.
   *
   * As duas respostas vêm da MESMA consulta — a dos saldos, que a barra
   * lateral já faz em toda página —, então a decisão entre painel e primeiro
   * acesso não custa consulta nenhuma e não pisca.
   *
   * O panorama da organização continua sendo buscado quando não há conta, mas
   * só pelo número de categorias que a tela de primeiro acesso mostra: ele já
   * não decide nada, e por isso a tela não espera por ele.
   */
  const panorama = usePanoramaDaConta();
  const accountCount = panorama.contas.length;
  const semContas = panorama.semContas;
  const overviewQuery = trpc.organization.overview.useQuery(undefined, { enabled: semContas });
  const companyQuery = trpc.settings.company.useQuery(undefined, { enabled: semContas });
  const lancamentos = overviewQuery.data?.accounts.reduce((soma, conta) => soma + conta.transactionCount, 0) ?? 0;
  const primeiroAcesso = semContas && panorama.semLancamentos;
  /*
   * A espera desenhada, que esta tela não tinha.
   *
   * Sem ela o painel nascia montado mostrando zero em tudo e trocava pelos
   * números quando o dado chegava — a mesma parede de zeros que os estados
   * vazios existem para não mostrar, só que por um segundo.
   */
  const carregando = !panorama.pronto || (!primeiroAcesso && dashboardQuery.isLoading);
  // Calculado no render: a página é recarregada muitas vezes ao dia e não
  // vale um timer só para virar a saudação com o relógio na tela.
  const greeting = greetingFor(new Date());
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * O modal de lançamento aberto daqui.
   *
   * Quem clica em "Novo lançamento" na visão geral quer lançar, não trocar de
   * tela. As opções da organização só são buscadas quando o modal abre: postas
   * no lote da página, atrasariam o painel inteiro por causa de um formulário
   * que talvez ninguém abra.
   */
  const [novoLancamento, setNovoLancamento] = useState(false);
  const utils = trpc.useUtils();
  const organizationQuery = trpc.organization.options.useQuery(undefined, { enabled: novoLancamento });
  const organizationOptions = organizationQuery.data ?? { accounts: [], categories: [], costCenters: [] };
  const createMutation = trpc.transactions.create.useMutation();
  const podeEscrever = !useSomenteLeitura();

  const salvarLancamento = async (input: TransactionInput) => {
    try {
      const result = await createMutation.mutateAsync(input);
      void Promise.all([
        utils.transactions.dashboard.invalidate(),
        utils.transactions.list.invalidate(),
        utils.organization.overview.invalidate(),
        utils.organization.accountBalances.invalidate(),
        utils.payables.invalidate(),
        utils.cashflow.invalidate(),
        utils.dre.invalidate(),
      ]).catch(() => toast.info("Lançamento salvo. Atualize a página para recarregar os indicadores."));
      toast.success(result.monthCount > 1
        ? `${result.monthCount} lançamentos criados, de ${formatDate(input.transactionDate)} em diante`
        : "Lançamento salvo no banco");
      setNovoLancamento(false);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento");
      return false;
    }
  };
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsAnchor = useRef<HTMLDivElement>(null);
  useDismissOnOutside(notificationsOpen, notificationsAnchor, useCallback(() => setNotificationsOpen(false), []));
  const [accountOpen, setAccountOpen] = useState(false);

  const firstName = user?.name?.trim().split(/\s+/)[0] || "Cliente";
  const months = dashboard?.months ?? [];
  const chartMaximum = useMemo(() => Math.max(0, ...months.flatMap(item => [item.incoming, item.outgoing])), [months]);
  const chartScale = Math.max(1, chartMaximum);
  const chartTicks = useMemo(() => [1, 0.75, 0.5, 0.25, 0].map(portion => chartMaximum * portion), [chartMaximum]);
  const cashCurve = useMemo(() => buildCashCurve(months.map(item => item.balance)), [months]);
  const canais = useMemo(() => {
    const lista = dashboard?.revenueByCategory ?? [];
    const total = lista.reduce((soma, canal) => soma + canal.amount, 0);
    if (total <= 0) return [];
    return lista.map((canal, index) => ({
      ...canal,
      share: (canal.amount / total) * 100,
      cor: CORES_DOS_CANAIS[index] ?? "var(--v-hairline-strong)",
    }));
  }, [dashboard?.revenueByCategory]);
  const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date()).replace(/^./, letter => letter.toUpperCase());



  return {
    user, setLocation, period, setPeriod, dashboard, dashboardQuery,
    atrasadas, pendentes, recebimentosHoje, nadaPendente,
    accountCount, overviewQuery, companyQuery, lancamentos, primeiroAcesso, carregando,
    greeting, firstName, currentMonthLabel, mobileOpen, setMobileOpen,
    novoLancamento, setNovoLancamento, organizationOptions, createMutation, salvarLancamento, podeEscrever,
    notificationsOpen, setNotificationsOpen, notificationsAnchor,
    months, chartScale, chartTicks, cashCurve, canais,
  };
}
