import { useAuth } from "@/_core/hooks/useAuth";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DeleteIcon,
  DocumentIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  TrendUpIcon,
  UploadIcon,
  UsersIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { FormEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type NavItem = {
  label: string;
  icon: IconlyIcon;
  badge?: string;
  badgeTone?: "positive" | "negative" | "neutral";
};

type Transaction = {
  id: number;
  type: "entrada" | "saida";
  date: string;
  description: string;
  contact: string;
  category: string;
  amount: number;
  account: "Efi" | "Inter" | "Nubank";
  status: "Pago" | "Pendente";
  recurring?: boolean;
};

type ColumnKey =
  | "type"
  | "date"
  | "description"
  | "recurring"
  | "contact"
  | "category"
  | "amount"
  | "account"
  | "status";

const panelItems: NavItem[] = [
  { label: "Visão geral", icon: DashboardIcon },
  { label: "Fluxo de caixa", icon: TrendUpIcon },
  { label: "Contas a pagar", icon: ArrowDownIcon, badge: "7", badgeTone: "negative" },
  { label: "Contas a receber", icon: ArrowUpIcon, badge: "12", badgeTone: "positive" },
  { label: "Lançamentos", icon: DocumentIcon },
  { label: "Conciliação", icon: CheckIcon, badge: "31", badgeTone: "neutral" },
];

const analysisItems: NavItem[] = [
  { label: "DRE", icon: DocumentIcon },
  { label: "Relatórios", icon: ChartIcon },
  { label: "Clientes", icon: UsersIcon },
];

const badgeClass = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

const initialTransactions: Transaction[] = [
  { id: 1, type: "saida", date: "01/09", description: "VultrBy", contact: "Vultr", category: "Cartão de crédito", amount: -28.96, account: "Inter", status: "Pago" },
  { id: 2, type: "saida", date: "01/09", description: "Tarifa Pix Gerencianet", contact: "Efí Bank", category: "Tarifa Efi", amount: -130, account: "Efi", status: "Pago" },
  { id: 3, type: "entrada", date: "01/09", description: "Rentabilidade CDI", contact: "Efí Bank", category: "Rendimentos de aplicações", amount: 40.8, account: "Inter", status: "Pago" },
  { id: 4, type: "saida", date: "01/09", description: "Intercom", contact: "Intercom", category: "Cartão de crédito", amount: -530.87, account: "Inter", status: "Pago" },
  { id: 5, type: "saida", date: "01/09", description: "Iknow 360 Comunicação", contact: "Iknow 360", category: "Pix Efi", amount: -4000, account: "Efi", status: "Pago" },
  { id: 6, type: "saida", date: "01/09", description: "HostGator", contact: "HostGator", category: "Pix Conta Simples", amount: -406.33, account: "Inter", status: "Pago" },
  { id: 7, type: "saida", date: "01/09", description: "Google Cloud", contact: "Google", category: "Compras no cartão Efi", amount: -66.25, account: "Efi", status: "Pago" },
  { id: 8, type: "saida", date: "01/09", description: "Google Ads", contact: "Google", category: "Compras no cartão Efi", amount: -2456, account: "Efi", status: "Pago" },
  { id: 9, type: "entrada", date: "04/09", description: "Faturamento", contact: "Clientes NV", category: "Receitas de serviços", amount: 10587.56, account: "Efi", status: "Pago" },
  { id: 10, type: "saida", date: "05/09", description: "Salário Atendente Keli", contact: "Keli", category: "Salários", amount: -2600, account: "Efi", status: "Pago", recurring: true },
  { id: 11, type: "saida", date: "05/09", description: "Salário Atendente Graziele", contact: "Graziele", category: "Salários", amount: -3400, account: "Efi", status: "Pago", recurring: true },
  { id: 12, type: "entrada", date: "05/09", description: "Rentabilidade CDI", contact: "Efí Bank", category: "Rendimentos de aplicações", amount: 0.01, account: "Inter", status: "Pago" },
  { id: 13, type: "saida", date: "05/09", description: "ProLabore | Kelri", contact: "Kelri", category: "Pró-Labore", amount: -1621, account: "Efi", status: "Pendente", recurring: true },
];

const columns: Array<{ key: ColumnKey; label: string }> = [
  { key: "type", label: "Tipo" },
  { key: "date", label: "Data" },
  { key: "description", label: "Descrição" },
  { key: "recurring", label: "Recorrência" },
  { key: "contact", label: "Contato" },
  { key: "category", label: "Categoria" },
  { key: "amount", label: "Valor" },
  { key: "account", label: "Conta" },
  { key: "status", label: "Status" },
];

const monthLabels = ["Julho 2026", "Agosto 2026", "Setembro 2026", "Outubro 2026", "Novembro 2026"];

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function NavGroup({ title, items, onSelect }: { title: string; items: NavItem[]; onSelect: (label: string) => void }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B3BFB7]">{title}</span>
      {items.map(({ label, icon: Icon, badge, badgeTone = "neutral" }) => {
        const selected = label === "Lançamentos";
        return (
          <button
            key={label}
            type="button"
            onClick={() => onSelect(label)}
            className={`group flex w-full items-center gap-[11px] rounded-xl px-3 py-[11px] text-left text-[13.5px] transition-all duration-150 active:scale-[0.98] ${
              selected ? "bg-[#12B85C] font-bold text-white" : "text-[#28382E] hover:bg-[#F1FBF6]"
            }`}
          >
            <Icon size={16} />
            <span className="truncate">{label}</span>
            {badge && (
              <span className={`ml-auto rounded-md px-[9px] py-[3px] text-[11px] font-semibold ${selected ? "bg-white/18 text-white" : badgeClass[badgeTone]}`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const select = (label: string) => {
    onClose();
    if (label === "Visão geral") setLocation("/");
    else if (label !== "Lançamentos") toast.info(`${label} será adicionada em uma próxima etapa.`);
  };

  return (
    <>
      {open && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-[#07150d]/35 backdrop-blur-[2px] xl:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[22px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform duration-200 xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:min-h-0 xl:translate-x-0 xl:shadow-none ${open ? "translate-x-0" : "-translate-x-[260px]"}`}>
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#12B85C] text-[15px] font-bold text-white">NV</span>
          <div className="flex min-w-0 flex-col"><span className="truncate text-sm font-bold">NV Financeiro</span><span className="truncate text-[11px] text-[#8A968D]">Número Virtual LTDA</span></div>
          <button type="button" aria-label="Fechar menu" onClick={onClose} className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden"><CloseIcon size={17} /></button>
        </div>
        <NavGroup title="Painel" items={panelItems} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} onSelect={select} />
        <div className="mt-auto rounded-2xl bg-[#F1FBF6] p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0A7A42]">Contas conectadas</span>
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

function AccountBadge({ account }: { account: Transaction["account"] }) {
  const styles = {
    Efi: "bg-[#FFF4E8] text-[#D36F12]",
    Inter: "bg-[#EAF7EE] text-[#08773C]",
    Nubank: "bg-[#F2EAF8] text-[#6D2385]",
  };
  return <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-lg px-2 text-[10px] font-bold ${styles[account]}`}>{account}</span>;
}

function SummaryCard({ label, value, tone, active }: { label: string; value: string; tone: "default" | "negative" | "positive"; active?: boolean }) {
  return (
    <article className={`rounded-[17px] bg-white p-4 ring-1 ${active ? "ring-2 ring-[#12B85C]" : "ring-[#E1E8E3]"}`}>
      <span className="text-[11.5px] font-medium text-[#718077]">{label}</span>
      <strong className={`mt-1 block text-[20px] tracking-[-0.025em] ${tone === "positive" ? "text-[#0A9650]" : tone === "negative" ? "text-[#C13B32]" : "text-[#0B1F14]"}`}>{value}</strong>
    </article>
  );
}

function TransactionModal({ transaction, onClose, onSave }: { transaction?: Transaction | null; onClose: () => void; onSave: (transaction: Transaction) => void }) {
  const [type, setType] = useState<Transaction["type"]>(transaction?.type ?? "entrada");
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [amount, setAmount] = useState(transaction ? String(Math.abs(transaction.amount)).replace(".", ",") : "");
  const [category, setCategory] = useState(transaction?.category ?? "Receitas de serviços");
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "Pendente");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number(amount.replace(/\./g, "").replace(",", "."));
    onSave({
      id: transaction?.id ?? Date.now(),
      type,
      date: transaction?.date ?? "06/09",
      description,
      contact: transaction?.contact ?? "Número Virtual",
      category,
      amount: type === "saida" ? -Math.abs(parsed) : Math.abs(parsed),
      account: transaction?.account ?? "Efi",
      status,
      recurring: transaction?.recurring ?? false,
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter w-full max-w-[480px] rounded-[22px] bg-white p-5 text-[#0B1F14] shadow-[0_28px_80px_rgba(11,31,20,.24)] sm:p-6">
        <div className="flex items-start gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#12B85C]">Financeiro</p><h2 id="launch-title" className="mt-1 text-xl font-bold tracking-[-0.02em]">{transaction ? "Editar lançamento" : "Novo lançamento"}</h2><p className="mt-1 text-xs text-[#8A968D]">Registre os dados essenciais do movimento.</p></div>
          <button type="button" aria-label="Fechar modal" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355] hover:bg-[#E7ECE9]"><CloseIcon size={17} /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#F1F4F2] p-1">
          {(["entrada", "saida"] as const).map(option => <button key={option} type="button" onClick={() => setType(option)} className={`rounded-[9px] px-3 py-2 text-xs font-bold capitalize ${type === option ? option === "entrada" ? "bg-white text-[#0A7A42]" : "bg-white text-[#B3261E]" : "text-[#8A968D]"}`}>{option}</button>)}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Descrição</span><input autoFocus required value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Plano API · Cliente" className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10" /></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Valor</span><div className="flex h-11 items-center rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C] focus-within:ring-4 focus-within:ring-[#12B85C]/10"><span className="mr-2 text-xs font-bold text-[#4C6355]">R$</span><input required inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0,00" className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" /></div></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Status</span><select value={status} onChange={event => setStatus(event.target.value as Transaction["status"])} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]"><option>Pago</option><option>Pendente</option></select></label>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Categoria</span><input value={category} onChange={event => setCategory(event.target.value)} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]" /></label>
        </div>
        <div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9]">Cancelar</button><button type="submit" className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white hover:bg-[#0F9E4E]"><CheckIcon size={15} /> Salvar</button></div>
      </form>
    </div>
  );
}

export default function LancamentosPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const importRef = useRef<HTMLInputElement>(null);
  const [transactions, setTransactions] = useState(initialTransactions);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [monthIndex, setMonthIndex] = useState(2);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"todos" | Transaction["type"]>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | Transaction["status"]>("todos");
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => Object.fromEntries(columns.map(column => [column.key, true])) as Record<ColumnKey, boolean>);
  const [selected, setSelected] = useState<number[]>([]);
  const [actionOpen, setActionOpen] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return transactions.filter(item => {
      const matchesSearch = !normalized || [item.description, item.contact, item.category, item.account].some(value => value.toLowerCase().includes(normalized));
      return matchesSearch && (typeFilter === "todos" || item.type === typeFilter) && (statusFilter === "todos" || item.status === statusFilter);
    });
  }, [search, statusFilter, transactions, typeFilter]);

  const visibleCount = Object.values(visibleColumns).filter(Boolean).length;
  const allSelected = filtered.length > 0 && filtered.every(item => selected.includes(item.id));
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");

  const saveTransaction = (transaction: Transaction) => {
    setTransactions(current => current.some(item => item.id === transaction.id) ? current.map(item => item.id === transaction.id ? transaction : item) : [transaction, ...current]);
    setModalOpen(false);
    setEditing(null);
    toast.success(editing ? "Lançamento atualizado" : "Lançamento criado");
  };

  const duplicate = (transaction: Transaction) => {
    setTransactions(current => [{ ...transaction, id: Date.now(), description: `${transaction.description} (cópia)` }, ...current]);
    setActionOpen(null);
    toast.success("Lançamento duplicado");
  };

  const remove = (id: number) => {
    setTransactions(current => current.filter(item => item.id !== id));
    setSelected(current => current.filter(item => item !== id));
    setActionOpen(null);
    toast.success("Lançamento removido", { description: "Os dados demonstrativos voltam ao recarregar." });
  };

  const markPaid = (transaction: Transaction) => {
    setTransactions(current => current.map(item => item.id === transaction.id ? { ...item, status: item.status === "Pago" ? "Pendente" : "Pago" } : item));
    toast.success(transaction.status === "Pago" ? "Marcado como pendente" : "Marcado como pago");
  };

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-4 pb-1">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto"><h1 className="text-[24px] font-bold tracking-[-0.035em] sm:text-[28px]">Lançamentos</h1><p className="mt-0.5 text-[12px] text-[#8A968D]">Organize entradas e saídas em um só lugar</p></div>
            <input ref={importRef} type="file" accept=".csv,.ofx,.xlsx" className="hidden" onChange={() => toast.success("Arquivo selecionado", { description: "A importação será conectada ao banco na próxima etapa." })} />
            <button type="button" title="Importar" aria-label="Importar lançamentos" onClick={() => importRef.current?.click()} className={toolButton}><UploadIcon size={17} /></button>
            <button type="button" title="Exportar" aria-label="Exportar lançamentos" onClick={() => toast.success("Exportação preparada", { description: "O arquivo será gerado quando os dados estiverem persistidos." })} className={toolButton}><DownloadIcon size={17} /></button>
            <button type="button" title="Imprimir" aria-label="Imprimir lançamentos" onClick={() => window.print()} className={`${toolButton} hidden sm:flex`}><DocumentIcon size={17} /></button>
            <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[.98] sm:px-4"><PlusIcon size={15} /><span className="hidden sm:inline">Novo lançamento</span><span className="sm:hidden">Novo</span></button>
            <div className="relative">
              <button type="button" aria-label="Abrir conta" onClick={() => setAccountOpen(value => !value)} className="flex h-10 min-w-10 items-center justify-center rounded-[12px] bg-[#0B1F14] px-2.5 text-[11px] font-bold text-white">{initials || "NV"}</button>
              {accountOpen && <div className="popover-enter absolute right-0 top-12 z-40 w-[250px] rounded-[17px] bg-white p-3 shadow-[0_20px_50px_rgba(11,31,20,.18)]"><div className="rounded-xl bg-[#F8FAF9] p-3"><strong className="block truncate text-[12px]">{user?.name || "Sua conta"}</strong><span className="mt-0.5 block truncate text-[10.5px] text-[#8A968D]">{user?.email}</span></div><button type="button" onClick={async () => { await logout(); setLocation("/login", { replace: true }); }} className="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#8E1F16] hover:bg-[#FDECEA]">Sair <ChevronRightIcon size={14} /></button></div>}
            </div>
          </header>

          <section className="flex flex-wrap items-center gap-2.5">
            <button type="button" onClick={() => setFiltersOpen(value => !value)} className={`flex h-10 items-center gap-2 rounded-[12px] px-3.5 text-[12.5px] font-semibold ring-1 transition ${filtersOpen || typeFilter !== "todos" || statusFilter !== "todos" ? "bg-[#DFF6EA] text-[#0A7A42] ring-[#BDE8CF]" : "bg-white text-[#4C6355] ring-[#DFE6E1] hover:bg-[#F1FBF6]"}`}><FilterIcon size={16} />Filtrar</button>
            <label className="relative min-w-[210px] flex-1 sm:max-w-[310px]"><SearchIcon size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A968D]" /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar lançamento" className="h-10 w-full rounded-[12px] bg-white pl-10 pr-3 text-[12.5px] outline-none ring-1 ring-[#DFE6E1] placeholder:text-[#AAB4AD] focus:ring-2 focus:ring-[#12B85C]" /></label>
            <div className="order-3 mx-auto flex items-center gap-2 sm:order-none sm:ml-auto">
              <button type="button" aria-label="Mês anterior" onClick={() => setMonthIndex(value => Math.max(0, value - 1))} disabled={monthIndex === 0} className={toolButton}><ChevronRightIcon size={15} className="rotate-180" /></button>
              <div className="flex h-10 min-w-[174px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{monthLabels[monthIndex]}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setMonthIndex(value => Math.min(monthLabels.length - 1, value + 1))} disabled={monthIndex === monthLabels.length - 1} className={toolButton}><ChevronRightIcon size={15} /></button>
            </div>
            <div className="relative ml-auto sm:ml-0"><button type="button" aria-label="Configurar colunas" onClick={() => setColumnsOpen(value => !value)} className={toolButton}><SettingsIcon size={17} /></button>
              {columnsOpen && <div className="popover-enter absolute right-0 top-12 z-40 w-[290px] rounded-[18px] bg-white p-4 shadow-[0_22px_60px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]"><div className="flex items-center"><strong className="text-[14px]">Colunas</strong><span className="ml-auto text-[12px] font-semibold text-[#8A968D]">{visibleCount} de {columns.length}</span></div><div className="mt-3 space-y-1">{columns.map(column => <button key={column.key} type="button" onClick={() => setVisibleColumns(current => ({ ...current, [column.key]: !current[column.key] }))} className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-left text-[12.5px] hover:bg-[#F1FBF6]"><span className="grid h-5 w-3 grid-cols-2 gap-[2px]">{Array.from({ length: 6 }).map((_, index) => <i key={index} className="h-[3px] w-[3px] rounded-full bg-[#AAB4AD]" />)}</span><span className="flex-1">{column.label}</span><span className={`flex h-5 w-5 items-center justify-center rounded-md ${visibleColumns[column.key] ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#F1F4F2] text-[#AAB4AD]"}`}>{visibleColumns[column.key] ? <CheckIcon size={13} /> : "—"}</span></button>)}</div><button type="button" onClick={() => setVisibleColumns(Object.fromEntries(columns.map(column => [column.key, true])) as Record<ColumnKey, boolean>)} className="mt-3 w-full rounded-xl bg-[#F1F4F2] px-3 py-2.5 text-[12px] font-semibold text-[#4C6355] hover:bg-[#E8EEEA]">Restaurar padrão</button></div>}
            </div>
          </section>

          {filtersOpen && <section className="grid gap-3 rounded-[16px] bg-white p-3.5 ring-1 ring-[#DFE6E1] sm:grid-cols-3"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Tipo</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="h-9 w-full rounded-[10px] bg-[#F4F8F6] px-3 text-[12px] outline-none"><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 w-full rounded-[10px] bg-[#F4F8F6] px-3 text-[12px] outline-none"><option value="todos">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></label><div className="flex items-end"><button type="button" onClick={() => { setTypeFilter("todos"); setStatusFilter("todos"); setSearch(""); }} className="h-9 w-full rounded-[10px] bg-[#F1F4F2] text-[12px] font-semibold text-[#4C6355] hover:bg-[#E8EEEA]">Limpar filtros</button></div></section>}

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Saldo do período" value="R$ 11.574,21" tone="default" active />
            <SummaryCard label="Saídas" value="-R$ 37.210,96" tone="negative" />
            <SummaryCard label="Entradas" value="R$ 48.785,17" tone="positive" />
          </section>

          <section className="min-h-0 flex-1 overflow-hidden rounded-[18px] bg-white ring-1 ring-[#E1E8E3]">
            {selected.length > 0 && <div className="flex items-center gap-3 border-b border-[#E8EEEA] bg-[#F1FBF6] px-4 py-2.5"><strong className="text-[12px] text-[#0A7A42]">{selected.length} selecionado{selected.length > 1 ? "s" : ""}</strong><button type="button" onClick={() => { setTransactions(current => current.filter(item => !selected.includes(item.id))); setSelected([]); }} className="ml-auto text-[12px] font-semibold text-[#B3261E]">Excluir selecionados</button></div>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] border-collapse text-left">
                <thead><tr className="border-b border-[#E8EEEA] text-[10.5px] font-semibold uppercase tracking-[.045em] text-[#8A968D]"><th className="w-12 px-4 py-3"><input aria-label="Selecionar todos" type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? selected.filter(id => !filtered.some(item => item.id === id)) : Array.from(new Set([...selected, ...filtered.map(item => item.id)])))} className="h-4 w-4 accent-[#12B85C]" /></th>{visibleColumns.type && <th className="w-14 py-3">Tipo</th>}{visibleColumns.date && <th className="w-20 py-3">Data</th>}{visibleColumns.description && <th className="min-w-[210px] py-3">Descrição</th>}{visibleColumns.recurring && <th className="w-24 py-3 text-center">Recorr.</th>}{visibleColumns.contact && <th className="min-w-[130px] py-3">Contato</th>}{visibleColumns.category && <th className="min-w-[180px] py-3">Categoria</th>}{visibleColumns.amount && <th className="w-32 py-3 text-right">Valor</th>}{visibleColumns.account && <th className="w-20 py-3 text-center">Conta</th>}{visibleColumns.status && <th className="w-20 py-3 text-center">Status</th>}<th className="w-14 py-3 pr-3" /></tr></thead>
                <tbody>{filtered.map(transaction => <tr key={transaction.id} className={`border-b border-[#EDF1EE] text-[12.5px] transition hover:bg-[#F8FBF9] ${selected.includes(transaction.id) ? "bg-[#F1FBF6]" : ""}`}><td className="px-4 py-2.5"><input aria-label={`Selecionar ${transaction.description}`} type="checkbox" checked={selected.includes(transaction.id)} onChange={() => setSelected(current => current.includes(transaction.id) ? current.filter(id => id !== transaction.id) : [...current, transaction.id])} className="h-4 w-4 accent-[#12B85C]" /></td>{visibleColumns.type && <td className="py-2.5"><span title={transaction.type === "entrada" ? "Entrada" : "Saída"} className={`flex h-7 w-7 items-center justify-center rounded-[9px] ${transaction.type === "entrada" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>{transaction.type === "entrada" ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}</span></td>}{visibleColumns.date && <td className="py-2.5 text-[#607067]">{transaction.date}</td>}{visibleColumns.description && <td className="max-w-[240px] truncate py-2.5 pr-4 font-semibold">{transaction.description}</td>}{visibleColumns.recurring && <td className="py-2.5 text-center">{transaction.recurring ? <span title="Recorrente" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#F1F4F2] text-[18px] text-[#718077]">↻</span> : <span className="text-[#CDD4CF]">—</span>}</td>}{visibleColumns.contact && <td className="max-w-[150px] truncate py-2.5 pr-4 text-[#607067]">{transaction.contact}</td>}{visibleColumns.category && <td className="max-w-[200px] truncate py-2.5 pr-4 font-medium">{transaction.category}</td>}{visibleColumns.amount && <td className={`py-2.5 text-right font-bold ${transaction.amount > 0 ? "text-[#0A7A42]" : "text-[#17241C]"}`}>{formatMoney(transaction.amount)}</td>}{visibleColumns.account && <td className="py-2.5 text-center"><AccountBadge account={transaction.account} /></td>}{visibleColumns.status && <td className="py-2.5 text-center"><button type="button" title={transaction.status} aria-label={`${transaction.status}: alterar status`} onClick={() => markPaid(transaction)} className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] ${transaction.status === "Pago" ? "bg-[#EAF8F0] text-[#12B85C]" : "bg-[#FFF5DD] text-[#B87500]"}`}><CheckIcon size={16} /></button></td>}<td className="relative py-2.5 pr-3 text-right"><button type="button" aria-label={`Ações de ${transaction.description}`} onClick={() => setActionOpen(actionOpen === transaction.id ? null : transaction.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#718077] hover:bg-[#F1F4F2]"><MenuIcon size={16} /></button>{actionOpen === transaction.id && <div className="popover-enter absolute right-3 top-10 z-30 w-[160px] rounded-[15px] bg-white p-1.5 text-left shadow-[0_16px_42px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]"><button type="button" onClick={() => duplicate(transaction)} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><DocumentIcon size={15} />Duplicar</button><button type="button" onClick={() => { setEditing(transaction); setModalOpen(true); setActionOpen(null); }} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><EditIcon size={15} />Editar</button><button type="button" onClick={() => remove(transaction.id)} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-[#B3261E] hover:bg-[#FDECEA]"><DeleteIcon size={15} />Excluir</button></div>}</td></tr>)}</tbody>
              </table>
              {filtered.length === 0 && <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><SearchIcon size={28} className="text-[#AAB4AD]" /><strong className="mt-3 text-[14px]">Nenhum lançamento encontrado</strong><span className="mt-1 text-[12px] text-[#8A968D]">Ajuste a busca ou limpe os filtros.</span></div>}
            </div>
          </section>

          <footer className="sticky bottom-1 z-20 grid grid-cols-2 overflow-hidden rounded-[15px] bg-white shadow-[0_12px_35px_rgba(11,31,20,.12)] ring-1 ring-[#E1E8E3] sm:grid-cols-4"><div className="px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo anterior</span><strong className="mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px]">-R$ 660.635,35</strong></div><div className="border-l border-[#EDF1EE] px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Entrada</span><strong className="mt-0.5 block text-[11.5px] text-[#0A9650] sm:ml-2 sm:inline sm:text-[12.5px]">R$ 47.485,17</strong></div><div className="border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-l sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saída</span><strong className="mt-0.5 block text-[11.5px] text-[#C13B32] sm:ml-2 sm:inline sm:text-[12.5px]">R$ 32.543,43</strong></div><div className="border-l border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo</span><strong className="mt-0.5 block text-[11.5px] text-[#C13B32] sm:ml-2 sm:inline sm:text-[12.5px]">-R$ 645.693,61</strong></div></footer>
        </section>
      </div>

      {modalOpen && <TransactionModal transaction={editing} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveTransaction} />}
    </main>
  );
}
