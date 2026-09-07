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
import ImportTransactionsModal from "@/components/ImportTransactionsModal";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { buildTransactionDisplayGroups, type TransactionSortKey, type TransactionSortState } from "@/lib/transactionSort";
import { trpc } from "@/lib/trpc";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

type NavItem = {
  label: string;
  icon: IconlyIcon;
  disabled?: boolean;
  badge?: string;
  badgeTone?: "positive" | "negative" | "neutral";
};

type Transaction = {
  id: number;
  type: "entrada" | "saida";
  transactionDate: string;
  description: string;
  contact: string;
  category: string;
  amount: number;
  account: string;
  accountId: number | null;
  categoryId: number | null;
  importBatchId: string | null;
  status: "Pago" | "Pendente";
  recurring: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type TransactionInput = Omit<Transaction, "id" | "createdAt" | "updatedAt" | "importBatchId"> & { amount: number };

type OrganizationOptions = {
  accounts: Array<{ id: number; name: string; institution: string; color: string }>;
  categories: Array<{ id: number; name: string; type: "entrada" | "saida" | "ambos"; color: string }>;
};

type ColumnKey = "type" | "date" | "description" | "recurring" | "contact" | "category" | "amount" | "account" | "status";

const EMPTY_TRANSACTIONS: Transaction[] = [];

const panelItems: NavItem[] = [
  { label: "Visão geral", icon: DashboardIcon },
  { label: "Fluxo de caixa", icon: TrendUpIcon, disabled: true },
  { label: "Contas a pagar", icon: ArrowDownIcon, disabled: true },
  { label: "Contas a receber", icon: ArrowUpIcon, disabled: true },
  { label: "Lançamentos", icon: DocumentIcon },
  { label: "Conciliação", icon: CheckIcon, disabled: true },
];

const analysisItems: NavItem[] = [
  { label: "DRE", icon: DocumentIcon, disabled: true },
  { label: "Balanço Patrimonial", icon: ChartIcon },
  { label: "Relatórios", icon: ChartIcon, disabled: true },
  { label: "Clientes", icon: UsersIcon, disabled: true },
];

const organizationItems: NavItem[] = [
  { label: "Contas e categorias", icon: SettingsIcon },
];

const badgeClass = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

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

const defaultColumnVisibility = () => Object.fromEntries(
  columns.map(column => [column.key, column.key !== "date"])
) as Record<ColumnKey, boolean>;

function ColumnCheckState({ checked, mixed = false }: { checked: boolean; mixed?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[13px] font-semibold transition-colors ${
        checked || mixed
          ? "bg-[#DFF6EA] text-[#0A7A42]"
          : "bg-[#F1F4F2] text-[#AAB4AD]"
      }`}
    >
      {checked ? <CheckIcon size={13} /> : "—"}
    </span>
  );
}

function SelectionCheckbox({ checked, mixed = false, label, onChange }: {
  checked: boolean;
  mixed?: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={mixed ? "mixed" : checked}
      aria-label={label}
      onClick={onChange}
      className="inline-flex h-6 w-6 items-center justify-center rounded-lg outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-[#12B85C]/35"
    >
      <ColumnCheckState checked={checked} mixed={mixed} />
    </button>
  );
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function safeErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  return message.startsWith("[") || message.includes('"code"') ? fallback : message;
}

function defaultDateForMonth(year: number, month: number) {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() + 1 === month) return now.toISOString().slice(0, 10);
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function NavGroup({ title, items, onSelect }: { title: string; items: NavItem[]; onSelect: (label: string) => void }) {
  return (
    <div className="flex flex-col gap-[3px]">
      <span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#B3BFB7]">{title}</span>
      {items.map(({ label, icon: Icon, disabled = false, badge, badgeTone = "neutral" }) => {
        const selected = label === "Lançamentos";
        return (
          <button key={label} type="button" disabled={disabled} aria-disabled={disabled} title={disabled ? "Página em desenvolvimento" : undefined} onClick={() => onSelect(label)} className={`group flex w-full items-center gap-[11px] rounded-xl px-3 py-[9px] text-left text-[13px] transition-all duration-150 active:scale-[0.98] ${selected ? "bg-[#12B85C] font-bold text-white" : disabled ? "cursor-not-allowed text-[#A8B1AB] opacity-55" : "text-[#28382E] hover:bg-[#F1FBF6]"}`}>
            <Icon size={16} />
            <span className="truncate">{label}</span>
            {badge && <span className={`ml-auto rounded-md px-[9px] py-[3px] text-[11px] font-semibold ${selected ? "bg-white/18 text-white" : badgeClass[badgeTone]}`}>{badge}</span>}
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
    else if (label === "Contas e categorias") setLocation("/organizacao");
    else if (label === "Balanço Patrimonial") setLocation("/balanco-patrimonial");
    else if (label !== "Lançamentos") toast.info(`${label} será adicionada em uma próxima etapa.`);
  };

  return (
    <>
      {open && <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 bg-[#07150d]/35 backdrop-blur-[2px] xl:hidden" onClick={onClose} />}
      <aside className={`fixed inset-y-3 left-3 z-50 flex w-[236px] shrink-0 flex-col gap-[14px] overflow-hidden rounded-[20px] bg-white px-[14px] py-5 shadow-[0_18px_44px_rgba(11,31,20,.16)] transition-transform duration-200 xl:sticky xl:inset-auto xl:top-5 xl:h-[calc(100vh-40px)] xl:min-h-0 xl:translate-x-0 xl:shadow-none ${open ? "translate-x-0" : "-translate-x-[260px]"}`}>
        <div className="flex items-center gap-2.5 px-1.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#12B85C] text-[15px] font-bold text-white">NV</span>
          <div className="flex min-w-0 flex-col"><span className="truncate text-sm font-bold">NV Financeiro</span><span className="truncate text-[11px] text-[#8A968D]">Número Virtual LTDA</span></div>
          <button type="button" aria-label="Fechar menu" onClick={onClose} className="ml-auto rounded-lg p-1 text-[#8A968D] hover:bg-[#F1F4F2] xl:hidden"><CloseIcon size={17} /></button>
        </div>
        <NavGroup title="Painel" items={panelItems} onSelect={select} />
        <NavGroup title="Análise" items={analysisItems} onSelect={select} />
        <NavGroup title="Organização" items={organizationItems} onSelect={select} />
        <div className="mt-auto rounded-2xl bg-[#F1FBF6] p-3.5">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#0A7A42]">Banco conectado</span>
          <div className="mt-2 flex items-center gap-2 text-[12px] text-[#4C6355]"><span className="h-2 w-2 rounded-full bg-[#12B85C]" /><span>TiDB Cloud</span></div>
        </div>
      </aside>
    </>
  );
}

function AccountBadge({ account }: { account: string }) {
  const styles: Record<string, string> = {
    Efi: "bg-[#FFF4E8] text-[#D36F12]",
    Inter: "bg-[#EAF7EE] text-[#08773C]",
    Nubank: "bg-[#F2EAF8] text-[#6D2385]",
  };
  return <span className={`inline-flex h-7 min-w-8 items-center justify-center rounded-lg px-2 text-[10px] font-bold ${styles[account] ?? "bg-[#F1F4F2] text-[#4C6355]"}`}>{account}</span>;
}

function SummaryCard({ label, value, tone, active, onClick }: { label: string; value: string; tone: "default" | "negative" | "positive"; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`w-full rounded-[17px] bg-white p-4 text-left ring-1 transition hover:bg-[#FAFCFB] active:scale-[.99] ${active ? `ring-2 ${tone === "negative" ? "ring-[#E5533D]" : "ring-[#12B85C]"}` : "ring-[#E1E8E3]"}`}>
      <span className="text-[11.5px] font-medium text-[#718077]">{label}</span>
      <strong className={`mt-1 block text-[20px] tracking-[-0.025em] ${tone === "positive" ? "text-[#0A9650]" : tone === "negative" ? "text-[#C13B32]" : "text-[#0B1F14]"}`}>{value}</strong>
    </button>
  );
}

function SortableColumnHeader({ label, sortKey, sort, onSort, className = "" }: { label: string; sortKey: TransactionSortKey; sort: TransactionSortState; onSort: (key: TransactionSortKey) => void; className?: string }) {
  const active = sort?.key === sortKey;
  const ariaSort = active ? (sort.direction === "asc" ? "ascending" : "descending") : "none";
  return (
    <th aria-sort={ariaSort} className={className}>
      <button type="button" onClick={() => onSort(sortKey)} title={`Ordenar por ${label}`} className={`group flex w-full items-center gap-1.5 py-3 transition hover:text-[#0A7A42] ${className.includes("text-right") ? "justify-end" : className.includes("text-center") ? "justify-center" : "justify-start"}`}>
        <span>{label}</span>
        <span aria-hidden="true" className={`text-[10px] leading-none ${active ? "text-[#12B85C]" : "text-[#BCC6BF] group-hover:text-[#74B68F]"}`}>{active ? sort.direction === "asc" ? "↑" : "↓" : "↕"}</span>
      </button>
    </th>
  );
}

function TransactionModal({ transaction, defaultDate, pending, options, onManageOrganization, onClose, onSave }: { transaction?: Transaction | null; defaultDate: string; pending: boolean; options: OrganizationOptions; onManageOrganization: () => void; onClose: () => void; onSave: (transaction: TransactionInput) => Promise<void> }) {
  const [type, setType] = useState<Transaction["type"]>(transaction?.type ?? "entrada");
  const [transactionDate, setTransactionDate] = useState(transaction?.transactionDate ?? defaultDate);
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [contact, setContact] = useState(transaction?.contact ?? "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.categoryId ?? null);
  const [amount, setAmount] = useState(transaction ? formatCurrencyValue(Math.abs(transaction.amount)) : "0,00");
  const [account, setAccount] = useState(transaction?.account ?? "");
  const [accountId, setAccountId] = useState<number | null>(transaction?.accountId ?? null);
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "Pendente");
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = currencyInputToNumber(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast.error("Informe um valor válido");
      return;
    }
    if (!account || !category) return toast.error("Selecione uma conta e uma categoria");
    await onSave({ type, transactionDate, description, contact, category, categoryId, amount: parsed, account, accountId, status, recurring });
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter max-h-[calc(100vh-32px)] w-full max-w-[520px] overflow-y-auto rounded-[22px] bg-white p-5 text-[#0B1F14] shadow-[0_28px_80px_rgba(11,31,20,.24)] sm:p-6">
        <div className="flex items-start gap-4">
          <div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#12B85C]">Financeiro</p><h2 id="launch-title" className="mt-1 text-xl font-bold tracking-[-0.02em]">{transaction ? "Editar lançamento" : "Novo lançamento"}</h2><p className="mt-1 text-xs text-[#8A968D]">Os dados serão salvos no seu banco.</p></div>
          <button type="button" aria-label="Fechar modal" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355] hover:bg-[#E7ECE9]"><CloseIcon size={17} /></button>
        </div>
        <div className="mt-5 grid grid-cols-2 rounded-xl bg-[#F1F4F2] p-1">
          {(["entrada", "saida"] as const).map(option => <button key={option} type="button" onClick={() => setType(option)} className={`rounded-[9px] px-3 py-2 text-xs font-bold capitalize ${type === option ? option === "entrada" ? "bg-white text-[#0A7A42]" : "bg-white text-[#B3261E]" : "text-[#8A968D]"}`}>{option}</button>)}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Descrição</span><input autoFocus required value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Plano API · Cliente" className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10" /></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Data</span><input required type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]" /></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Valor</span><div className="flex h-11 items-center rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 focus-within:border-[#12B85C] focus-within:ring-4 focus-within:ring-[#12B85C]/10"><span className="mr-2 text-xs font-bold text-[#4C6355]">R$</span><input required inputMode="decimal" value={amount} onFocus={event => event.currentTarget.select()} onChange={event => setAmount(formatCurrencyInput(event.target.value))} placeholder="0,00" className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold outline-none" /></div></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Contato</span><input value={contact} onChange={event => setContact(event.target.value)} placeholder="Fornecedor ou cliente" className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]" /></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Categoria</span><select required value={categoryId ?? ""} onChange={event => { const id = Number(event.target.value); const selected = options.categories.find(item => item.id === id); setCategoryId(id || null); setCategory(selected?.name ?? ""); }} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]"><option value="">Selecione</option>{options.categories.filter(item => item.type === "ambos" || item.type === type).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Conta</span><select required value={accountId ?? ""} onChange={event => { const id = Number(event.target.value); const selected = options.accounts.find(item => item.id === id); setAccountId(id || null); setAccount(selected?.name ?? ""); }} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]"><option value="">Selecione</option>{options.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.08em] text-[#8A968D]">Status</span><select value={status} onChange={event => setStatus(event.target.value as Transaction["status"])} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]"><option>Pago</option><option>Pendente</option></select></label>
          <label className="flex items-center gap-2.5 sm:col-span-2"><input type="checkbox" checked={recurring} onChange={event => setRecurring(event.target.checked)} className="h-4 w-4 accent-[#12B85C]" /><span className="text-[12.5px] font-semibold text-[#4C6355]">Lançamento recorrente</span></label>
          {(options.accounts.length === 0 || options.categories.length === 0) && <button type="button" onClick={onManageOrganization} className="rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-left text-[11px] font-bold text-[#7A5A14] sm:col-span-2">Cadastre uma conta e uma categoria para continuar</button>}
        </div>
        <div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9]">Cancelar</button><button type="submit" disabled={pending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white hover:bg-[#0F9E4E] disabled:cursor-wait disabled:opacity-60"><CheckIcon size={15} />{pending ? "Salvando..." : "Salvar"}</button></div>
      </form>
    </div>
  );
}

type BulkTransactionChanges = {
  status?: Transaction["status"];
  transactionDate?: string;
  accountId?: number;
  categoryId?: number;
  recurring?: boolean;
};

function BulkEditModal({ selectedCount, selectedTypes, options, pending, onClose, onSave }: { selectedCount: number; selectedTypes: Transaction["type"][]; options: OrganizationOptions; pending: boolean; onClose: () => void; onSave: (changes: BulkTransactionChanges) => Promise<void> }) {
  const [status, setStatus] = useState("");
  const [transactionDate, setTransactionDate] = useState("");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [recurring, setRecurring] = useState("");
  const compatibleCategories = options.categories.filter(category => selectedTypes.length === 1
    ? category.type === "ambos" || category.type === selectedTypes[0]
    : category.type === "ambos");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const changes: BulkTransactionChanges = {};
    if (status) changes.status = status as Transaction["status"];
    if (transactionDate) changes.transactionDate = transactionDate;
    if (accountId) changes.accountId = Number(accountId);
    if (categoryId) changes.categoryId = Number(categoryId);
    if (recurring) changes.recurring = recurring === "sim";
    if (Object.keys(changes).length === 0) return toast.info("Escolha ao menos um campo para alterar.");
    await onSave(changes);
  };

  const selectClass = "h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150D]/45 p-4 backdrop-blur-[2px]">
      <form onSubmit={submit} className="modal-enter w-full max-w-[570px] rounded-[22px] bg-white p-5 ring-1 ring-black/5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#DFF6EA] text-[#0A7A42]"><EditIcon size={20} /></span>
          <div><span className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Edição em lote</span><h2 className="mt-1 text-[20px] font-bold">Alterar lançamentos</h2><p className="mt-1 text-[12px] text-[#718077]">Somente os campos escolhidos serão aplicados aos {selectedCount.toLocaleString("pt-BR")} itens selecionados.</p></div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto flex h-9 w-9 items-center justify-center rounded-xl bg-[#F1F4F2] text-[#4C6355]"><CloseIcon size={16} /></button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Status</span><select value={status} onChange={event => setStatus(event.target.value)} className={selectClass}><option value="">Manter atual</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Data</span><input type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} className={selectClass} /></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Conta</span><select value={accountId} onChange={event => setAccountId(event.target.value)} className={selectClass}><option value="">Manter atual</option>{options.accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Categoria</span><select value={categoryId} onChange={event => setCategoryId(event.target.value)} className={selectClass}><option value="">Manter atual</option>{compatibleCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Recorrência</span><select value={recurring} onChange={event => setRecurring(event.target.value)} className={selectClass}><option value="">Manter atual</option><option value="sim">Recorrente</option><option value="nao">Não recorrente</option></select></label>
        </div>
        {selectedTypes.length > 1 && compatibleCategories.length === 0 && <p className="mt-3 rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-[11px] text-[#7A5A14]">A seleção combina receitas e despesas. Para alterar a categoria em conjunto, cadastre uma categoria do tipo “Ambos”.</p>}
        <div className="mt-5 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9]">Cancelar</button><button type="submit" disabled={pending} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white hover:bg-[#0F9E4E] disabled:cursor-wait disabled:opacity-60"><CheckIcon size={16} />{pending ? "Aplicando..." : "Aplicar alterações"}</button></div>
      </form>
    </div>
  );
}

export default function LancamentosPage() {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [monthCursor, setMonthCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"todos" | Transaction["type"]>("todos");
  const [statusFilter, setStatusFilter] = useState<"todos" | Transaction["status"]>("todos");
  const [sort, setSort] = useState<TransactionSortState>(null);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(defaultColumnVisibility);
  const [selected, setSelected] = useState<number[]>([]);
  const [actionOpen, setActionOpen] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(() => new Set());
  const period = useMemo(() => ({ year: monthCursor.getFullYear(), month: monthCursor.getMonth() + 1 }), [monthCursor]);
  const utils = trpc.useUtils();
  const transactionsQuery = trpc.transactions.list.useQuery(period);
  const organizationQuery = trpc.organization.options.useQuery();
  const organizationOptions = organizationQuery.data ?? { accounts: [], categories: [] };
  const transactions = (transactionsQuery.data?.items ?? EMPTY_TRANSACTIONS) as Transaction[];
  const summary = transactionsQuery.data?.summary ?? { incoming: 0, outgoing: 0, balance: 0, previousBalance: 0 };

  const refresh = async () => {
    await Promise.all([utils.transactions.list.invalidate(), utils.transactions.dashboard.invalidate(), utils.organization.overview.invalidate()]);
  };
  const createMutation = trpc.transactions.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.transactions.update.useMutation({ onSuccess: refresh });
  const duplicateMutation = trpc.transactions.duplicate.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.transactions.delete.useMutation({ onSuccess: refresh });
  const deleteManyMutation = trpc.transactions.deleteMany.useMutation({ onSuccess: refresh });
  const updateManyMutation = trpc.transactions.updateMany.useMutation({ onSuccess: refresh });
  const toggleStatusMutation = trpc.transactions.toggleStatus.useMutation({ onSuccess: refresh });

  useEffect(() => {
    setSelected([]);
    setCollapsedDates(new Set());
  }, [period.month, period.year]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return transactions.filter(item => {
      const matchesSearch = !normalized || [item.description, item.contact, item.category, item.account].some(value => value.toLowerCase().includes(normalized));
      return matchesSearch && (typeFilter === "todos" || item.type === typeFilter) && (statusFilter === "todos" || item.status === statusFilter);
    });
  }, [search, statusFilter, transactions, typeFilter]);

  const visibleCount = Object.values(visibleColumns).filter(Boolean).length;
  const dateColumnVisible = visibleColumns.date || sort !== null;
  const tableDataColumnCount = visibleCount + (sort && !visibleColumns.date ? 1 : 0);
  const allSelected = filtered.length > 0 && filtered.every(item => selected.includes(item.id));
  const someSelected = !allSelected && filtered.some(item => selected.includes(item.id));
  const selectedTransactions = useMemo(() => transactions.filter(transaction => selected.includes(transaction.id)), [selected, transactions]);
  const selectedTypes = useMemo(() => Array.from(new Set(selectedTransactions.map(transaction => transaction.type))), [selectedTransactions]);
  const groupedTransactions = useMemo(() => buildTransactionDisplayGroups(filtered, sort), [filtered, sort]);
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthCursor).replace(/^./, letter => letter.toUpperCase());
  const mutationPending = createMutation.isPending || updateMutation.isPending;

  const toggleSort = (key: TransactionSortKey) => {
    setSort(current => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "amount" ? "desc" : "asc" });
  };

  const saveTransaction = async (input: TransactionInput) => {
    try {
      if (editing) await updateMutation.mutateAsync({ id: editing.id, ...input });
      else await createMutation.mutateAsync(input);
      setModalOpen(false);
      if (editing && selected.includes(editing.id)) setSelected([]);
      setEditing(null);
      toast.success(editing ? "Lançamento atualizado no banco" : "Lançamento salvo no banco");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento");
    }
  };

  const duplicate = async (transaction: Transaction) => {
    try {
      await duplicateMutation.mutateAsync({ id: transaction.id });
      setActionOpen(null);
      toast.success("Lançamento duplicado no banco");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível duplicar");
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      setSelected(current => current.filter(item => item !== id));
      setActionOpen(null);
      toast.success("Lançamento removido do banco");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir");
    }
  };

  const removeSelected = async () => {
    if (selected.length === 0) return;
    const selectedCount = selected.length;
    if (!window.confirm(`Excluir permanentemente ${selectedCount.toLocaleString("pt-BR")} lançamentos selecionados?`)) return;
    try {
      const result = await deleteManyMutation.mutateAsync({ ids: selected });
      setSelected([]);
      toast.success(`${result.deletedCount.toLocaleString("pt-BR")} lançamento${result.deletedCount === 1 ? " removido" : "s removidos"} do banco`);
    } catch (error) {
      toast.error(safeErrorMessage(error, "Não foi possível excluir os lançamentos selecionados. Tente novamente."));
    }
  };

  const markSelectedPaid = async () => {
    if (selected.length === 0) return;
    try {
      const result = await updateManyMutation.mutateAsync({ ids: selected, changes: { status: "Pago" } });
      setSelected([]);
      toast.success(`${result.matchedCount.toLocaleString("pt-BR")} lançamento${result.matchedCount === 1 ? " marcado" : "s marcados"} como pago`);
    } catch (error) {
      toast.error(safeErrorMessage(error, "Não foi possível marcar os lançamentos como pagos."));
    }
  };

  const editSelected = () => {
    if (selectedTransactions.length === 1) {
      setEditing(selectedTransactions[0]);
      setModalOpen(true);
      return;
    }
    setBulkEditOpen(true);
  };

  const saveBulkChanges = async (changes: BulkTransactionChanges) => {
    try {
      const result = await updateManyMutation.mutateAsync({ ids: selected, changes });
      setBulkEditOpen(false);
      setSelected([]);
      toast.success(`${result.matchedCount.toLocaleString("pt-BR")} lançamento${result.matchedCount === 1 ? " atualizado" : "s atualizados"}`);
    } catch (error) {
      toast.error(safeErrorMessage(error, "Não foi possível alterar os lançamentos selecionados."));
    }
  };

  const markPaid = async (transaction: Transaction) => {
    try {
      await toggleStatusMutation.mutateAsync({ id: transaction.id });
      toast.success(transaction.status === "Pago" ? "Marcado como pendente" : "Marcado como pago");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status");
    }
  };

  const exportTransactions = () => {
    if (transactions.length === 0) return toast.info("Não há lançamentos para exportar neste mês.");
    const header = ["Data", "Tipo", "Descrição", "Contato", "Categoria", "Valor", "Conta", "Status", "Recorrente"];
    const rows = transactions.map(item => [item.transactionDate, item.type, item.description, item.contact, item.category, item.amount.toFixed(2), item.account, item.status, item.recurring ? "Sim" : "Não"]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `lancamentos-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <Sidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
        <section className="flex min-w-0 flex-1 flex-col gap-4 pb-1">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto"><h1 className="text-[24px] font-bold tracking-[-0.035em] sm:text-[28px]">Lançamentos</h1><p className="mt-0.5 text-[12px] text-[#8A968D]">Dados reais salvos na sua conta</p></div>
            <div className="order-3 mx-auto flex w-full items-center justify-center gap-2 lg:order-none lg:w-auto">
              <button type="button" aria-label="Mês anterior" onClick={() => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className={toolButton}><ChevronRightIcon size={15} className="rotate-180" /></button>
              <div className="flex h-10 min-w-[174px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setMonthCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className={toolButton}><ChevronRightIcon size={15} /></button>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Importar lançamentos" onClick={() => setImportOpen(true)} className={toolButton}><UploadIcon size={17} /></button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="rounded-lg bg-[#0B1F14] px-2.5 py-1.5 text-[11px] font-semibold text-white">Importar OFX ou CSV</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label="Exportar lançamentos" onClick={exportTransactions} className={toolButton}><DownloadIcon size={17} /></button>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="rounded-lg bg-[#0B1F14] px-2.5 py-1.5 text-[11px] font-semibold text-white">Exportar CSV</TooltipContent>
            </Tooltip>
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
            <div className="relative ml-auto"><button type="button" aria-label="Configurar colunas" onClick={() => setColumnsOpen(value => !value)} className={toolButton}><SettingsIcon size={17} /></button>
              {columnsOpen && <div className="popover-enter absolute right-0 top-12 z-40 w-[290px] rounded-[18px] bg-white p-4 shadow-[0_22px_60px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]"><div className="flex items-center"><strong className="text-[14px]">Colunas</strong><span className="ml-auto text-[12px] font-semibold text-[#8A968D]">{visibleCount} de {columns.length}</span></div><div className="mt-3 space-y-1">{columns.map(column => <button key={column.key} type="button" onClick={() => setVisibleColumns(current => ({ ...current, [column.key]: !current[column.key] }))} className="flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-left text-[12.5px] hover:bg-[#F1FBF6]"><span className="grid h-5 w-3 grid-cols-2 gap-[2px]">{Array.from({ length: 6 }).map((_, index) => <i key={index} className="h-[3px] w-[3px] rounded-full bg-[#AAB4AD]" />)}</span><span className="flex-1">{column.label}</span><ColumnCheckState checked={visibleColumns[column.key]} /></button>)}</div><button type="button" onClick={() => setVisibleColumns(defaultColumnVisibility())} className="mt-3 w-full rounded-xl bg-[#F1F4F2] px-3 py-2.5 text-[12px] font-semibold text-[#4C6355] hover:bg-[#E8EEEA]">Restaurar padrão</button></div>}
            </div>
          </section>

          {selected.length > 0 && <section aria-live="polite" className="modal-enter flex flex-wrap items-center gap-2 rounded-[16px] bg-white px-3 py-3 ring-1 ring-[#DCE5DF] sm:px-4">
            <button type="button" disabled={updateManyMutation.isPending} onClick={markSelectedPaid} className="flex h-9 items-center gap-2 rounded-[10px] bg-[#F1FBF6] px-3.5 text-[12px] font-bold text-[#0A7A42] ring-1 ring-[#CFE9DA] transition hover:bg-[#E4F7ED] active:scale-[.98] disabled:opacity-50"><CheckIcon size={16} />Marcar como pago</button>
            <button type="button" disabled={updateManyMutation.isPending} onClick={editSelected} className="flex h-9 items-center gap-2 rounded-[10px] bg-white px-3.5 text-[12px] font-bold text-[#3F5146] ring-1 ring-[#DCE5DF] transition hover:bg-[#F4F8F6] active:scale-[.98] disabled:opacity-50"><EditIcon size={16} />Editar</button>
            <button type="button" disabled={deleteManyMutation.isPending} onClick={removeSelected} className="flex h-9 items-center gap-2 rounded-[10px] bg-white px-3.5 text-[12px] font-bold text-[#B3261E] ring-1 ring-[#F0D1CE] transition hover:bg-[#FDECEA] active:scale-[.98] disabled:opacity-50"><DeleteIcon size={16} />{deleteManyMutation.isPending ? "Excluindo..." : "Excluir"}</button>
            <strong className="ml-auto text-[12px] font-semibold text-[#607067]">{selected.length.toLocaleString("pt-BR")} {selected.length === 1 ? "item selecionado" : "itens selecionados"}</strong>
          </section>}

          {filtersOpen && <section className="grid gap-3 rounded-[16px] bg-white p-3.5 ring-1 ring-[#DFE6E1] sm:grid-cols-3"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Tipo</span><select value={typeFilter} onChange={event => setTypeFilter(event.target.value as typeof typeFilter)} className="h-9 w-full rounded-[10px] bg-[#F4F8F6] px-3 text-[12px] outline-none"><option value="todos">Todos</option><option value="entrada">Entradas</option><option value="saida">Saídas</option></select></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Status</span><select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 w-full rounded-[10px] bg-[#F4F8F6] px-3 text-[12px] outline-none"><option value="todos">Todos</option><option value="Pago">Pago</option><option value="Pendente">Pendente</option></select></label><div className="flex items-end"><button type="button" onClick={() => { setTypeFilter("todos"); setStatusFilter("todos"); setSearch(""); }} className="h-9 w-full rounded-[10px] bg-[#F1F4F2] text-[12px] font-semibold text-[#4C6355] hover:bg-[#E8EEEA]">Limpar filtros</button></div></section>}

          <section className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Saldo do período" value={formatMoney(summary.balance)} tone="default" active={typeFilter === "todos"} onClick={() => { setTypeFilter("todos"); setSelected([]); }} />
            <SummaryCard label="Saídas" value={formatMoney(-summary.outgoing)} tone="negative" active={typeFilter === "saida"} onClick={() => { setTypeFilter(current => current === "saida" ? "todos" : "saida"); setSelected([]); }} />
            <SummaryCard label="Entradas" value={formatMoney(summary.incoming)} tone="positive" active={typeFilter === "entrada"} onClick={() => { setTypeFilter(current => current === "entrada" ? "todos" : "entrada"); setSelected([]); }} />
          </section>

          <section className="relative min-h-0 flex-1 overflow-hidden rounded-[18px] bg-white ring-1 ring-[#E1E8E3]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1060px] border-collapse text-left">
                <thead><tr className="border-b border-[#E8EEEA] text-[10.5px] font-semibold uppercase tracking-[.045em] text-[#8A968D]"><th className="w-12 px-4 py-3"><SelectionCheckbox label="Selecionar todos" checked={allSelected} mixed={someSelected} onChange={() => setSelected(allSelected ? selected.filter(id => !filtered.some(item => item.id === id)) : Array.from(new Set([...selected, ...filtered.map(item => item.id)])))} /></th>{visibleColumns.type && <th className="w-14 py-3">Tipo</th>}{dateColumnVisible && <th className="w-24 py-3">Data</th>}{visibleColumns.description && <th className="min-w-[210px] py-3">Descrição</th>}{visibleColumns.recurring && <th className="w-24 py-3 text-center">Recorr.</th>}{visibleColumns.contact && <th className="min-w-[130px] py-3">Contato</th>}{visibleColumns.category && <SortableColumnHeader label="Categoria" sortKey="category" sort={sort} onSort={toggleSort} className="min-w-[180px]" />}{visibleColumns.amount && <SortableColumnHeader label="Valor" sortKey="amount" sort={sort} onSort={toggleSort} className="w-32 text-right" />}{visibleColumns.account && <SortableColumnHeader label="Conta" sortKey="account" sort={sort} onSort={toggleSort} className="w-20 text-center" />}{visibleColumns.status && <SortableColumnHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} className="w-20 text-center" />}<th className="w-14 py-3 pr-3" /></tr></thead>
                <tbody>{groupedTransactions.flatMap(group => [
                  ...(group.date ? [<tr key={`group-${group.date}`}><td colSpan={tableDataColumnCount + 2} className="border-b border-[#DDE5E0] bg-[#EDF2EF] p-0"><button type="button" aria-label={`${collapsedDates.has(group.date) ? "Expandir" : "Recolher"} lançamentos de ${formatDate(group.date)}`} aria-expanded={!collapsedDates.has(group.date)} onClick={() => setCollapsedDates(current => { const next = new Set(current); if (next.has(group.date)) next.delete(group.date); else next.add(group.date); return next; })} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12.5px] text-[#28382E] transition hover:bg-[#E5ECE7]"><ChevronRightIcon size={16} className={`transition-transform ${collapsedDates.has(group.date) ? "" : "rotate-90"}`} /><strong className="text-[13px]">{formatDate(group.date)}</strong><span className="rounded-md bg-white/75 px-2 py-0.5 text-[10.5px] font-semibold text-[#718077]">{group.items.length} lançamento{group.items.length === 1 ? "" : "s"}</span><span className="ml-auto text-[10.5px] font-medium text-[#718077]">Total do dia <strong className={group.total >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}>{formatMoney(group.total)}</strong></span></button></td></tr>] : []),
                  ...(!group.date || !collapsedDates.has(group.date) ? group.items.map(transaction => <tr key={transaction.id} className={`border-b border-[#EDF1EE] text-[12.5px] transition hover:bg-[#F8FBF9] ${selected.includes(transaction.id) ? "bg-[#F1FBF6]" : ""}`}><td className="px-4 py-2.5"><SelectionCheckbox label={`Selecionar ${transaction.description}`} checked={selected.includes(transaction.id)} onChange={() => setSelected(current => current.includes(transaction.id) ? current.filter(id => id !== transaction.id) : [...current, transaction.id])} /></td>{visibleColumns.type && <td className="py-2.5"><span title={transaction.type === "entrada" ? "Entrada" : "Saída"} className={`flex h-7 w-7 items-center justify-center rounded-[9px] ${transaction.type === "entrada" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>{transaction.type === "entrada" ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}</span></td>}{dateColumnVisible && <td className="py-2.5 text-[#607067]">{formatDate(transaction.transactionDate)}</td>}{visibleColumns.description && <td className="max-w-[240px] truncate py-2.5 pr-4 font-semibold">{transaction.description}</td>}{visibleColumns.recurring && <td className="py-2.5 text-center">{transaction.recurring ? <span title="Recorrente" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[#F1F4F2] text-[18px] text-[#718077]">↻</span> : <span className="text-[#CDD4CF]">—</span>}</td>}{visibleColumns.contact && <td className="max-w-[150px] truncate py-2.5 pr-4 text-[#607067]">{transaction.contact || "—"}</td>}{visibleColumns.category && <td className="max-w-[200px] truncate py-2.5 pr-4 font-medium">{transaction.category}</td>}{visibleColumns.amount && <td className={`py-2.5 text-right font-bold ${transaction.amount > 0 ? "text-[#0A7A42]" : "text-[#17241C]"}`}>{formatMoney(transaction.amount)}</td>}{visibleColumns.account && <td className="py-2.5 text-center"><AccountBadge account={transaction.account} /></td>}{visibleColumns.status && <td className="py-2.5 text-center"><button type="button" title={transaction.status} aria-label={`${transaction.status}: alterar status`} disabled={toggleStatusMutation.isPending} onClick={() => markPaid(transaction)} className={`inline-flex h-8 w-8 items-center justify-center rounded-[10px] disabled:opacity-50 ${transaction.status === "Pago" ? "bg-[#EAF8F0] text-[#12B85C]" : "bg-[#FFF5DD] text-[#B87500]"}`}><CheckIcon size={16} /></button></td>}<td className="relative py-2.5 pr-3 text-right"><button type="button" aria-label={`Ações de ${transaction.description}`} onClick={() => setActionOpen(actionOpen === transaction.id ? null : transaction.id)} className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] text-[#718077] hover:bg-[#F1F4F2]"><MenuIcon size={16} /></button>{actionOpen === transaction.id && <div className="popover-enter absolute right-3 top-10 z-30 w-[160px] rounded-[15px] bg-white p-1.5 text-left shadow-[0_16px_42px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]"><button type="button" onClick={() => duplicate(transaction)} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><DocumentIcon size={15} />Duplicar</button><button type="button" onClick={() => { setEditing(transaction); setModalOpen(true); setActionOpen(null); }} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><EditIcon size={15} />Editar</button><button type="button" onClick={() => remove(transaction.id)} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-[#B3261E] hover:bg-[#FDECEA]"><DeleteIcon size={15} />Excluir</button></div>}</td></tr>) : []),
                ])}</tbody>
              </table>
              {transactionsQuery.isLoading && <div className="flex items-center justify-center gap-3 px-5 py-16 text-[12.5px] text-[#718077]"><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/20 border-t-[#12B85C]" />Carregando seus lançamentos...</div>}
              {transactionsQuery.isError && <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><strong className="text-[14px] text-[#B3261E]">Não foi possível carregar os lançamentos</strong><button type="button" onClick={() => transactionsQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-semibold text-[#8E1F16]">Tentar novamente</button></div>}
            </div>
            {!transactionsQuery.isLoading && !transactionsQuery.isError && filtered.length === 0 && <div className="absolute inset-x-0 bottom-0 top-[41px] flex flex-col items-center justify-center px-5 py-8 text-center"><DocumentIcon size={28} className="text-[#AAB4AD]" /><strong className="mt-3 text-[14px]">{transactions.length === 0 ? "Nenhum lançamento salvo neste mês" : "Nenhum lançamento encontrado"}</strong><span className="mt-1 text-[12px] text-[#8A968D]">{transactions.length === 0 ? "Crie o primeiro lançamento para começar." : "Ajuste a busca ou limpe os filtros."}</span>{transactions.length === 0 && <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="mt-4 rounded-xl bg-[#12B85C] px-4 py-2.5 text-[12px] font-bold text-white"><PlusIcon size={14} className="mr-1 inline" />Novo lançamento</button>}</div>}
          </section>

          <footer className="sticky bottom-1 z-20 grid grid-cols-2 overflow-hidden rounded-[15px] bg-white shadow-[0_12px_35px_rgba(11,31,20,.12)] ring-1 ring-[#E1E8E3] sm:grid-cols-4"><div className="px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo anterior</span><strong className="mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.previousBalance)}</strong></div><div className="border-l border-[#EDF1EE] px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Entrada</span><strong className="mt-0.5 block text-[11.5px] text-[#0A9650] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.incoming)}</strong></div><div className="border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-l sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saída</span><strong className="mt-0.5 block text-[11.5px] text-[#C13B32] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(-summary.outgoing)}</strong></div><div className="border-l border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo final</span><strong className={`mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px] ${summary.previousBalance + summary.balance >= 0 ? "text-[#0A9650]" : "text-[#C13B32]"}`}>{formatMoney(summary.previousBalance + summary.balance)}</strong></div></footer>
        </section>
      </div>

      {modalOpen && <TransactionModal transaction={editing} defaultDate={defaultDateForMonth(period.year, period.month)} pending={mutationPending} options={organizationOptions} onManageOrganization={() => setLocation("/organizacao")} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveTransaction} />}
      {bulkEditOpen && <BulkEditModal selectedCount={selected.length} selectedTypes={selectedTypes} options={organizationOptions} pending={updateManyMutation.isPending} onClose={() => setBulkEditOpen(false)} onSave={saveBulkChanges} />}
      {importOpen && <ImportTransactionsModal onClose={() => setImportOpen(false)} onImported={refresh} onManageOrganization={() => setLocation("/organizacao")} />}
    </main>
  );
}
