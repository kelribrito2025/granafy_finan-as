import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  Bell,
  Check,
  ChevronRight,
  FileText,
  LayoutGrid,
  List,
  Menu,
  Plus,
  TrendingUp,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { toast } from "sonner";

type NavItem = {
  label: string;
  icon: LucideIcon;
  badge?: string;
  badgeTone?: "positive" | "negative" | "neutral";
};

const panelItems: NavItem[] = [
  { label: "Visão geral", icon: LayoutGrid },
  { label: "Fluxo de caixa", icon: TrendingUp },
  { label: "Contas a pagar", icon: ArrowDown, badge: "7", badgeTone: "negative" },
  { label: "Contas a receber", icon: ArrowUp, badge: "12", badgeTone: "positive" },
  { label: "Lançamentos", icon: List },
  { label: "Conciliação", icon: Check, badge: "31", badgeTone: "neutral" },
];

const analysisItems: NavItem[] = [
  { label: "DRE", icon: FileText },
  { label: "Relatórios", icon: BarChart3 },
  { label: "Clientes", icon: Users },
];

const compactBars = [36, 44, 38, 56, 50, 66, 74, 62, 88, 100];
const monthlyBars = [
  [52, 36],
  [58, 40],
  [49, 44],
  [64, 41],
  [71, 46],
  [66, 52],
  [79, 48],
  [88, 55],
  [100, 58],
];
const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set"];

const transactions = [
  {
    initials: "PX",
    title: "Recargas Pix · 142 transações",
    subtitle: "Gateway Pix · 05/09",
    status: "Conciliado",
    amount: "+ R$ 9.480",
    tone: "positive",
  },
  {
    initials: "TW",
    title: "Twilio · fatura agosto",
    subtitle: "Custos de plataforma · Inter PJ",
    status: "Atrasado",
    amount: "- R$ 3.180",
    tone: "negative",
  },
  {
    initials: "OC",
    title: "Plano API · Loja Oneclick",
    subtitle: "Receita recorrente · 04/09",
    status: "Conciliado",
    amount: "+ R$ 2.400",
    tone: "positive",
  },
  {
    initials: "GW",
    title: "Taxa do gateway · setembro",
    subtitle: "Taxas financeiras · 03/09",
    status: "A conferir",
    amount: "- R$ 1.147",
    tone: "neutral",
  },
  {
    initials: "FL",
    title: "Folha · equipe suporte",
    subtitle: "Pessoal · 02/09",
    status: "Pago",
    amount: "- R$ 18.300",
    tone: "neutral-positive",
  },
];

