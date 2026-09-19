import { useAuth } from "@/_core/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
import { VisaoGeralSkeleton } from "@/components/PageSkeleton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { greetingFor } from "@/lib/greeting";
import { activePreferences, maskedMoney, valuesHidden, formatMoney as formatMoneyWithPreferences, formatDate, today } from "@/lib/appFormat";
import { buildCashCurve } from "@/lib/cashCurve";
import { usePreferences } from "@/contexts/PreferencesContext";
import { CURRENCY_LOCALES, type DefaultPeriod } from "@shared/preferences";
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
import type { CSSProperties } from "react";
// O design system Voltura, com escopo nesta página (ver DESIGN.md na raiz).
import "@/styles/voltura.css";


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

/*
 * Ícones Tabler (contorno, traço 1.5), que é a família que o DESIGN.md pede.
 * São só os desta tela; os caminhos vêm do SVG oficial do Tabler.
 */
const TABLER = {
  menu: ["M4 6l16 0", "M4 12l16 0", "M4 18l16 0"],
  sino: ["M10 5a2 2 0 1 1 4 0a7 7 0 0 1 4 6v3a4 4 0 0 0 2 3h-16a4 4 0 0 0 2 -3v-3a7 7 0 0 1 4 -6", "M9 17v1a3 3 0 0 0 6 0v-1"],
  mais: ["M12 5l0 14", "M5 12l14 0"],
  entrada: ["M17 7l-10 10", "M8 7l9 0l0 9"],
  saida: ["M17 7l-10 10", "M16 17l-9 0l0 -9"],
  seta: ["M5 12l14 0", "M13 18l6 -6", "M13 6l6 6"],
  ok: ["M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0 -18 0", "M9 12l2 2l4 -4"],
  upload: ["M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2", "M7 9l5 -5l5 5", "M12 4l0 12"],
  recibo: ["M9 7h6", "M9 11h6", "M9 15h4", "M5 21v-16a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v16l-3 -2l-2 2l-2 -2l-2 2l-2 -2l-3 2"],
};

function Tabler({ d, size = 18, sw = 1.5, className, style }: { d: string[]; size?: number; sw?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={{ flexShrink: 0, ...style }}>
      {d.map(caminho => <path key={caminho} d={caminho} />)}
    </svg>
  );
}

/*
 * As cores categóricas do sistema, na ordem em que ele as lista. O quinto
 * canal em diante fica cinza: as quatro cores existem para diferenciar
 * categorias, e com mais do que isso a barra vira arco-íris.
 */
