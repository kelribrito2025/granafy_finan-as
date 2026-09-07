import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DocumentIcon,
  MenuIcon,
  NotificationIcon,
  PlusIcon,
  TrendUpIcon,
  UsersIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type NavItem = {
  label: string;
  icon: IconlyIcon;
  badge?: string;
  badgeTone?: "positive" | "negative" | "neutral";
};

const panelItems: NavItem[] = [
  { label: "Visão geral", icon: DashboardIcon },
  { label: "Fluxo de caixa", icon: TrendUpIcon },
  { label: "Contas a pagar", icon: ArrowDownIcon },
  { label: "Contas a receber", icon: ArrowUpIcon },
  { label: "Lançamentos", icon: DocumentIcon },
  { label: "Conciliação", icon: CheckIcon },
];

const analysisItems: NavItem[] = [
  { label: "DRE", icon: DocumentIcon },
  { label: "Relatórios", icon: ChartIcon },
  { label: "Clientes", icon: UsersIcon },
];

function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 2,
  }).format(value);
}

const badgeClass = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

function NavGroup({
  title,
  items,
  active,
  onSelect,
}: {
  title: string;
  items: NavItem[];
  active: string;
  onSelect: (item: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B3BFB7]">
        {title}
      </span>
      {items.map(({ label, icon: Icon, badge, badgeTone = "neutral" }) => {
        const selected = active === label;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(label)}
            className={`group flex w-full items-center gap-[11px] rounded-xl px-3 py-[11px] text-left text-[13.5px] transition-all duration-150 active:scale-[0.98] ${
              selected
                ? "bg-[#12B85C] font-bold text-white"
                : "text-[#28382E] hover:bg-[#F1FBF6]"
            }`}
          >
            <Icon size={16} />
            <span className="truncate">{label}</span>
            {badge && (
              <span
                className={`ml-auto rounded-md px-[9px] py-[3px] text-[11px] font-semibold ${
                  selected ? "bg-white/18 text-white" : badgeClass[badgeTone]
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Sidebar({
  active,
  onSelect,
  mobileOpen,
  onClose,
}: {
  active: string;
  onSelect: (item: string) => void;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const select = (item: string) => {
    onSelect(item);
    onClose();
  };

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Fechar menu"
          className="fixed inset-0 z-40 bg-[#07150d]/35 backdrop-blur-[2px] xl:hidden"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[22px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform duration-200 xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:min-h-0 xl:translate-x-0 xl:shadow-none ${
          mobileOpen ? "translate-x-0" : "-translate-x-[260px]"
        }`}
      >
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#12B85C] text-[15px] font-bold text-white shadow-[0_8px_18px_rgba(18,184,92,.22)]">
            NV
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-bold">NV Financeiro</span>
            <span className="truncate text-[11px] text-[#8A968D]">Número Virtual LTDA</span>
          </div>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden"
          >
            <CloseIcon size={17} />
          </button>
        </div>

        <NavGroup title="Painel" items={panelItems} active={active} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} active={active} onSelect={select} />

        <div className="mt-auto rounded-2xl bg-[#F1FBF6] p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0A7A42]">
            Banco conectado
          </span>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[#4C6355]">
            <span className="h-2 w-2 rounded-full bg-[#12B85C]" />
            <span>TiDB Cloud</span>
          </div>
        </div>
      </aside>
    </>
  );
}

export default function Home() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [activeNav, setActiveNav] = useState("Visão geral");
  const [period, setPeriod] = useState("Mês");
  const dashboardRange = period === "Ano" ? "year" : period === "Trimestre" ? "quarter" : "month";
  const dashboardQuery = trpc.transactions.dashboard.useQuery({ range: dashboardRange });
  const dashboard = dashboardQuery.data;
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
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
  const compactBars = useMemo(() => {
    let running = 0;
    const balances = months.map(item => {
      running += item.balance;
      return running;
    });
    if (balances.every(value => value === 0)) return [];
    const maximum = Math.max(1, ...balances.map(value => Math.abs(value)));
    return balances.map(value => Math.max(8, Math.round((Math.abs(value) / maximum) * 100)));
  }, [months]);
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
    if (item !== "Visão geral") {
      toast.info(`${item} ainda não está disponível`, { description: "A visão geral continua mostrando os dados reais da sua conta." });
    }
  };

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 bg-[#EFF4F1] p-3 sm:p-5">
        <Sidebar
          active={activeNav}
          onSelect={selectNav}
          mobileOpen={mobileOpen}
          onClose={() => setMobileOpen(false)}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="relative flex flex-wrap items-center gap-3 xl:gap-4">
            <button
              type="button"
              aria-label="Abrir menu"
              onClick={() => setMobileOpen(true)}
              className="flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#28382E] transition hover:bg-[#F8FAF9] active:scale-95 xl:hidden"
            >
              <MenuIcon size={18} />
            </button>
            <div className="mr-auto flex min-w-[190px] flex-col gap-0.5">
              <h1 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">Bom dia, {firstName}</h1>
              <p className="text-xs text-[#8A968D] sm:text-[13px]">{currentMonthLabel} · dados sincronizados</p>
            </div>

            <div className="order-3 flex w-full items-center gap-1.5 rounded-xl bg-white p-1.5 sm:order-none sm:w-auto">
              {["Mês", "Trimestre", "Ano"].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setPeriod(item)}
                  className={`flex-1 rounded-[9px] px-3.5 py-2 text-[13px] transition active:scale-[0.98] sm:flex-none ${
                    period === item ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                aria-label="Abrir notificações"
                aria-expanded={notificationsOpen}
                onClick={() => setNotificationsOpen((open) => !open)}
                className="relative flex h-[42px] w-[42px] items-center justify-center rounded-[14px] bg-white text-[#28382E] transition hover:bg-[#F8FAF9] active:scale-95"
              >
                <NotificationIcon size={17} />
                {(dashboard?.overdue.count ?? 0) > 0 && <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#E5533D] ring-2 ring-white" />}
              </button>
              {notificationsOpen && (
                <div className="popover-enter absolute right-0 top-12 z-30 w-[300px] rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_rgba(11,31,20,.18)]">
                  <div className="flex items-center gap-2 px-1 pb-2.5">
                    <strong className="text-[13px]">Notificações</strong>
                    <span className="ml-auto rounded-md bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#8E1F16]">{dashboard?.overdue.count ?? 0} pendente{dashboard?.overdue.count === 1 ? "" : "s"}</span>
                  </div>
                  <button onClick={() => setLocation("/lancamentos")} className="flex w-full gap-3 rounded-xl bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#E5533D]" />
                    <span><strong className="block text-xs text-[#8E1F16]">{dashboard?.overdue.count ?? 0} conta{dashboard?.overdue.count === 1 ? "" : "s"} em atraso</strong><span className="mt-0.5 block text-[11px] text-[#8A4A45]">Total pendente de {formatMoney(dashboard?.overdue.amount ?? 0)}</span></span>
                  </button>
                  <button onClick={() => setLocation("/lancamentos")} className="mt-1.5 flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-[#F1F4F2]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#12B85C]" />
                    <span><strong className="block text-xs">Lançamentos pendentes</strong><span className="mt-0.5 block text-[11px] text-[#8A968D]">{(dashboard?.pendingPayable.count ?? 0) + (dashboard?.pendingReceivable.count ?? 0)} itens aguardam revisão</span></span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLocation("/lancamentos")}
              className="flex h-[42px] items-center gap-2 rounded-xl bg-[#12B85C] px-3.5 text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[0.98] sm:px-4"
            >
              <PlusIcon size={15} />
              <span className="hidden sm:inline">Novo lançamento</span>
              <span className="sm:hidden">Novo</span>
            </button>

            <div className="relative">
              <button
                type="button"
                aria-label="Abrir menu da conta"
                aria-expanded={accountOpen}
                onClick={() => setAccountOpen(open => !open)}
                className="flex h-[42px] min-w-[42px] items-center justify-center rounded-[14px] bg-[#0B1F14] px-2.5 text-[11px] font-bold text-white transition hover:bg-[#183526] active:scale-95"
              >
                {accountInitials || "NV"}
              </button>
              {accountOpen && (
                <div className="popover-enter absolute right-0 top-12 z-30 w-[260px] rounded-[18px] bg-white p-3.5 shadow-[0_20px_50px_rgba(11,31,20,.18)]">
                  <div className="flex items-center gap-3 rounded-[13px] bg-[#F8FAF9] p-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[#DFF6EA] text-[#0A7A42]">
                      <UsersIcon size={17} />
                    </span>
                    <span className="min-w-0">
                      <strong className="block truncate text-[12.5px]">{user?.name || "Sua conta"}</strong>
                      <span className="mt-0.5 block truncate text-[10.5px] text-[#8A968D]">{user?.email || "Acesso protegido"}</span>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="mt-2 flex w-full items-center justify-between rounded-[12px] px-3 py-2.5 text-left text-[12px] font-semibold text-[#8E1F16] transition hover:bg-[#FDECEA] active:scale-[0.99]"
                  >
                    Sair da conta
                    <ChevronRightIcon size={14} />
                  </button>
                </div>
              )}
            </div>
          </header>

          <div className="grid gap-5 xl:grid-cols-[392px_minmax(0,1fr)]">
            <section className="flex min-h-[326px] flex-col gap-[18px] overflow-hidden rounded-[20px] bg-[#0B1F14] p-5 text-white sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8FB39E]">Caixa disponível</span>
                <span className="ml-auto rounded-lg bg-[#12B85C]/20 px-2.5 py-1 text-[11px] font-semibold text-[#7EE2A8]">TiDB sincronizado</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <strong className="text-[36px] leading-none tracking-[-0.03em] sm:text-[42px]">{formatMoney(dashboard?.cashAvailable ?? 0)}</strong>
                <span className={`text-[13px] font-semibold ${(dashboard?.current.balance ?? 0) >= 0 ? "text-[#7EE2A8]" : "text-[#F4A497]"}`}>{formatMoney(dashboard?.current.balance ?? 0)} no período</span>
              </div>
              <div className="flex h-16 items-end gap-[5px]" aria-label="Evolução mensal do saldo">
                {compactBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={`flex-1 rounded-[4px] transition-all duration-300 hover:brightness-125 ${index === compactBars.length - 1 ? "bg-[#7EE2A8]" : index >= 5 ? "bg-[#12B85C]" : "bg-[#1F3D2B]"}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
                {compactBars.length === 0 && <span className="m-auto text-[11px] font-medium text-[#8FB39E]">Sem histórico de movimentações</span>}
              </div>
              <div className="mt-auto grid grid-cols-2 gap-5 border-t border-[#1F3D2B] pt-4">
                <div><span className="block text-[11px] text-[#8FB39E]">Entradas no período</span><strong className="mt-0.5 block text-[17px]">{formatMoney(dashboard?.current.incoming ?? 0)}</strong></div>
                <div><span className="block text-[11px] text-[#8FB39E]">Saídas no período</span><strong className="mt-0.5 block text-[17px] text-[#F4A497]">{formatMoney(dashboard?.current.outgoing ?? 0)}</strong></div>
              </div>
            </section>

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
                      {months.map((month, index) => (
                        <div key={`${month.label}-${index}`} className="group flex h-full flex-1 items-end gap-[3px] sm:gap-1" title={`${month.label}: entradas ${formatMoney(month.incoming)}, saídas ${formatMoney(month.outgoing)}`}>
                          <span className="flex-1 rounded-t-[5px] bg-[#12B85C] transition-all duration-200 group-hover:brightness-110" style={{ height: `${Math.max(month.incoming > 0 ? 3 : 0, (month.incoming / chartScale) * 100)}%` }} />
                          <span className={`flex-1 rounded-t-[5px] transition-all duration-200 group-hover:brightness-95 ${index === months.length - 1 ? "bg-[#E5533D]" : "bg-[#F4A497]"}`} style={{ height: `${Math.max(month.outgoing > 0 ? 3 : 0, (month.outgoing / chartScale) * 100)}%` }} />
                        </div>
                      ))}
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
            <section className="min-w-0 rounded-[20px] bg-white p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-bold">Últimos lançamentos</h2>
                <button onClick={() => setLocation("/lancamentos")} className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-[#0A7A42] hover:text-[#0B1F14]">
                  Ver extrato <ChevronRightIcon size={14} />
                </button>
              </div>
              <div className="mt-3.5 flex flex-col gap-1.5">
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
                {!dashboardQuery.isLoading && (dashboard?.recent.length ?? 0) === 0 && <div className="flex flex-col items-center justify-center rounded-[14px] bg-[#F8FAF9] px-5 py-10 text-center"><DocumentIcon size={26} className="text-[#AAB4AD]" /><strong className="mt-2 text-[13px]">Nenhum lançamento salvo</strong><button type="button" onClick={() => setLocation("/lancamentos")} className="mt-3 text-[12px] font-semibold text-[#0A7A42]">Criar primeiro lançamento</button></div>}
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
                  {!dashboardQuery.isLoading && (dashboard?.revenueByCategory.length ?? 0) === 0 && <p className="rounded-xl bg-[#F8FAF9] p-4 text-center text-[12px] text-[#8A968D]">As categorias aparecerão após registrar entradas neste mês.</p>}
                </div>
              </section>

              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Precisa de você</h2>
                <div className="mt-3 space-y-2">
                  <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#8E1F16]">{dashboard?.overdue.count ?? 0} conta{dashboard?.overdue.count === 1 ? "" : "s"} em atraso</span><strong className="text-[13px] text-[#8E1F16]">{formatMoney(dashboard?.overdue.amount ?? 0)}</strong></button>
                  <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1F4F2] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold">{(dashboard?.pendingPayable.count ?? 0) + (dashboard?.pendingReceivable.count ?? 0)} lançamentos pendentes</span><strong className="text-[12.5px] text-[#0A7A42]">Revisar</strong></button>
                  <button onClick={() => setLocation("/lancamentos")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">{dashboard?.dueToday.count ?? 0} recebimento{dashboard?.dueToday.count === 1 ? "" : "s"} hoje</span><strong className="text-[13px] text-[#0A7A42]">{formatMoney(dashboard?.dueToday.amount ?? 0)}</strong></button>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>

    </main>
  );
}
