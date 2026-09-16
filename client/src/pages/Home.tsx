import { useAuth } from "@/_core/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  ChevronRightIcon,
  MenuIcon,
  NotificationIcon,
  PlusIcon,
  SidebarMenuIcon,
  UploadIcon,
  UsersIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { AuroraSurface } from "@/components/AuroraSurface";
import { VisaoGeralSkeleton } from "@/components/PageSkeleton";
import { BarrasFantasma, CartaoVazio, NadaPendente } from "@/components/CartaoVazio";
import { ProfileMenu } from "@/components/ProfileMenu";
import { greetingFor } from "@/lib/greeting";
import { activePreferences, maskedMoney, valuesHidden, formatMoney as formatMoneyWithPreferences, formatDate, today } from "@/lib/appFormat";
import { buildCashCurve } from "@/lib/cashCurve";
import { usePreferences } from "@/contexts/PreferencesContext";
import { CURRENCY_LOCALES, type DefaultPeriod } from "@shared/preferences";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { usePanoramaDaConta } from "@/hooks/useSemContas";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { toast } from "@/lib/toast";
import { useLocation } from "wouter";
import { ChartDot } from "@/components/ChartDot";
import { TransactionModal } from "@/components/TransactionModal";
import type { TransactionInput } from "@/lib/transactionTypes";
import { HideValuesButton } from "@/components/HideValuesButton";
import { VisaoGeralVazia } from "@/pages/VisaoGeralVazia";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";


const PERIOD_LABELS: Record<DefaultPeriod, string> = {
  mes: "Mês",
  trimestre: "Trimestre",
  ano: "Ano",
};