const CORES_DOS_CANAIS = ["var(--v-cat-coral)", "var(--v-cat-magenta)", "var(--v-cat-green)", "var(--v-cat-blue)"];

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
    <main className="voltura vg-pagina">
      <div className="flex w-full">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="vg-casca flex min-w-0 flex-1 flex-col">
          <header className="v-topbar vg-topo">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                aria-label="Abrir menu"
                onClick={() => setMobileOpen(true)}
                className="v-btn v-btn--secondary v-btn--icon xl:hidden"
              >
                <Tabler d={TABLER.menu} />
              </button>
              <div className="flex min-w-0 flex-col gap-1">
                <h1 className="v-h1 truncate">{greeting}, {firstName}</h1>
                <span className="v-caption truncate">
                  {currentMonthLabel} · {primeiroAcesso ? "sua empresa ainda não tem movimentações" : "dados sincronizados"}
                </span>
              </div>
            </div>

            <div className="vg-topo__acoes">
              <div className={`v-pill-tabs ${primeiroAcesso ? "pointer-events-none opacity-50" : ""}`} role="tablist" aria-label="Período">
                {["Mês", "Trimestre", "Ano"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    role="tab"
                    aria-selected={period === item}
                    onClick={() => setPeriod(item)}
                    className={`v-pill-tabs__item ${period === item ? "v-pill-tabs__item--active" : ""}`}
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
                  className="v-btn v-btn--secondary v-btn--icon relative"
                >
                  <Tabler d={TABLER.sino} />
                  {(dashboard?.overdue.count ?? 0) > 0 && <span className="vg-ponto" />}
                </button>
                {notificationsOpen && (
                  <div className="popover-enter v-card v-card--compact vg-notificacoes">
                    <div className="v-card__head">
                      <strong className="v-card__title">Notificações</strong>
                      {!nadaPendente && <span className="v-chip v-chip--delta-down">{atrasadas + pendentes} pendente{atrasadas + pendentes === 1 ? "" : "s"}</span>}
                    </div>
                    {/* Mesma regra do cartão "Precisa de você": zero não é notificação. */}
                    {nadaPendente && <span className="v-caption">Avisamos aqui quando houver atraso ou lançamento a revisar.</span>}
                    <div className="v-list">
                      {atrasadas > 0 && (
                        <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha">
                          <span className="v-list__icon v-list__icon--neg"><Tabler d={TABLER.saida} size={16} /></span>
                          <span className="v-asset-row__meta"><span className="v-list__title">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><span className="v-caption">Total pendente de {formatMoney(dashboard?.overdue.amount ?? 0)}</span></span>
                          <Tabler d={TABLER.seta} size={16} className="v-muted" />
                        </button>
                      )}
                      {pendentes > 0 && (
                        <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha">
                          <span className="v-list__icon"><Tabler d={TABLER.recibo} size={16} /></span>
                          <span className="v-asset-row__meta"><span className="v-list__title">Lançamentos pendentes</span><span className="v-caption">{pendentes} {pendentes === 1 ? "item aguarda" : "itens aguardam"} revisão</span></span>
                          <Tabler d={TABLER.seta} size={16} className="v-muted" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {podeEscrever && (
                <button type="button" onClick={() => setNovoLancamento(true)} className="v-btn v-btn--primary">
                  <Tabler d={TABLER.mais} size={16} sw={2} />
                  <span className="hidden sm:inline">Novo lançamento</span>
                  <span className="sm:hidden">Novo</span>
                </button>
              )}

              <ProfileMenu />
            </div>
          </header>

          <div className="v-content">
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
          {/* ---- Linha de destaque: o cartão luminoso e o resumo do período ---- */}
          <div className="v-grid v-grid--hero">
            {/*
              O único cartão aceso da tela: o caixa disponível. Tudo o que o
              sistema pede para o "focal card" — o número principal, o
              subdado em chip escuro e a curva — mora aqui.
            */}
            <article className="v-card v-card--focal vg-focal">
              <div className="v-card__head">
                <span className="v-kpi__label">Caixa disponível</span>
                <div className="v-card__actions">
                  {/* O olhinho mora aqui, e só aqui: ver HideValuesButton. */}
                  <HideValuesButton tone="light" className="vg-olho" />
                  <span className="v-chip v-chip--on-acid">{accountCount} {accountCount === 1 ? "conta" : "contas"}</span>
                </div>
              </div>
              <div className="v-kpi">
                <strong className="v-numeral-2xl vg-focal__valor">{formatMoney(dashboard?.cashAvailable ?? 0)}</strong>
                <span className="v-kpi__sub">
                  <Tabler d={(dashboard?.current.balance ?? 0) >= 0 ? TABLER.entrada : TABLER.saida} size={14} sw={2} />
                  {formatMoney(dashboard?.current.balance ?? 0)} no período
                </span>
              </div>
              <div className="vg-focal__curva" aria-label="Curva de evolução do saldo acumulado">
                {cashCurve ? (
                  <>
                  <svg
                    viewBox={`0 0 ${cashCurve.width} ${cashCurve.height}`}
                    preserveAspectRatio="none"
                    className="absolute inset-0 h-full w-full overflow-visible"
                    role="img"
                    aria-label="Evolução do saldo no período selecionado"
                  >
                    <polygon points={cashCurve.areaPoints} fill="#14181a" opacity="0.10" />
                    <polyline
                      points={cashCurve.linePoints}
                      fill="none"
                      stroke="#14181a"
                      strokeWidth="2.5"
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
                    size={10}
                    color="#14181a"
                    ringColor="rgba(20,24,26,0.18)"
                  />
                  </>
                ) : (
                  <span className="flex h-full items-center text-[12px] font-medium" style={{ color: "rgba(20,24,26,0.62)" }}>Sem histórico de movimentações</span>
                )}
              </div>
              <div className="v-kpi-grid vg-focal__pe">
                <div className="v-kpi"><span className="v-kpi__label">Entradas</span><strong className="v-numeral vg-focal__mini">{formatMoney(dashboard?.current.incoming ?? 0)}</strong></div>
                <div className="v-kpi"><span className="v-kpi__label">Saídas</span><strong className="v-numeral vg-focal__mini">{formatMoney(dashboard?.current.outgoing ?? 0)}</strong></div>
              </div>
            </article>

            <article className="v-card">
              <header className="v-card__head">
                <div>
                  <h2 className="v-card__title">Resumo do período</h2>
                  <p className="v-caption" style={{ margin: "4px 0 0" }}>{period} · {currentMonthLabel}</p>
                </div>
                <div className="v-card__actions">
                  <button type="button" onClick={() => setLocation("/a-pagar-e-receber")} className="v-btn v-btn--secondary v-btn--sm">
                    A pagar e receber
                    <Tabler d={TABLER.seta} size={14} />
                  </button>
                </div>
              </header>

              <div className="vg-kpis">
                <div className="v-kpi">
                  <span className="v-kpi__label">A receber</span>
                  <strong className="v-kpi__value">{formatMoney(dashboard?.pendingReceivable.amount ?? 0)}</strong>
                  <span className="v-kpi__sub">{dashboard?.pendingReceivable.count ?? 0} título{dashboard?.pendingReceivable.count === 1 ? "" : "s"} · {dashboard?.dueToday.count ?? 0} vence{dashboard?.dueToday.count === 1 ? "" : "m"} hoje</span>
                </div>
                <div className="v-kpi">
                  <span className="v-kpi__label">A pagar</span>
                  <strong className="v-kpi__value">{formatMoney(dashboard?.pendingPayable.amount ?? 0)}</strong>
                  <span className="v-kpi__sub">
                    {atrasadas > 0
                      ? <><span className="v-chip v-chip--delta-down"><Tabler d={TABLER.saida} size={12} sw={2.2} />{atrasadas} em atraso</span>{formatMoney(dashboard?.overdue.amount ?? 0)}</>
                      : "Nada em atraso"}
                  </span>
                </div>
                <div className="v-kpi">
                  <span className="v-kpi__label">Margem líquida</span>
                  <strong className="v-kpi__value">{(dashboard?.margin ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong>
                  <span className="v-kpi__sub">Sobre o período selecionado</span>
                </div>
              </div>

              <hr className="v-divider" />

              <div className="vg-dist">
                <div>
                  <div className="v-card__title" style={{ fontSize: "var(--v-fs-14)" }}>Receita por canal</div>
                  <div className="v-caption" style={{ marginTop: 4 }}>Participação de cada categoria nas entradas</div>
                </div>
                {canais.length > 0 ? (
                  <div className="v-dist">
                    <div className="v-dist__bar" role="img" aria-label={canais.map(c => `${c.label} ${c.share.toFixed(0)}%`).join(", ")}>
                      {canais.map(c => <span key={c.label} className="v-dist__seg" style={{ flex: `0 0 ${c.share}%`, background: c.cor }} />)}
                    </div>
                    <div className="v-dist__legend">
                      {canais.map(c => (
                        <div key={c.label} className="v-dist__item">
                          <span className="v-dist__dot" style={{ background: c.cor }} />
                          <span className="v-dist__nome">{c.label}</span>
                          <span className="v-dist__value">{formatMoney(c.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <span className="v-caption">As categorias de receita aparecem aqui depois das primeiras entradas do período.</span>
                )}
              </div>
            </article>
          </div>

          {/* ---- Linha dividida: gráfico à esquerda, lançamentos e pendências à direita ---- */}
          <div className="v-grid v-grid--split">
            <article className="v-card">
              <header className="v-card__head">
                <div>
                  <h2 className="v-card__title">Entradas e saídas</h2>
                  <p className="v-caption" style={{ margin: "4px 0 0" }}>Por mês · {period.toLowerCase()} atual</p>
                </div>
                <div className="v-card__actions vg-legenda">
                  <span className="v-dist__item"><span className="v-dist__dot" style={{ background: "var(--v-acid)" }} />Entradas</span>
                  <span className="v-dist__item"><span className="v-dist__dot" style={{ background: "var(--v-moss-deep)" }} />Saídas</span>
                </div>
              </header>
              <div className="vg-grafico">
                <div className="vg-grafico__eixo">
                  {chartTicks.map((value, index) => <span key={index}>{formatMoney(value, true)}</span>)}
                </div>
                <div className="relative h-full min-h-[170px]">
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
                    {Array.from({ length: 5 }).map((_, index) => <span key={index} className="vg-grafico__linha" />)}
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
                      return (
                      <div key={`${month.label}-${index}`} className="group relative flex h-full flex-1 items-end gap-[3px] sm:gap-1">
                        <span className={`v-chart__tip pointer-events-none absolute bottom-full z-20 mb-2 whitespace-nowrap opacity-0 transition-opacity duration-[90ms] group-hover:opacity-100 ${posicaoBalao}`} style={{ position: "absolute" }}>
                          <span className="v-label">{month.label}</span>
                          <span className="v-chart__tip-val">{formatMoney(month.incoming)}</span>
                          <span className="v-caption">Saídas {formatMoney(month.outgoing)}</span>
                        </span>
                        <span className="barra-do-grafico flex-1 rounded-t-[4px] transition-[filter] duration-200 group-hover:brightness-110" style={{ background: "var(--v-acid)", height: `${Math.max(month.incoming > 0 ? 3 : 0, (month.incoming / chartScale) * 100)}%`, animationDelay: `${index * 55}ms` }} />
                        <span className="barra-do-grafico flex-1 rounded-t-[4px] transition-[filter] duration-200 group-hover:brightness-125" style={{ background: index === months.length - 1 ? "var(--v-moss)" : "var(--v-moss-deep)", height: `${Math.max(month.outgoing > 0 ? 3 : 0, (month.outgoing / chartScale) * 100)}%`, animationDelay: `${index * 55 + 28}ms` }} />
                      </div>
                      );
                    })}
                  </div>
                </div>
                <span aria-hidden="true" />
                <div className="vg-grafico__meses">
                  {months.map((month, index) => <span key={`${month.label}-${index}`} className={index === months.length - 1 ? "vg-grafico__mes--atual" : ""}>{month.label}</span>)}
                </div>
              </div>
            </article>

            <div className="flex min-w-0 flex-col gap-5">
              <article className="v-card vg-lancamentos">
                <header className="v-card__head">
                  <div>
                    <h2 className="v-card__title">Últimos lançamentos</h2>
                    <p className="v-caption" style={{ margin: "4px 0 0" }}>Movimentações mais recentes</p>
                  </div>
                  <button type="button" onClick={() => setLocation("/lancamentos")} className="v-btn v-btn--ghost v-btn--sm">
                    Ver extrato <Tabler d={TABLER.seta} size={14} />
                  </button>
                </header>
                <div className="v-list">
                  {(dashboard?.recent ?? []).map((transaction) => {
                    const isPositive = transaction.amount > 0;
                    return (
                      <button
                        key={transaction.id}
                        type="button"
                        onClick={() => setLocation("/lancamentos")}
                        className="v-list__row vg-linha"
                      >
                        <span className={`v-list__icon ${isPositive ? "" : "v-list__icon--neg"}`}>
                          <Tabler d={isPositive ? TABLER.entrada : TABLER.saida} size={16} sw={1.8} />
                        </span>
                        <span className="v-asset-row__meta">
                          <span className="v-list__title truncate">{transaction.description}</span>
                          <span className="v-list__sub truncate">{transaction.category} · {new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                        </span>
                        <span className="flex flex-col items-end gap-0.5">
                          <span className="v-list__amt">{formatMoney(transaction.amount)}</span>
                          <span className="v-list__time">{transaction.status}</span>
                        </span>
                      </button>
                    );
                  })}
                  {!dashboardQuery.isLoading && (dashboard?.recent.length ?? 0) === 0 && (
                    <div className="vg-vazio">
                      <Tabler d={TABLER.recibo} size={28} className="v-muted" />
                      <strong className="v-h3">Nenhum lançamento ainda</strong>
                      <span className="v-caption">Entradas e saídas aparecem aqui conforme forem registradas ou importadas do banco.</span>
                      {podeEscrever && (
                        <div className="v-row" style={{ marginTop: 8 }}>
                          <button type="button" onClick={() => setNovoLancamento(true)} className="v-btn v-btn--primary v-btn--sm"><Tabler d={TABLER.mais} size={14} sw={2} />Novo lançamento</button>
                          <button type="button" onClick={() => setLocation("/lancamentos?importar=extrato")} className="v-btn v-btn--secondary v-btn--sm"><Tabler d={TABLER.upload} size={14} />Importar extrato</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </article>

              <article className="v-card v-card--compact">
                <header className="v-card__head" style={{ alignItems: "center" }}>
                  <h2 className="v-card__title">Precisa de você</h2>
                  {!nadaPendente && <span className="v-chip">{atrasadas + pendentes + recebimentosHoje}</span>}
                </header>
                {/*
                  Três linhas de zero não são uma lista de pendências: são o
                  aviso de que não há nenhuma. Com tudo zerado o cartão diz
                  isso em uma linha.
                */}
                {nadaPendente ? (
                  <span className="v-caption flex items-center gap-2"><Tabler d={TABLER.ok} size={16} style={{ color: "var(--v-pos)" }} />Atrasos, conciliações e recebimentos do dia aparecem aqui.</span>
                ) : (
                  <div className="v-list">
                    {atrasadas > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon v-list__icon--neg"><Tabler d={TABLER.saida} size={16} /></span><span className="v-list__title">{atrasadas} conta{atrasadas === 1 ? "" : "s"} em atraso</span><span className="v-chip v-chip--delta-down">{formatMoney(dashboard?.overdue.amount ?? 0)}</span></button>}
                    {pendentes > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon" style={{ background: "rgba(236,239,232,0.06)", color: "var(--v-text)" }}><Tabler d={TABLER.recibo} size={16} /></span><span className="v-list__title">{pendentes} lançamento{pendentes === 1 ? "" : "s"} pendente{pendentes === 1 ? "" : "s"}</span><span className="v-chip">Revisar</span></button>}
                    {recebimentosHoje > 0 && <button type="button" onClick={() => setLocation("/lancamentos")} className="v-list__row vg-linha"><span className="v-list__icon"><Tabler d={TABLER.entrada} size={16} /></span><span className="v-list__title">{recebimentosHoje} recebimento{recebimentosHoje === 1 ? "" : "s"} hoje</span><span className="v-chip v-chip--delta-up">{formatMoney(dashboard?.dueToday.amount ?? 0)}</span></button>}
                  </div>
                )}
              </article>
            </div>
          </div>
          </>)}
          </div>
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