const channelRevenue = [
  { label: "Números avulsos", amount: "R$ 48.210", value: 47 },
  { label: "API developers", amount: "R$ 31.400", value: 30 },
  { label: "Planos mensais", amount: "R$ 17.930", value: 17 },
  { label: "Afiliados", amount: "R$ 6.020", value: 6 },
];

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
                ? "bg-[#12B85C] font-bold text-white shadow-[0_8px_20px_rgba(18,184,92,.18)]"
                : "text-[#28382E] hover:bg-[#F1FBF6]"
            }`}
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
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
        className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[22px] overflow-y-auto rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform duration-200 xl:static xl:inset-auto xl:h-auto xl:min-h-[860px] xl:translate-x-0 xl:shadow-none ${
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
            <X size={17} />
          </button>
        </div>

        <NavGroup title="Painel" items={panelItems} active={active} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} active={active} onSelect={select} />

        <div className="mt-auto rounded-2xl bg-[#F1FBF6] p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0A7A42]">
            Contas conectadas
          </span>
          <div className="mt-2 space-y-2 text-[12.5px]">
            <div className="flex justify-between gap-4"><span>Inter PJ</span><strong>96.210</strong></div>
            <div className="flex justify-between gap-4"><span>Nubank PJ</span><strong>24.870</strong></div>
            <div className="flex justify-between gap-4"><span>Gateway Pix</span><strong>7.350</strong></div>
          </div>
        </div>
      </aside>
    </>
  );
}

function TransactionModal({ onClose }: { onClose: () => void }) {
  const [entryType, setEntryType] = useState<"entrada" | "saida">("entrada");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    toast.success("Lançamento criado", {
      description: "O novo lançamento foi incluído na visão financeira.",
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transaction-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form
        onSubmit={submit}
        className="modal-enter w-full max-w-[480px] rounded-[22px] bg-white p-5 text-[#0B1F14] shadow-[0_28px_80px_rgba(11,31,20,.24)] sm:p-6"
      >
        <div className="flex items-start gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#12B85C]">Financeiro</p>
            <h2 id="transaction-title" className="mt-1 text-xl font-bold tracking-[-0.02em]">Novo lançamento</h2>
            <p className="mt-1 text-xs text-[#8A968D]">Registre uma entrada ou saída em poucos passos.</p>
          </div>
          <button
            type="button"
            aria-label="Fechar modal"
            onClick={onClose}
            className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355] transition hover:bg-[#E7ECE9] active:scale-95"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#F1F4F2] p-1">
          {(["entrada", "saida"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setEntryType(type)}
              className={`rounded-[9px] px-3 py-2 text-xs font-bold capitalize transition active:scale-[0.98] ${
                entryType === type
                  ? type === "entrada"
                    ? "bg-white text-[#0A7A42] shadow-sm"
                    : "bg-white text-[#B3261E] shadow-sm"
                  : "text-[#8A968D]"
              }`}
            >
              {type === "entrada" ? "Entrada" : "Saída"}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Descrição</span>
            <input
              required
              autoFocus
              placeholder="Ex.: Plano API · Cliente"
              className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none transition placeholder:text-[#B3BFB7] focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Valor</span>
            <div className="flex h-11 items-center rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C] focus-within:bg-white focus-within:ring-4 focus-within:ring-[#12B85C]/10">
              <span className="mr-2 text-xs font-bold text-[#4C6355]">R$</span>
              <input required inputMode="decimal" placeholder="0,00" className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none placeholder:text-[#B3BFB7]" />
            </div>
          </label>
          <label>
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Vencimento</span>
            <input
              required
              type="date"
              defaultValue="2026-09-06"
              className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none transition focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10"
            />
          </label>
          <label className="sm:col-span-2">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Categoria</span>
            <select className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none transition focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10">
              <option value="receita-recorrente">Receita recorrente</option>
              <option value="custos-plataforma">Custos de plataforma</option>
              <option value="pessoal">Pessoal</option>
              <option value="taxas-financeiras">Taxas financeiras</option>
            </select>
          </label>
        </div>

        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355] transition hover:bg-[#E7ECE9] active:scale-[0.98]">
            Cancelar
          </button>
          <button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white shadow-[0_10px_24px_rgba(18,184,92,.22)] transition hover:bg-[#0F9E4E] active:scale-[0.98]">
            <Check size={15} strokeWidth={2.5} /> Salvar lançamento
          </button>
        </div>
      </form>
    </div>
  );
}

export default function Home() {
  const [activeNav, setActiveNav] = useState("Visão geral");
  const [period, setPeriod] = useState("Mês");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const selectNav = (item: string) => {
    setActiveNav(item);
    if (item !== "Visão geral") {
      toast.info(`${item} selecionado`, { description: "Esta demonstração mantém os dados da visão geral." });
    }
  };

  return (
    <main className="min-h-screen bg-[#E9EEEB] p-3 text-[#0B1F14] sm:p-6 2xl:p-10">
      <div className="mx-auto flex w-full max-w-[1440px] gap-5 rounded-[24px] bg-[#EFF4F1] p-3 shadow-[0_18px_44px_rgba(11,31,20,.10)] sm:p-5">
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
              <Menu size={18} />
            </button>
            <div className="mr-auto flex min-w-[190px] flex-col gap-0.5">
              <h1 className="text-xl font-bold tracking-[-0.02em] sm:text-2xl">Bom dia, Giovani</h1>
              <p className="text-xs text-[#8A968D] sm:text-[13px]">Setembro 2026 · atualizado às 09:15</p>
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
                <Bell size={17} />
                <span className="absolute right-2.5 top-2 h-1.5 w-1.5 rounded-full bg-[#E5533D] ring-2 ring-white" />
              </button>
              {notificationsOpen && (
                <div className="popover-enter absolute right-0 top-12 z-30 w-[300px] rounded-2xl bg-white p-3.5 shadow-[0_20px_50px_rgba(11,31,20,.18)]">
                  <div className="flex items-center gap-2 px-1 pb-2.5">
                    <strong className="text-[13px]">Notificações</strong>
                    <span className="ml-auto rounded-md bg-[#FDECEA] px-2 py-0.5 text-[10px] font-bold text-[#8E1F16]">2 novas</span>
                  </div>
                  <button onClick={() => toast.info("Contas em atraso abertas")} className="flex w-full gap-3 rounded-xl bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#E5533D]" />
                    <span><strong className="block text-xs text-[#8E1F16]">2 contas em atraso</strong><span className="mt-0.5 block text-[11px] text-[#8A4A45]">Total pendente de R$ 4.180</span></span>
                  </button>
                  <button onClick={() => toast.info("Conciliação aberta")} className="mt-1.5 flex w-full gap-3 rounded-xl p-3 text-left transition hover:bg-[#F1F4F2]">
                    <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#12B85C]" />
                    <span><strong className="block text-xs">Conciliação pendente</strong><span className="mt-0.5 block text-[11px] text-[#8A968D]">31 itens aguardam revisão</span></span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="flex h-[42px] items-center gap-2 rounded-xl bg-[#12B85C] px-3.5 text-[13.5px] font-bold text-white shadow-[0_10px_24px_rgba(18,184,92,.18)] transition hover:bg-[#0F9E4E] active:scale-[0.98] sm:px-4"
            >
              <Plus size={15} strokeWidth={2.5} />
              <span className="hidden sm:inline">Novo lançamento</span>
              <span className="sm:hidden">Novo</span>
            </button>
          </header>

          <div className="grid gap-5 xl:grid-cols-[392px_minmax(0,1fr)]">
            <section className="flex min-h-[326px] flex-col gap-[18px] overflow-hidden rounded-[20px] bg-[#0B1F14] p-5 text-white sm:p-6">
              <div className="flex items-center gap-2.5">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#8FB39E]">Caixa disponível</span>
                <span className="ml-auto rounded-lg bg-[#12B85C]/20 px-2.5 py-1 text-[11px] font-semibold text-[#7EE2A8]">3 contas</span>
              </div>
              <div className="flex flex-col gap-1.5">
                <strong className="text-[36px] leading-none tracking-[-0.03em] sm:text-[42px]">R$ 128.430</strong>
                <span className="text-[13px] font-semibold text-[#7EE2A8]">+ R$ 11.240 no mês · +9,6%</span>
              </div>
              <div className="flex h-16 items-end gap-[5px]" aria-label="Evolução positiva do caixa">
                {compactBars.map((height, index) => (
                  <span
                    key={`${height}-${index}`}
                    className={`flex-1 rounded-[4px] transition-all duration-300 hover:brightness-125 ${index === compactBars.length - 1 ? "bg-[#7EE2A8]" : index >= 5 ? "bg-[#12B85C]" : "bg-[#1F3D2B]"}`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
              <div className="mt-auto grid grid-cols-2 gap-5 border-t border-[#1F3D2B] pt-4">
                <div><span className="block text-[11px] text-[#8FB39E]">Projeção 30 dias</span><strong className="mt-0.5 block text-[17px]">R$ 164.900</strong></div>
                <div><span className="block text-[11px] text-[#8FB39E]">Menor saldo previsto</span><strong className="mt-0.5 block text-[17px] text-[#7EE2A8]">R$ 112.700</strong></div>
              </div>
            </section>

            <div className="flex min-w-0 flex-col gap-5">
              <div className="grid gap-5 sm:grid-cols-3">
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[#DFF6EA]"><ArrowUp size={17} className="text-[#0A7A42]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A receber</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#0A7A42]">R$ 42.180</strong>
                  <span className="text-xs text-[#8A968D]">12 títulos · 3 vencem hoje</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[#FDECEA]"><ArrowDown size={17} className="text-[#B3261E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">A pagar</span></div>
                  <strong className="text-[26px] tracking-[-0.02em] text-[#B3261E]">R$ 27.640</strong>
                  <span className="text-xs font-semibold text-[#B3261E]">2 em atraso · R$ 4.180</span>
                </article>
                <article className="card-hover flex flex-col gap-3 rounded-[20px] bg-white p-5">
                  <div className="flex items-center gap-2.5"><span className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-[#F1F4F2]"><BarChart3 size={17} className="text-[#28382E]" /></span><span className="text-[12.5px] font-semibold text-[#4C6355]">Margem líquida</span></div>
                  <strong className="text-[26px] tracking-[-0.02em]">40,2%</strong>
                  <span className="text-xs font-semibold text-[#0A7A42]">+2,6 p.p. vs. agosto</span>
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
                <div className="mt-4 flex h-[150px] items-end gap-2 sm:gap-4">
                  {monthlyBars.map(([incoming, outgoing], index) => (
                    <div key={months[index]} className="group flex h-full flex-1 items-end gap-[3px] sm:gap-1" title={`${months[index]}: entradas ${incoming}, saídas ${outgoing}`}>
                      <span className="flex-1 rounded-t-[5px] bg-[#12B85C] transition-all duration-200 group-hover:brightness-110" style={{ height: `${incoming}%` }} />
                      <span className={`flex-1 rounded-t-[5px] transition-all duration-200 group-hover:brightness-95 ${index === 8 ? "bg-[#E5533D]" : "bg-[#F4A497]"}`} style={{ height: `${outgoing}%` }} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex text-center text-[10px] text-[#8A968D] sm:text-[11.5px]">
                  {months.map((month) => <span key={month} className={`flex-1 ${month === "Set" ? "font-semibold text-[#0B1F14]" : ""}`}>{month}</span>)}
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_392px]">
            <section className="min-w-0 rounded-[20px] bg-white p-4 sm:p-5">
              <div className="flex items-center gap-3">
                <h2 className="text-[15px] font-bold">Últimos lançamentos</h2>
                <button onClick={() => toast.info("Extrato completo selecionado")} className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-[#0A7A42] hover:text-[#0B1F14]">
                  Ver extrato <ChevronRight size={14} />
                </button>
              </div>
              <div className="mt-3.5 flex flex-col gap-1.5">
                {transactions.map((transaction) => {
                  const isPositive = transaction.tone === "positive";
                  const isNegative = transaction.tone === "negative";
                  return (
                    <button
                      key={transaction.title}
                      type="button"
                      onClick={() => toast.info(transaction.title, { description: transaction.subtitle })}
                      className="group flex w-full items-center gap-3 rounded-[14px] bg-[#F8FAF9] px-3 py-2.5 text-left transition hover:bg-[#F1F4F2] active:scale-[0.995]"
                    >
                      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${isPositive ? "bg-[#DFF6EA] text-[#0A7A42]" : isNegative ? "bg-[#FDECEA] text-[#B3261E]" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
                        {transaction.initials}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <strong className="truncate text-[13px] font-semibold sm:text-[13.5px]">{transaction.title}</strong>
                        <span className="truncate text-[11px] text-[#8A968D] sm:text-[11.5px]">{transaction.subtitle}</span>
                      </span>
                      <span className={`hidden rounded-md px-[9px] py-[3px] text-[11px] font-semibold sm:block ${isPositive || transaction.tone === "neutral-positive" ? "bg-[#DFF6EA] text-[#0A7A42]" : isNegative ? "bg-[#FDECEA] text-[#8E1F16]" : "bg-[#F1F4F2] text-[#4C6355]"}`}>
                        {transaction.status}
                      </span>
                      <strong className={`w-[88px] shrink-0 text-right text-xs sm:w-[104px] sm:text-sm ${isPositive ? "text-[#0A7A42]" : isNegative ? "text-[#B3261E]" : ""}`}>{transaction.amount}</strong>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="grid gap-5 md:grid-cols-2 xl:grid-cols-1">
              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Receita por canal</h2>
                <div className="mt-3.5 space-y-3">
                  {channelRevenue.map((channel) => (
                    <div key={channel.label}>
                      <div className="flex text-[12.5px]"><span>{channel.label}</span><strong className="ml-auto">{channel.amount}</strong></div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded bg-[#EDF2EE]"><div className="h-full rounded bg-[#12B85C] transition-all duration-300" style={{ width: `${channel.value}%` }} /></div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-[20px] bg-white p-5">
                <h2 className="text-[15px] font-bold">Precisa de você</h2>
                <div className="mt-3 space-y-2">
                  <button onClick={() => toast.warning("2 contas em atraso", { description: "R$ 4.180 aguardando regularização." })} className="flex w-full items-center gap-3 rounded-[14px] bg-[#FDECEA] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#8E1F16]">2 contas em atraso</span><strong className="text-[13px] text-[#8E1F16]">R$ 4.180</strong></button>
                  <button onClick={() => toast.info("31 itens sem conciliar")} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1F4F2] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold">31 itens sem conciliar</span><strong className="text-[12.5px] text-[#0A7A42]">Revisar</strong></button>
                  <button onClick={() => toast.success("3 recebimentos hoje", { description: "Total previsto de R$ 11.140." })} className="flex w-full items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3 text-left transition hover:brightness-[.98] active:scale-[.99]"><span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">3 recebimentos hoje</span><strong className="text-[13px] text-[#0A7A42]">R$ 11.140</strong></button>
                </div>
              </section>
            </aside>
          </div>
        </section>
      </div>

      {modalOpen && <TransactionModal onClose={() => setModalOpen(false)} />}
    </main>
  );
}