function formatMoney(value: number, compact = false) {
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

const badgeClass = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

export default function Home() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState("Visão geral");
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

  const accountInitials = (user?.name || user?.email || "NV")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");
  const firstName = user?.name?.trim().split(/\s+/)[0] || "Cliente";
  const months = dashboard?.months ?? [];
  const chartMaximum = useMemo(() => Math.max(0, ...months.flatMap(item => [item.incoming, item.outgoing])), [months]);
  const chartScale = Math.max(1, chartMaximum);
  const chartTicks = useMemo(() => [1, 0.75, 0.5, 0.25, 0].map(portion => chartMaximum * portion), [chartMaximum]);
  const cashCurve = useMemo(() => buildCashCurve(months.map(item => item.balance)), [months]);
  const currentMonthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date()).replace(/^./, letter => letter.toUpperCase());

  const handleLogout = async () => {
    await logout();
    setAccountOpen(false);
    toast.success("Sessão encerrada");
    setLocation("/login", { replace: true });
  };

  const selectNav = (item: string) => {
    setActiveNav(item);
    if (item === "Lançamentos") {
      setLocation("/lancamentos");
      return;
    }
    if (item === "Contas e categorias") {
      setLocation("/organizacao");
      return;
    }
    if (item === "Balanço Patrimonial") {
      setLocation("/balanco-patrimonial");
      return;
    }
    if (item === "DRE") {
      setLocation("/dre");
      return;
    }
    if (item === "Fluxo de caixa") {
      setLocation("/fluxo-de-caixa");
      return;
    }
    if (item === "A pagar e receber") {
      setLocation("/a-pagar-e-receber");
      return;
    }
    if (item !== "Visão geral") {
      toast.info(`${item} ainda não está disponível`, { description: "A visão geral continua mostrando os dados reais da sua conta." });
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 bg-[#EFF4F1] p-3 sm:p-5">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="relative flex flex-wrap items-center gap-3 xl:gap-4">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F8FAF9] active:scale-95 xl:hidden"
            >
              <SidebarMenuIcon size={18} />
            </button>
            <div className="mr-auto flex min-w-[190px] flex-col gap-0.5">
              <h1 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">{greeting}, {firstName}</h1>
              <p className="text-xs text-[#8A968D] sm:text-[13px]">
                {currentMonthLabel} · {primeiroAcesso ? "sua empresa ainda não tem movimentações" : "dados sincronizados"}
              </p>
            </div>

            <div className={`order-3 flex h-10 w-full items-center gap-1 rounded-[12px] bg-white p-1 sm:order-none sm:w-auto ${primeiroAcesso ? "pointer-events-none opacity-50" : ""}`}>
              {["Mês", "Trimestre", "Ano"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`flex-1 rounded-[9px] px-3.5 py-[7px] text-[13px] transition active:scale-[0.98] sm:flex-none ${
                    period === item ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div ref={notificationsAnchor} className="relative">
              <button
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F8FAF9] active:scale-95"
              >
                <NotificationIcon size={17} />
                {(dashboard?.overdue.count ?? 0) > 0 && <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#E5533D] ring-2 ring-white" />}
              </button>
              {notificationsOpen && (
                <div className="popover-enter absolute right-0 top-12 z-30 w-[300px] rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_rgba(11,31,20,.18)]">
                  <div className="flex items-center gap-2 px-1 pb-2.5">
                    <strong className="text-[13px]">Notificações</strong>
                    {!nadaPendente && <span className="ml-auto rounded-md bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#8E1F16]">{atrasadas + pendentes} pendente{atrasadas + pendentes === 1 ? "" : "s"}</span>}
                  </div>
                  {/* Mesma regra do cartão "Precisa de você": zero não é notificação. */}
                  {nadaPendente && <NadaPendente texto="Avisamos aqui quando houver atraso ou lançamento a revisar." />}
                  {atrasadas > 0 && (
                    <button onClick={() => setLocation("/lancamentos")} className="flex w-full gap-3 rounded-xl bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#E5533D]" />
                      <span><strong className="block text-xs text-[#8E1F16]">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</strong><span className="mt-0.5 block text-[11px] text-[#8A4A45]">Total pendente de {formatMoney(dashboard?.overdue.amount ?? 0)}</span></span>
                    </button>
                  )}
                  {pendentes > 0 && (
                    <button onClick={() => setLocation("/lancamentos")} className="mt-1.5 flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-[#F1F4F2]">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#12B85C]" />
                      <span><strong className="block text-xs">Lançamentos pendentes</strong><span className="mt-0.5 block text-[11px] text-[#8A968D]">{pendentes} {pendentes === 1 ? "item aguarda" : "itens aguardam"} revisão</span></span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {podeEscrever && (
            <button
              type="button"
              onClick={() => setNovoLancamento(true)}
              className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[0.98] sm:px-4"
            >
              <PlusIcon size={15} />
              <span className="hidden sm:inline">Novo lançamento</span>
              <span className="sm:hidden">Novo</span>
            </button>
            )}

            <ProfileMenu />
          </header>

          {carregando && <VisaoGeralSkeleton />}

          {!carregando && primeiroAcesso && podeEscrever && (
            <VisaoGeralVazia
              empresa={companyQuery.data?.legalName || null}
              categorias={overviewQuery.data ? overviewQuery.data.categories.length : null}
              contas={accountCount}
              lancamentos={lancamentos}
              onCadastrarConta={() => setLocation("/organizacao?nova=conta")}
              onNovoLancamento={() => setNovoLancamento(true)}
              onImportar={() => setLocation("/lancamentos?importar=extrato")}
            />
          )}

          {!carregando && (!primeiroAcesso || !podeEscrever) && (<>
          <div className="grid gap-5 xl:grid-cols-[392px_minmax(0,1fr)]">
            <AuroraSurface className="min-h-[326px] rounded-[20px] p-5 sm:p-6">
              <div className="flex flex-1 flex-col gap-[18px]">
              <div className="relative z-10 flex items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8FB39E]">Caixa disponível</span>
                {/* O olhinho mora aqui, e só aqui: ver HideValuesButton. */}
                <HideValuesButton tone="onDark" className="ml-auto" />
                <span className="rounded-lg bg-[#06120B]/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                  {accountCount} {accountCount === 1 ? "conta" : "contas"}
                </span>
              </div>
              <div className="relative z-10 flex flex-col gap-1.5">
                <strong className="text-[36px] leading-none tracking-[-0.03em] sm:text-[42px]">{formatMoney(dashboard?.cashAvailable ?? 0)}</strong>
                <span className={`text-[13px] font-semibold ${(dashboard?.current.balance ?? 0) >= 0 ? "text-[#7EE2A8]" : "text-[#F4A497]"}`}>{formatMoney(dashboard?.current.balance ?? 0)} no período</span>
              </div>
              <div className="relative z-10 min-h-[96px] flex-1" aria-label="Curva de evolução do saldo acumulado">
                {cashCurve ? (
                  <>
                  <svg
                    viewBox={`0 0 ${cashCurve.width} ${cashCurve.height}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full overflow-visible"
                    role="img"
                    aria-label="Evolução do saldo no período selecionado"
                  >
                    <polygon points={cashCurve.areaPoints} fill="#12B85C" opacity="0.22" />
                    <polyline
                      points={cashCurve.linePoints}
                      fill="none"
                      stroke="#7EE2A8"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                  <ChartDot
                    x={cashCurve.lastPoint.x}
                    y={cashCurve.lastPoint.y}
                    width={cashCurve.width}
                    height={cashCurve.height}
                    size={9}
                    color="#FFFFFF"
                  />
                  </>
                ) : (
                  <span className="flex h-full items-center justify-center text-[11px] font-medium text-[#8FB39E]">Sem histórico de movimentações</span>
                )}
              </div>
              <div className="relative z-10 mt-auto grid grid-cols-2 gap-5 border-t border-[#1F3D2B] pt-4">
                <div><span className="block text-[11px] text-[#8FB39E]">Entradas no período</span><strong className="mt-0.5 block text-[17px]">{formatMoney(dashboard?.current.incoming ?? 0)}</strong></div>
                <div><span className="block text-[11px] text-[#8FB39E]">Saídas no período</span><strong className="mt-0.5 block text-[17px] text-[#F4A497]">{formatMoney(dashboard?.current.outgoing ?? 0)}</strong></div>
              </div>
              </div>
            </AuroraSurface>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA]"><ArrowUpIcon size={20} className="text-[#0A7A42]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A receber</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#0A7A42]">{formatMoney(dashboard?.pendingReceivable.amount ?? 0)}</strong>
                  <span className="text-xs text-[#8A968D]">{dashboard?.pendingReceivable.count ?? 0} título{dashboard?.pendingReceivable.count === 1 ? "" : "s"} · {dashboard?.dueToday.count ?? 0} vence{dashboard?.dueToday.count === 1 ? "" : "m"} hoje</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#FDECEA]"><ArrowDownIcon size={20} className="text-[#B3261E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A pagar</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#B3261E]">{formatMoney(dashboard?.pendingPayable.amount ?? 0)}</strong>
                  <span className="text-xs font-semibold text-[#B3261E]">{dashboard?.overdue.count ?? 0} em atraso · {formatMoney(dashboard?.overdue.amount ?? 0)}</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#F1F4F2]"><ChartIcon size={20} className="text-[#28382E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">Margem líquida</span></div>
                  <strong className="text-[26px] tracking-[-0.02em]">{(dashboard?.margin ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
                  <span className="text-xs font-semibold text-[#0A7A42]">Calculada sobre o período selecionado</span>
                </article>
              </div>

              <section className="rounded-[20px] bg-white p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-[15px] font-bold">Entradas e saídas</h2>
                  <div className="ml-auto flex gap-3.5 text-xs text-[#4C6355]">
                    <span className="flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-[3px] bg-[#12B85C]" />Entradas</span>
                    <span className="flex items-center gap-1.5"><i className="h-[9px] w-[9px] rounded-[3px] bg-[#E5533D]" />Saídas</span>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-[46px_minmax(0,1fr)] gap-3">
                  <div className="flex h-[150px] flex-col justify-between text-right text-[9.5px] font-medium leading-none text-[#8A968D] sm:text-[10.5px]">
                    {chartTicks.map((value, index) => <span key={index}>{formatMoney(value, true)}</span>)}
                  </div>
                  <div className="relative h-[150px]">
                    <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                      {Array.from({ length: 5 }).map((_, index) => <span key={index} className="block border-t border-dashed border-[#DFE6E1]" />)}
                    </div>
                    <div className="relative z-10 flex h-full items-end gap-2 sm:gap-4">
                      {months.map((month, index) => {
                        /*
                         * Nos meses das pontas o balão é ancorado pelo lado de
                         * dentro: centralizado, ele passaria da borda do cartão
                         * e sairia meio de fora da tela.
                         */
                        const ponta = index >= months.length - 2 ? "fim" : index <= 1 ? "inicio" : "meio";
                        const posicaoBalao = ponta === "fim" ? "right-0" : ponta === "inicio" ? "left-0" : "left-1/2 -translate-x-1/2";
                        const posicaoSeta = ponta === "fim" ? "right-3" : ponta === "inicio" ? "left-3" : "left-1/2 -translate-x-1/2";
                        return (
                        <div key={`${month.label}-${index}`} className="group relative flex h-full flex-1 items-end gap-[3px] sm:gap-1">
                          {/* O `title` do navegador demora quase um segundo e sai
                              fora do desenho da tela. Este balão aparece na hora,
                              e é o mesmo verde do resto do produto. */}
                          <span className={`pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap rounded-[10px] bg-[#12B85C] px-2.5 py-2 text-[11.5px] font-semibold text-white opacity-0 shadow-[0_8px_22px_rgba(11,31,20,.22)] transition-opacity duration-[90ms] group-hover:opacity-100 ${posicaoBalao}`}>
                            <span className="block text-[10px] font-bold uppercase tracking-[.08em] text-white/70">{month.label}</span>
                            <span className="mt-1 block">Entradas {formatMoney(month.incoming)}</span>
                            <span className="block">Saídas {formatMoney(month.outgoing)}</span>
                            <span className={`absolute top-full -mt-1 h-2 w-2 rotate-45 bg-[#12B85C] ${posicaoSeta}`} />
                          </span>
                          <span className="barra-do-grafico flex-1 rounded-t-[5px] bg-[#12B85C] transition-[filter] duration-200 group-hover:brightness-110" style={{ height: `${Math.max(month.incoming > 0 ? 3 : 0, (month.incoming / chartScale) * 100)}%`, animationDelay: `${index * 55}ms` }} />
                          <span className={`barra-do-grafico flex-1 rounded-t-[5px] transition-[filter] duration-200 group-hover:brightness-95 ${index === months.length - 1 ? "bg-[#E5533D]" : "bg-[#F4A497]"}`} style={{ height: `${Math.max(month.outgoing > 0 ? 3 : 0, (month.outgoing / chartScale) * 100)}%`, animationDelay: `${index * 55 + 28}ms` }} />
                        </div>
                        );
                      })}
                    </div>
                  </div>
                  <span aria-hidden="true" />
                  <div className="flex text-center text-[10px] text-[#8A968D] sm:text-[11.5px]">
                    {months.map((month, index) => <span key={`${month.label}-${index}`} className={`flex-1 ${index === months.length - 1 ? "font-semibold text-[#0B1F14]" : ""}`}>{month.label}</span>)}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
            {/*
              A seção é coluna flex porque ela ESTICA: na grade ela acompanha a
              altura da coluna da direita, e sem isso o bloco de vazio parava na
              altura mínima dele e deixava uma faixa branca embaixo. Com a
              coluna, o vazio ocupa o cartão inteiro e se centraliza nele — que
              é como a tela de primeiro acesso já desenhava.
            */}
            <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-bold">Últimos lançamentos</h2>
                <button onClick={() => setLocation("/lancamentos")} className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-[#0A7A42] hover:text-[#0B1F14]">
                  Ver extrato <ChevronRightIcon size={14} />
                </button>
              </div>
              <div className="mt-3.5 flex flex-1 flex-col gap-1.5">
                {(dashboard?.recent ?? []).map((transaction) => {
                  const isPositive = transaction.amount > 0;
                  const initials = transaction.description.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]?.toUpperCase()).join("");
                  return (
                    <button
                      key={transaction.id}
                      type="button"
                      onClick={() => setLocation("/lancamentos")}
                      className="group flex w-full items-center gap-3 rounded-[14px] bg-[#F8FAF9] px-3 py-2.5 text-left transition hover:bg-[#F1F4F2] active:scale-[0.995]"
                    >
                      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${isPositive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>
                        {initials || "NV"}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <strong className="truncate text-[13px] font-semibold sm:text-[13.5px]">{transaction.description}</strong>
                        <span className="truncate text-[11px] text-[#8A968D] sm:text-[11.5px]">{transaction.category} · {new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                      </span>
                      <span className={`hidden rounded-md px-[9px] py-[3px] text-[11px] font-semibold sm:block ${transaction.status === "Pago" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FFF5DD] text-[#B87500]"}`}>
                        {transaction.status}
                      </span>
                      <strong className={`w-[88px] shrink-0 text-right text-xs sm:w-[104px] sm:text-sm ${isPositive ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(transaction.amount)}</strong>
                    </button>
                  );
                })}
                {!dashboardQuery.isLoading && (dashboard?.recent.length ?? 0) === 0 && (
                  <CartaoVazio
                    icone={<MenuIcon size={20} />}
                    titulo="Nenhum lançamento ainda"
                    texto="Entradas e saídas aparecem aqui conforme forem registradas ou importadas do banco."
                    acoes={podeEscrever ? [
                      { rotulo: "Novo lançamento", onClick: () => setNovoLancamento(true), icone: <PlusIcon size={15} /> },
                      { rotulo: "Importar extrato", onClick: () => setLocation("/lancamentos?importar=extrato"), icone: <UploadIcon size={15} />, tom: "secundario" },
                    ] : []}
                  />
                )}
              </div>
            </section>

            <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Receita por canal</h2>
                <div className="mt-3.5 space-y-3">
                  {(dashboard?.revenueByCategory ?? []).map((channel) => (
                    <div key={channel.label}>
                      <div className="flex text-[12.5px]"><span>{channel.label}</span><strong className="ml-auto">{formatMoney(channel.amount)}</strong></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded bg-[#EDF2EE]"><div className="h-full rounded bg-[#12B85C] transition-all duration-300" style={{ width: `${dashboard?.current.incoming ? (channel.amount / dashboard.current.incoming) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                  {!dashboardQuery.isLoading && (dashboard?.revenueByCategory.length ?? 0) === 0 && <BarrasFantasma texto="As categorias de receita aparecem aqui depois das primeiras entradas do mês." />}
                </div>
              </section>

              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Precisa de você</h2>
                <div className="mt-3 space-y-2">
                  {/*
                    Três linhas de zero não são uma lista de pendências: são o
                    aviso de que não há nenhuma, dito da forma mais cansativa
                    possível. Com tudo zerado o cartão diz isso em uma linha.
                  */}
                  {nadaPendente ? <NadaPendente /> : (<>
                  {atrasadas > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#8E1F16]">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><strong className="text-[13px] text-[#8E1F16]">{formatMoney(dashboard?.overdue.amount ?? 0)}</strong></button>}
                  {pendentes > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1F4F2] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold">{pendentes} lançamento{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}</span><strong className="text-[12.5px] text-[#0A7A42]">Revisar</strong></button>}
                  {recebimentosHoje > 0 && <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">{recebimentosHoje} recebimento{recebimentosHoje === 1 ? "" : "s"} hoje</span><strong className="text-[13px] text-[#0A7A42]">{formatMoney(dashboard?.dueToday.amount ?? 0)}</strong></button>}
                  </>)}
                </div>
              </section>
            </aside>
          </div>
          </>)}
        </section>
      </div>

      {novoLancamento && user?.id && user.activeCompanyId && (
        <TransactionModal
          defaultDate={today()}
          draftScope={{ userId: user.id, companyId: user.activeCompanyId }}
          pending={createMutation.isPending}
          options={organizationOptions}
          onManageOrganization={() => setLocation("/organizacao")}
          onClose={() => setNovoLancamento(false)}
          onSave={salvarLancamento}
        />
      )}
    </main>
  );
}
