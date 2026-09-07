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
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { todayIso } from "@/lib/period";
import { monogram, monogramSource, rowStatus, type RowStatus } from "@/lib/transactionRow";
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

type TransactionType = "entrada" | "saida" | "transferencia";

type Transaction = {
  id: number;
  type: TransactionType;
  transactionDate: string;
  description: string;
  contact: string;
  category: string;
  amount: number;
  account: string;
  accountId: number | null;
  categoryId: number | null;
  costCenter: string;
  costCenterId: number | null;
  importBatchId: string | null;
  status: "Pago" | "Pendente";
  recurring: boolean;
  recurringMonths: number | null;
  recurrenceGroupId: string | null;
  recurrenceIndex: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  transferGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type SeriesScope = "single" | "following";

type TransactionInput =
  Omit<Transaction, "id" | "createdAt" | "updatedAt" | "importBatchId" | "transferGroupId" | "recurrenceGroupId" | "recurrenceIndex">
  & { amount: number; destinationAccountId: number | null; recurrenceStart: "este_mes" | "proximo_mes" };

type OrganizationOptions = {
  accounts: Array<{ id: number; name: string; institution: string; color: string }>;
  categories: Array<{ id: number; name: string; type: "entrada" | "saida" | "ambos"; color: string }>;
  costCenters: Array<{ id: number; name: string; color: string }>;
};

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

/** Quantas linhas o rodapé revela por vez. */
const PAGE_SIZE = 50;

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(value)}%`;
}

/** "Sexta, 05 de setembro" — o cabeçalho de dia do extrato. */
function formatDayLabel(isoDate: string) {
  const label = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${isoDate}T00:00:00Z`));
  return label.replace(/^./, letter => letter.toUpperCase());
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

/** Colunas do extrato. Uma constante só para cabeçalho e linhas nunca desalinharem. */
const ROW_GRID = "grid grid-cols-[22px_minmax(0,1fr)_168px_132px_124px_120px_28px] items-center gap-3";

const STATUS_TONE: Record<RowStatus["tone"], string> = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

function KpiCard({ label, value, valueClass, hint, hintClass }: {
  label: string;
  value: string;
  valueClass?: string;
  hint: string;
  hintClass?: string;
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
      <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">{label}</span>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${valueClass ?? ""}`}>{value}</strong>
      <span className={`text-[12px] ${hintClass ?? "text-[#8A968D]"}`}>{hint}</span>
    </article>
  );
}

/** Chip removível de um filtro ativo. */
function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#DFF6EA] px-3.5 text-[13px] font-semibold text-[#0A7A42] hover:bg-[#CFEBDD]">
      {label}
      <CloseIcon size={13} />
    </button>
  );
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
    <button
      type="button"
      aria-sort={ariaSort}
      onClick={() => onSort(sortKey)}
      title={`Ordenar por ${label}`}
      className={`group flex items-center gap-1.5 transition hover:text-[#0A7A42] ${className || "justify-start"}`}
    >
      <span>{label}</span>
      <span aria-hidden="true" className={`text-[10px] leading-none ${active ? "text-[#12B85C]" : "text-[#BCC6BF] group-hover:text-[#74B68F]"}`}>
        {active ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

/**
 * A segunda linha da descrição. Prioriza o que exige ação — atraso primeiro —
 * e só depois o contexto. Com ordenação ligada não há cabeçalho de dia, então a
 * data entra aqui para não sumir da tela.
 */
function rowSubtitle(transaction: Transaction, status: RowStatus, showDate: boolean) {
  const parts: string[] = [];
  if (showDate) parts.push(formatDate(transaction.transactionDate));
  if (status.tone === "negative" && status.daysLate) {
    parts.push(`Vencido em ${formatDate(transaction.transactionDate)} · ${status.daysLate} ${status.daysLate === 1 ? "dia" : "dias"} de atraso`);
  } else if (transaction.type === "transferencia") {
    parts.push("Movimentação interna");
  } else if (transaction.recurrenceGroupId) {
    parts.push(`Parcela ${transaction.recurrenceIndex ?? 1} de ${transaction.recurringMonths ?? 1} · recorrente`);
  } else if (transaction.recurring) {
    parts.push("Recorrente");
  }
  if (transaction.contact) parts.push(transaction.contact);
  return parts.join(" · ");
}

function TransactionGridRow({ transaction, status, selected, showDate, pendingStatus, onToggleSelect, onToggleStatus, onCategorize, onEdit, onDuplicate, onDelete, menuOpen, onMenu }: {
  transaction: Transaction;
  status: RowStatus;
  selected: boolean;
  showDate: boolean;
  pendingStatus: boolean;
  onToggleSelect: () => void;
  onToggleStatus: () => void;
  onCategorize: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  menuOpen: boolean;
  onMenu: () => void;
}) {
  const isTransfer = transaction.type === "transferencia";
  const subtitle = rowSubtitle(transaction, status, showDate);
  // Só três fundos: selecionado, atrasado e o resto. Pintar todo pago de verde
  // deixaria a tela inteira verde e o alerta de atraso deixaria de saltar.
  const background = selected
    ? "bg-[#F1FBF6]"
    : status.tone === "negative"
      ? "bg-[#FDECEA]"
      : "bg-[#F8FAF9]";
  const amountClass = isTransfer
    ? "text-[#8A968D]"
    : transaction.amount >= 0
      ? "text-[#0A7A42]"
      : "text-[#B3261E]";
  const monogramClass = isTransfer
    ? "bg-[#F1F4F2] text-[#4C6355]"
    : transaction.amount >= 0
      ? "bg-[#DFF6EA] text-[#0A7A42]"
      : "bg-white text-[#8E1F16]";

  return (
    <div className={`relative ${ROW_GRID} rounded-[14px] px-3 py-2.5 text-[13.5px] transition ${background}`}>
      <SelectionCheckbox checked={selected} label={`Selecionar ${transaction.description}`} onChange={onToggleSelect} />
      <div className="flex min-w-0 items-center gap-3">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[12px] font-bold ${monogramClass}`}>
          {monogram(monogramSource(transaction.description, transaction.contact))}
        </span>
        <div className="min-w-0">
          <span className="block truncate font-semibold">{transaction.description}</span>
          {subtitle && (
            <span className={`block truncate text-[11.5px] ${status.tone === "negative" ? "text-[#8E1F16]" : "text-[#8A968D]"}`}>
              {subtitle}
            </span>
          )}
        </div>
      </div>
      {transaction.categoryId || transaction.category ? (
        <span className="truncate text-[#4C6355]">{transaction.category}</span>
      ) : (
        <button type="button" onClick={onCategorize} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0A7A42] hover:underline">
          <PlusIcon size={13} />Categorizar
        </button>
      )}
      <span className="truncate text-[#4C6355]">{transaction.account}</span>
      <button
        type="button"
        disabled={pendingStatus}
        onClick={onToggleStatus}
        title={transaction.status === "Pago" ? "Marcar como pendente" : "Marcar como pago"}
        className={`justify-self-start rounded-md px-2.5 py-1 text-[11px] font-semibold disabled:opacity-50 ${STATUS_TONE[status.tone]}`}
      >
        {status.label}
      </button>
      <span className={`text-right font-bold ${amountClass}`}>{formatMoney(transaction.amount)}</span>
      <button type="button" aria-label={`Ações de ${transaction.description}`} onClick={onMenu} className="flex h-7 w-7 items-center justify-center justify-self-end rounded-lg text-[#B3BFB7] hover:bg-white">
        <MenuIcon size={16} />
      </button>
      {menuOpen && (
        <div className="popover-enter absolute right-2 top-11 z-30 w-[160px] rounded-[15px] bg-white p-1.5 text-left shadow-[0_16px_42px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]">
          <button type="button" onClick={onDuplicate} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><DocumentIcon size={15} />Duplicar</button>
          <button type="button" onClick={onEdit} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><EditIcon size={15} />Editar</button>
          <button type="button" onClick={onDelete} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-[#B3261E] hover:bg-[#FDECEA]"><DeleteIcon size={15} />Excluir</button>
        </div>
      )}
    </div>
  );
}

function SeriesScopeDialog({ action, transaction, pending, onCancel, onConfirm }: {
  action: "save" | "delete";
  transaction: Transaction;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (scope: SeriesScope) => void;
}) {
  const total = transaction.recurringMonths ?? 0;
  const position = transaction.recurrenceIndex ?? 1;
  const verb = action === "delete" ? "Excluir" : "Salvar";
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="series-scope-title" className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onCancel()}>
      <div className="modal-enter w-full max-w-[420px] rounded-[20px] bg-white p-6 text-[#0B1F14] shadow-[0_20px_50px_rgba(11,31,20,.16)]">
        <h2 id="series-scope-title" className="text-[18px] font-bold tracking-[-.01em]">
          {action === "delete" ? "Excluir lançamento recorrente" : "Salvar lançamento recorrente"}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">
          Este é a parcela {position} de {total}. Escolha o alcance da mudança.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button type="button" disabled={pending} onClick={() => onConfirm("single")} className="rounded-[12px] border border-[#E3EAE5] px-4 py-3 text-left text-[13px] font-semibold hover:bg-[#F8FAF9] disabled:opacity-50">
            {verb} só esta parcela
            <span className="mt-0.5 block text-[11px] font-normal text-[#8A968D]">As outras ficam como estão.</span>
          </button>
          <button type="button" disabled={pending} onClick={() => onConfirm("following")} className="rounded-[12px] bg-[#12B85C] px-4 py-3 text-left text-[13px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-50">
            {verb} esta e as próximas
            <span className="mt-0.5 block text-[11px] font-normal text-white/85">Parcelas anteriores e meses já pagos não são tocados.</span>
          </button>
        </div>
        <button type="button" disabled={pending} onClick={onCancel} className="mt-3 h-11 w-full rounded-[12px] bg-[#F1F4F2] text-[13px] font-bold text-[#4C6355] hover:bg-[#E7ECE9] disabled:opacity-50">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function TypeBadge({ type, amount }: { type: TransactionType; amount: number }) {
  if (type === "transferencia") {
    // As duas pernas usam o mesmo tipo; o sinal diz se esta linha sai ou entra.
    const outgoing = amount < 0;
    return (
      <span
        title={outgoing ? "Transferência enviada" : "Transferência recebida"}
        className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-[#F1F4F2] text-[#4C6355]"
      >
        {outgoing ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
      </span>
    );
  }
  return (
    <span
      title={type === "entrada" ? "Entrada" : "Saída"}
      className={`flex h-7 w-7 items-center justify-center rounded-[9px] ${type === "entrada" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}
    >
      {type === "entrada" ? <ArrowUpIcon size={14} /> : <ArrowDownIcon size={14} />}
    </span>
  );
}

const TYPE_OPTIONS: Array<{ value: TransactionType; label: string }> = [
  { value: "entrada", label: "Entrada" },
  { value: "saida", label: "Saída" },
  { value: "transferencia", label: "Transferência" },
];

/** O rótulo de "pago" muda com o tipo; o valor gravado continua Pago/Pendente. */
const SETTLED_LABEL: Record<TransactionType, string> = {
  entrada: "Recebido",
  saida: "Pago",
  transferencia: "Concluída",
};

const AMOUNT_COLOR: Record<TransactionType, string> = {
  entrada: "text-[#0A7A42]",
  saida: "text-[#B3261E]",
  transferencia: "text-[#0B1F14]",
};

/**
 * Mesma regra de âncora do servidor (server/recurrence.ts): o dia vem sempre da
 * data original e encolhe só quando o mês de destino é mais curto. Aqui serve
 * apenas para mostrar as datas ao usuário antes de salvar.
 */
function addMonthAnchored(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetYear = month === 12 ? year + 1 : year;
  const targetMonth = month === 12 ? 1 : month + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`;
}

const ATTACHMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp";
const ATTACHMENT_CONTENT_TYPES: Record<string, "application/pdf" | "image/png" | "image/jpeg" | "image/webp"> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

/** Base64 puro, sem o prefixo "data:...;base64," que o FileReader devolve. */
function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Não foi possível ler o arquivo"));
    reader.onload = () => {
      const result = String(reader.result);
      const separator = result.indexOf(",");
      if (separator === -1) reject(new Error("Arquivo inválido"));
      else resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

const fieldClass = "h-[46px] w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
const fieldLabelClass = "mb-[7px] block text-[12.5px] font-semibold text-[#4C6355]";

function TransactionModal({ transaction, defaultDate, pending, options, onManageOrganization, onClose, onSave }: { transaction?: Transaction | null; defaultDate: string; pending: boolean; options: OrganizationOptions; onManageOrganization: () => void; onClose: () => void; onSave: (transaction: TransactionInput) => Promise<void> }) {
  const [type, setType] = useState<TransactionType>(transaction?.type ?? "entrada");
  const [transactionDate, setTransactionDate] = useState(transaction?.transactionDate ?? defaultDate);
  const [description, setDescription] = useState(transaction?.description ?? "");
  const [contact, setContact] = useState(transaction?.contact ?? "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [categoryId, setCategoryId] = useState<number | null>(transaction?.categoryId ?? null);
  const [amount, setAmount] = useState(transaction ? formatCurrencyValue(Math.abs(transaction.amount)) : "0,00");
  const [account, setAccount] = useState(transaction?.account ?? "");
  const [accountId, setAccountId] = useState<number | null>(transaction?.accountId ?? null);
  const [destinationAccountId, setDestinationAccountId] = useState<number | null>(null);
  const [costCenter, setCostCenter] = useState(transaction?.costCenter ?? "");
  const [costCenterId, setCostCenterId] = useState<number | null>(transaction?.costCenterId ?? null);
  const [status, setStatus] = useState<Transaction["status"]>(transaction?.status ?? "Pendente");
  const [recurring, setRecurring] = useState(transaction?.recurring ?? false);
  const [recurringMonths, setRecurringMonths] = useState(transaction?.recurringMonths ?? 12);
  const [recurrenceStart, setRecurrenceStart] = useState<"este_mes" | "proximo_mes">("este_mes");
  const [attachmentKey, setAttachmentKey] = useState(transaction?.attachmentKey ?? null);
  const [attachmentName, setAttachmentName] = useState(transaction?.attachmentName ?? null);
  const uploadAttachment = trpc.transactions.uploadAttachment.useMutation();

  const isTransfer = type === "transferencia";
  const editingTransfer = Boolean(transaction?.transferGroupId);
  // Uma série já criada tem datas próprias; recriá-la exigiria apagar e lançar de novo.
  const editingSeries = Boolean(transaction?.recurrenceGroupId);
  const firstInstallmentDate = recurrenceStart === "proximo_mes" ? addMonthAnchored(transactionDate) : transactionDate;
  const lastInstallmentDate = Array.from({ length: Math.max(0, recurringMonths - 1) })
    .reduce<string>(date => addMonthAnchored(date), firstInstallmentDate);
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "UTC" })
    .format(new Date(`${transactionDate}T00:00:00Z`));

  const changeType = (next: TransactionType) => {
    if (editingTransfer && next !== "transferencia") {
      toast.info("Uma transferência não vira entrada ou saída. Exclua e lance de novo.");
      return;
    }
    setType(next);
    if (next === "transferencia") {
      setCategory("");
      setCategoryId(null);
    } else {
      setDestinationAccountId(null);
    }
  };

  const pickAttachment = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("O anexo deve ter no máximo 8 MB");
      return;
    }
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    const contentType = ATTACHMENT_CONTENT_TYPES[extension];
    if (!contentType) {
      toast.error("Anexe um PDF ou uma imagem PNG, JPG ou WEBP");
      return;
    }
    try {
      const stored = await uploadAttachment.mutateAsync({
        fileName: file.name,
        contentType,
        dataBase64: await fileToBase64(file),
      });
      setAttachmentKey(stored.key);
      setAttachmentName(stored.name);
      toast.success("Anexo enviado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível enviar o anexo");
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = currencyInputToNumber(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return toast.error("Informe um valor válido");
    if (!accountId) return toast.error(isTransfer ? "Selecione a conta de origem" : "Selecione uma conta");
    if (isTransfer) {
      if (!destinationAccountId) return toast.error("Selecione a conta de destino");
      if (destinationAccountId === accountId) return toast.error("A conta de destino precisa ser diferente da origem");
    } else if (!categoryId) {
      return toast.error("Selecione uma categoria");
    }

    await onSave({
      type,
      transactionDate,
      description,
      contact,
      category: isTransfer ? "" : category,
      categoryId: isTransfer ? null : categoryId,
      amount: parsed,
      account,
      accountId,
      destinationAccountId: isTransfer ? destinationAccountId : null,
      costCenter,
      costCenterId,
      status,
      recurring,
      recurringMonths: recurring ? recurringMonths : null,
      recurrenceStart,
      attachmentKey,
      attachmentName,
    });
  };

  const selectAccount = (value: string, apply: (id: number | null, name: string) => void) => {
    const id = Number(value) || null;
    apply(id, options.accounts.find(item => item.id === id)?.name ?? "");
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="launch-title" className="drawer-backdrop-enter fixed inset-0 z-[80] flex justify-end bg-[#07150d]/45 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="drawer-enter flex h-full w-full max-w-[452px] flex-col bg-white text-[#0B1F14] shadow-[-20px_0_50px_rgba(11,31,20,.16)] sm:rounded-l-[20px]">
        <div className="flex shrink-0 items-center gap-3 border-b border-[#EDF1EE] px-6 py-5">
          <div className="min-w-0">
            <h2 id="launch-title" className="text-[18px] font-bold tracking-[-.01em]">
              {transaction ? "Editar lançamento" : "Novo lançamento"}
            </h2>
            <p className="text-[12.5px] text-[#8A968D]">Entra no extrato de {monthLabel}</p>
          </div>
          <button type="button" aria-label="Fechar modal" onClick={onClose} className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9]">
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="flex gap-2">
          {TYPE_OPTIONS.map(option => {
            const active = type === option.value;
            const Icon = option.value === "entrada" ? ArrowUpIcon : option.value === "saida" ? ArrowDownIcon : null;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => changeType(option.value)}
                aria-pressed={active}
                className={`flex h-[42px] flex-1 items-center justify-center gap-[7px] rounded-xl text-[13px] transition ${
                  active
                    ? "bg-[#12B85C] font-bold text-white"
                    : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"
                }`}
              >
                {Icon && <Icon size={14} />}
                {option.label}
              </button>
            );
          })}
        </div>

        <label className="block">
          <span className={fieldLabelClass}>Valor</span>
          <div className="flex h-14 items-center gap-[9px] rounded-xl border-[1.5px] border-[#E3EAE5] px-4 focus-within:border-[#12B85C]">
            <span className="text-[14px] font-semibold text-[#8A968D]">R$</span>
            <input
              required
              autoFocus
              inputMode="decimal"
              value={amount}
              onFocus={event => event.currentTarget.select()}
              onChange={event => setAmount(formatCurrencyInput(event.target.value))}
              placeholder="0,00"
              className={`min-w-0 flex-1 bg-transparent text-[26px] font-bold tracking-[-.02em] outline-none ${AMOUNT_COLOR[type]}`}
            />
          </div>
        </label>

        <label className="block">
          <span className={fieldLabelClass}>Descrição</span>
          <input required minLength={2} maxLength={180} value={description} onChange={event => setDescription(event.target.value)} placeholder="Ex.: Plano API · Loja Oneclick" className={fieldClass} />
        </label>

        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>Data</span>
            <input required type="date" value={transactionDate} onChange={event => setTransactionDate(event.target.value)} className={fieldClass} />
          </label>
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>{isTransfer ? "Conta de origem" : "Conta"}</span>
            <select required value={accountId ?? ""} onChange={event => selectAccount(event.target.value, (id, name) => { setAccountId(id); setAccount(name); })} className={fieldClass}>
              <option value="">Selecione</option>
              {options.accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <div className="flex gap-3">
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>{isTransfer ? "Conta de destino" : "Categoria"}</span>
            {isTransfer ? (
              <select required value={destinationAccountId ?? ""} onChange={event => setDestinationAccountId(Number(event.target.value) || null)} className={fieldClass}>
                <option value="">Selecione</option>
                {options.accounts.filter(item => item.id !== accountId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : (
              <select required value={categoryId ?? ""} onChange={event => { const id = Number(event.target.value) || null; setCategoryId(id); setCategory(options.categories.find(item => item.id === id)?.name ?? ""); }} className={fieldClass}>
                <option value="">Selecione</option>
                {options.categories.filter(item => item.type === "ambos" || item.type === type).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            )}
          </label>
          <label className="min-w-0 flex-1">
            <span className={fieldLabelClass}>Centro de custo</span>
            <select value={costCenterId ?? ""} onChange={event => { const id = Number(event.target.value) || null; setCostCenterId(id); setCostCenter(options.costCenters.find(item => item.id === id)?.name ?? ""); }} className={fieldClass}>
              <option value="">Nenhum</option>
              {options.costCenters.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>

        <label className="block">
          <span className={fieldLabelClass}>Contato</span>
          <input maxLength={120} value={contact} onChange={event => setContact(event.target.value)} placeholder="Fornecedor ou cliente" className={fieldClass} />
        </label>

        <div>
          <span className={fieldLabelClass}>Situação</span>
          <div className="flex gap-2">
            {([["Pago", SETTLED_LABEL[type]], ["Pendente", "Em aberto"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setStatus(value)}
                aria-pressed={status === value}
                className={`h-10 flex-1 rounded-xl text-[12.5px] transition ${
                  status === value
                    ? "bg-[#DFF6EA] font-bold text-[#0A7A42]"
                    : "border border-[#E3EAE5] text-[#4C6355] hover:bg-[#F8FAF9]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[14px] bg-[#F1FBF6] p-3.5">
          <div className="flex items-center gap-[11px]">
            {/* Checkbox nativo não segue o tema escuro; este é o mesmo do painel de colunas. */}
            <SelectionCheckbox checked={recurring} label="Repetir todo mês" onChange={() => setRecurring(value => !value)} />
            <span className="flex-1 text-[12.5px] font-semibold text-[#0A7A42]">Repetir todo mês</span>
            {recurring && (
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#0A7A42]">
                por
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={recurringMonths}
                  onChange={event => setRecurringMonths(Math.min(120, Math.max(1, Number(event.target.value) || 1)))}
                  aria-label="Meses de recorrência"
                  className="h-8 w-[62px] rounded-lg border border-[#E3EAE5] bg-white px-2 text-center text-[12.5px] font-bold outline-none focus:border-[#12B85C]"
                />
                meses
              </span>
            )}
          </div>
          {recurring && !transaction && (
            <>
              <div className="mt-3 flex gap-2">
                {([["este_mes", "Começar neste mês"], ["proximo_mes", "Só no mês que vem"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRecurrenceStart(value)}
                    aria-pressed={recurrenceStart === value}
                    className={`h-9 flex-1 rounded-[10px] text-[12px] transition ${
                      recurrenceStart === value
                        ? "bg-white font-bold text-[#0A7A42] ring-1 ring-[#CFE2D7]"
                        : "text-[#4C6355] hover:bg-white/60"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#4C6355]">
                {recurringMonths === 1
                  ? `Uma parcela só, em ${formatDate(firstInstallmentDate)}.`
                  : `${recurringMonths} lançamentos, de ${formatDate(firstInstallmentDate)} até ${formatDate(lastInstallmentDate)}. Só o primeiro segue a situação escolhida acima; os demais nascem em aberto.`}
              </p>
            </>
          )}
          {recurring && transaction && (
            <p className="mt-2 text-[11px] leading-relaxed text-[#4C6355]">
              {editingSeries
                ? `Parcela ${transaction.recurrenceIndex ?? 1} de ${transaction.recurringMonths ?? recurringMonths}. Ao salvar, você escolhe se a mudança vale só para esta ou também para as próximas em aberto.`
                : "Alterar o prazo aqui não cria as parcelas: para gerar uma série, exclua e lance de novo."}
            </p>
          )}
        </div>

        {attachmentName ? (
          <div className="flex h-[46px] items-center gap-[9px] rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5">
            <DocumentIcon size={15} />
            <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[#0A7A42]">{attachmentName}</span>
            <button type="button" aria-label="Remover anexo" onClick={() => { setAttachmentKey(null); setAttachmentName(null); }} className="shrink-0 rounded-lg p-1 text-[#8A968D] hover:bg-[#E7ECE9]">
              <CloseIcon size={14} />
            </button>
          </div>
        ) : (
          <label className={`flex h-[46px] cursor-pointer items-center gap-[9px] rounded-xl border border-dashed border-[#C9D5CD] px-3.5 ${uploadAttachment.isPending ? "opacity-60" : "hover:bg-[#F8FAF9]"}`}>
            <UploadIcon size={15} />
            <span className="text-[13px] font-semibold text-[#0A7A42]">
              {uploadAttachment.isPending ? "Enviando anexo..." : "Anexar comprovante ou nota"}
            </span>
            <input type="file" accept={ATTACHMENT_ACCEPT} disabled={uploadAttachment.isPending} onChange={event => { void pickAttachment(event.target.files?.[0]); event.target.value = ""; }} className="hidden" />
          </label>
        )}

        {(options.accounts.length === 0 || (!isTransfer && options.categories.length === 0)) && (
          <button type="button" onClick={onManageOrganization} className="rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-left text-[11px] font-bold text-[#725517]">
            Cadastre uma conta e uma categoria para continuar
          </button>
        )}
        {isTransfer && options.accounts.length < 2 && (
          <p className="rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-[11px] font-bold text-[#725517]">
            Uma transferência precisa de duas contas cadastradas.
          </p>
        )}

        </div>

        <div className="flex shrink-0 gap-3 border-t border-[#EDF1EE] px-6 py-4">
          <button type="button" onClick={onClose} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
          <button type="submit" disabled={pending || uploadAttachment.isPending} className="flex h-12 flex-[2] items-center justify-center gap-2 rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:cursor-wait disabled:opacity-60">
            {pending ? "Salvando..." : "Salvar lançamento"}
          </button>
        </div>
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

/**
 * A barra de seleção só oferece categorizar, então o modal é só o seletor. Ele
 * recusa uma categoria incompatível com o tipo dos selecionados antes de mandar
 * ao servidor, que também valida — a checagem aqui existe para o usuário não
 * descobrir a recusa depois de escolher.
 */
function CategorizeModal({ selectedCount, selectedTypes, options, pending, onClose, onSave }: {
  selectedCount: number;
  selectedTypes: TransactionType[];
  options: OrganizationOptions;
  pending: boolean;
  onClose: () => void;
  onSave: (categoryId: number) => Promise<void>;
}) {
  const [categoryId, setCategoryId] = useState("");
  const hasTransfer = selectedTypes.includes("transferencia");
  const compatibleCategories = options.categories.filter(category => selectedTypes.length === 1
    ? category.type === "ambos" || category.type === selectedTypes[0]
    : category.type === "ambos");

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="categorize-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          if (!categoryId) return toast.info("Escolha uma categoria.");
          await onSave(Number(categoryId));
        }}
        className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-6 text-[#0B1F14]"
      >
        <div className="flex items-start gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Em lote</p>
            <h2 id="categorize-title" className="mt-1 text-xl font-bold">Categorizar lançamentos</h2>
            <p className="mt-1 text-[12px] text-[#8A968D]">
              A categoria escolhida vale para {selectedCount === 1 ? "o item selecionado" : `os ${selectedCount.toLocaleString("pt-BR")} itens selecionados`}.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Categoria</span>
          <select
            autoFocus
            disabled={hasTransfer}
            value={categoryId}
            onChange={event => setCategoryId(event.target.value)}
            className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Selecione</option>
            {compatibleCategories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
        </label>

        {hasTransfer && (
          <p className="mt-3 rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-[11px] leading-relaxed text-[#725517]">
            A seleção inclui transferências, que têm categoria fixa. Tire-as da seleção para categorizar o restante.
          </p>
        )}
        {!hasTransfer && selectedTypes.length > 1 && compatibleCategories.length === 0 && (
          <p className="mt-3 rounded-xl bg-[#FFF8E8] px-3 py-2.5 text-[11px] leading-relaxed text-[#725517]">
            A seleção combina entradas e saídas. Para categorizar em conjunto, cadastre uma categoria do tipo “Ambos”.
          </p>
        )}

        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button>
          <button type="submit" disabled={pending || hasTransfer || !categoryId} className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">
            {pending ? "Aplicando..." : "Aplicar categoria"}
          </button>
        </div>
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
  const [accountFilter, setAccountFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [visibleLimit, setVisibleLimit] = useState(PAGE_SIZE);
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [sort, setSort] = useState<TransactionSortState>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [actionOpen, setActionOpen] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [collapsedDates, setCollapsedDates] = useState<Set<string>>(() => new Set());
  const period = useMemo(() => ({ year: monthCursor.getFullYear(), month: monthCursor.getMonth() + 1 }), [monthCursor]);
  const utils = trpc.useUtils();
  const transactionsQuery = trpc.transactions.list.useQuery(period);
  const organizationQuery = trpc.organization.options.useQuery();
  const organizationOptions = organizationQuery.data ?? { accounts: [], categories: [], costCenters: [] };
  const transactions = (transactionsQuery.data?.items ?? EMPTY_TRANSACTIONS) as Transaction[];
  const summary = transactionsQuery.data?.summary ?? { incoming: 0, outgoing: 0, balance: 0, previousBalance: 0 };

  const refresh = async () => {
    await Promise.all([utils.transactions.list.invalidate(), utils.transactions.dashboard.invalidate(), utils.organization.overview.invalidate()]);
  };
  const createMutation = trpc.transactions.create.useMutation({ onSuccess: refresh });
  const updateMutation = trpc.transactions.update.useMutation({ onSuccess: refresh });
  const duplicateMutation = trpc.transactions.duplicate.useMutation({ onSuccess: refresh });
  const deleteMutation = trpc.transactions.delete.useMutation({ onSuccess: refresh });
  const [seriesPrompt, setSeriesPrompt] = useState<
    | { action: "save"; transaction: Transaction; input: TransactionInput }
    | { action: "delete"; transaction: Transaction }
    | null
  >(null);
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
      return matchesSearch
        && (typeFilter === "todos" || item.type === typeFilter)
        && (statusFilter === "todos" || item.status === statusFilter)
        && (accountFilter === "todos" || item.account === accountFilter)
        && (categoryFilter === "todos" || item.category === categoryFilter);
    });
  }, [accountFilter, categoryFilter, search, statusFilter, transactions, typeFilter]);

  // Um filtro novo pode deixar a lista menor que a janela já revelada; voltar ao
  // tamanho inicial evita mostrar "50 de 12".
  useEffect(() => {
    setVisibleLimit(PAGE_SIZE);
  }, [accountFilter, categoryFilter, search, statusFilter, typeFilter, sort]);

  const allSelected = filtered.length > 0 && filtered.every(item => selected.includes(item.id));
  const someSelected = !allSelected && filtered.some(item => selected.includes(item.id));
  const selectedTransactions = useMemo(() => transactions.filter(transaction => selected.includes(transaction.id)), [selected, transactions]);
  const selectedTypes = useMemo(() => Array.from(new Set(selectedTransactions.map(transaction => transaction.type))), [selectedTransactions]);
  // Os totais e as contagens olham o mês filtrado inteiro; só a renderização é
  // paginada. Um "Carregar mais" que mudasse os KPIs seria mentiroso.
  const visible = useMemo(() => filtered.slice(0, visibleLimit), [filtered, visibleLimit]);
  const groupedTransactions = useMemo(() => buildTransactionDisplayGroups(visible, sort), [visible, sort]);
  const today = todayIso();
  const counts = useMemo(() => {
    const cash = filtered.filter(item => item.type !== "transferencia");
    const pendings = cash.filter(item => item.status === "Pendente");
    return {
      incoming: cash.filter(item => item.amount > 0).length,
      outgoing: cash.filter(item => item.amount < 0).length,
      pending: pendings.length,
      late: pendings.filter(item => rowStatus(item, today).tone === "negative").length,
      uncategorized: filtered.filter(item => !item.category).length,
    };
  }, [filtered, today]);
  const selectedTotal = useMemo(
    () => transactions.filter(item => selected.includes(item.id)).reduce((sum, item) => sum + item.amount, 0),
    [selected, transactions]
  );
  const periodLabel = useMemo(() => {
    const last = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
    const short = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" })
      .format(new Date(Date.UTC(period.year, period.month - 1, 1)))
      .replace(".", "");
    return `01–${last} ${short} ${period.year}`;
  }, [period.month, period.year]);
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const monthLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(monthCursor).replace(/^./, letter => letter.toUpperCase());
  const mutationPending = createMutation.isPending || updateMutation.isPending;

  const toggleSort = (key: TransactionSortKey) => {
    setSort(current => current?.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "amount" ? "desc" : "asc" });
  };

  const commitSave = async (input: TransactionInput, target: Transaction | null, scope: SeriesScope) => {
    try {
      if (target) {
        const result = await updateMutation.mutateAsync({ id: target.id, ...input, scope });
        toast.success(result.updatedCount > 1
          ? `${result.updatedCount} parcelas atualizadas`
          : "Lançamento atualizado no banco");
        if (selected.includes(target.id)) setSelected([]);
      } else {
        const result = await createMutation.mutateAsync(input);
        toast.success(result.monthCount > 1
          ? `${result.monthCount} lançamentos criados, de ${formatDate(input.transactionDate)} em diante`
          : "Lançamento salvo no banco");
      }
      setModalOpen(false);
      setEditing(null);
      setSeriesPrompt(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento");
    }
  };

  const saveTransaction = async (input: TransactionInput) => {
    // Só perguntamos o alcance quando existe série: sem isso o modal salvaria
    // silenciosamente meses que o usuário não estava olhando.
    if (editing?.recurrenceGroupId) {
      setSeriesPrompt({ action: "save", transaction: editing, input });
      return;
    }
    await commitSave(input, editing, "single");
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

  const commitDelete = async (transaction: Transaction, scope: SeriesScope) => {
    try {
      const result = await deleteMutation.mutateAsync({ id: transaction.id, scope });
      setSelected(current => current.filter(item => item !== transaction.id));
      setActionOpen(null);
      setSeriesPrompt(null);
      toast.success(result.deletedCount > 1
        ? `${result.deletedCount} lançamentos removidos`
        : "Lançamento removido do banco");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir");
    }
  };

  const remove = async (transaction: Transaction) => {
    if (transaction.recurrenceGroupId) {
      setActionOpen(null);
      setSeriesPrompt({ action: "delete", transaction });
      return;
    }
    try {
      await commitDelete(transaction, "single");
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

  const categorizeSelected = async (categoryId: number) => {
    try {
      const result = await updateManyMutation.mutateAsync({ ids: selected, changes: { categoryId } });
      setCategorizeOpen(false);
      setSelected([]);
      toast.success(`${result.matchedCount.toLocaleString("pt-BR")} lançamento${result.matchedCount === 1 ? " categorizado" : "s categorizados"}`);
    } catch (error) {
      toast.error(safeErrorMessage(error, "Não foi possível categorizar os lançamentos selecionados."));
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
            <label className="relative order-4 min-w-[200px] flex-1 lg:order-none lg:max-w-[280px]">
              <SearchIcon size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A968D]" />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar lançamento…" className="h-10 w-full rounded-[12px] bg-white pl-10 pr-3 text-[13px] outline-none ring-1 ring-[#DFE6E1] focus:ring-2 focus:ring-[#12B85C]/30" />
            </label>
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
              {accountOpen && <div className="popover-enter absolute right-0 top-12 z-40 w-[250px] rounded-[17px] bg-white p-3 shadow-[0_20px_50px_rgba(11,31,20,.18)]"><div className="rounded-xl bg-[#F8FAF9] p-3"><strong className="block truncate text-[12px]">{user?.name || "Sua conta"}</strong><span className="mt-0.5 block truncate text-[10.5px] text-[#8A968D]">{user?.email}</span></div><ThemeToggle className="mt-2 rounded-xl bg-[#F8FAF9] p-2" /><button type="button" onClick={async () => { await logout(); setLocation("/login", { replace: true }); }} className="mt-2 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-[12px] font-semibold text-[#8E1F16] hover:bg-[#FDECEA]">Sair <ChevronRightIcon size={14} /></button></div>}
            </div>
          </header>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Entradas do período"
              value={formatMoney(summary.incoming)}
              valueClass="text-[#0A7A42]"
              hint={`${counts.incoming.toLocaleString("pt-BR")} ${counts.incoming === 1 ? "lançamento" : "lançamentos"}`}
            />
            <KpiCard
              label="Saídas do período"
              value={formatMoney(summary.outgoing)}
              valueClass="text-[#B3261E]"
              hint={`${counts.outgoing.toLocaleString("pt-BR")} ${counts.outgoing === 1 ? "lançamento" : "lançamentos"}`}
            />
            <KpiCard
              label="Resultado"
              value={formatMoney(summary.balance)}
              hint={summary.incoming > 0 ? `margem ${formatPercent((summary.balance / summary.incoming) * 100)}` : "sem entradas no período"}
              hintClass={summary.balance >= 0 ? "font-semibold text-[#0A7A42]" : "font-semibold text-[#B3261E]"}
            />
            <KpiCard
              label="Pendentes"
              value={counts.pending.toLocaleString("pt-BR")}
              hint={counts.pending === 0
                ? "nada em aberto neste mês"
                : `${counts.uncategorized} sem categoria · ${counts.late} ${counts.late === 1 ? "atrasado" : "atrasados"}`}
              hintClass={counts.late > 0 ? "font-semibold text-[#8E1F16]" : "text-[#8A968D]"}
            />
          </section>

          <section className="flex min-h-0 flex-1 flex-col gap-3.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5 rounded-[12px] bg-[#F1F4F2] p-1.5">
                {([["todos", "Todos"], ["entrada", "Entradas"], ["saida", "Saídas"], ["transferencia", "Transferências"]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setTypeFilter(value); setSelected([]); }}
                    aria-pressed={typeFilter === value}
                    className={`rounded-[9px] px-3.5 py-[7px] text-[13px] transition ${typeFilter === value ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-white"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="flex h-10 items-center gap-2 rounded-[12px] px-3.5 text-[13px] text-[#28382E] ring-1 ring-[#E3EAE5]">
                <ChartIcon size={14} />{periodLabel}
              </span>
              {accountFilter !== "todos" && <FilterChip label={`Conta: ${accountFilter}`} onClear={() => setAccountFilter("todos")} />}
              {categoryFilter !== "todos" && <FilterChip label={`Categoria: ${categoryFilter}`} onClear={() => setCategoryFilter("todos")} />}
              {statusFilter !== "todos" && <FilterChip label={`Situação: ${statusFilter === "Pago" ? "Pago" : "Em aberto"}`} onClear={() => setStatusFilter("todos")} />}
              <button
                type="button"
                onClick={() => setFiltersOpen(value => !value)}
                aria-expanded={filtersOpen}
                className={`flex h-10 items-center gap-2 rounded-[12px] px-3.5 text-[13px] font-semibold transition ${filtersOpen ? "bg-[#DFF6EA] text-[#0A7A42]" : "border border-dashed border-[#C9D5CD] text-[#4C6355] hover:bg-[#F8FAF9]"}`}
              >
                <PlusIcon size={13} />Filtro
              </button>
            </div>

            {filtersOpen && (
              <div className="grid gap-3 rounded-[14px] bg-[#F8FAF9] p-3.5 sm:grid-cols-4">
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Conta</span>
                  <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)} className="h-9 w-full rounded-[10px] bg-white px-3 text-[12px] outline-none ring-1 ring-[#E3EAE5]">
                    <option value="todos">Todas</option>
                    {organizationOptions.accounts.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Categoria</span>
                  <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="h-9 w-full rounded-[10px] bg-white px-3 text-[12px] outline-none ring-1 ring-[#E3EAE5]">
                    <option value="todos">Todas</option>
                    {organizationOptions.categories.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Situação</span>
                  <select value={statusFilter} onChange={event => setStatusFilter(event.target.value as typeof statusFilter)} className="h-9 w-full rounded-[10px] bg-white px-3 text-[12px] outline-none ring-1 ring-[#E3EAE5]">
                    <option value="todos">Todas</option>
                    <option value="Pago">Pago</option>
                    <option value="Pendente">Em aberto</option>
                  </select>
                </label>
                <div className="flex items-end">
                  <button type="button" onClick={() => { setTypeFilter("todos"); setStatusFilter("todos"); setAccountFilter("todos"); setCategoryFilter("todos"); setSearch(""); }} className="h-9 w-full rounded-[10px] bg-[#F1F4F2] text-[12px] font-semibold text-[#4C6355] hover:bg-[#E8EEEA]">
                    Limpar filtros
                  </button>
                </div>
              </div>
            )}

            {selected.length > 0 && (
              <div aria-live="polite" className="modal-enter flex flex-wrap items-center gap-2.5 rounded-[14px] bg-[#0B1F14] px-3.5 py-3 text-white">
                <SelectionCheckbox checked mixed label="Limpar seleção" onChange={() => setSelected([])} />
                <span className="text-[13px] font-semibold">
                  {selected.length.toLocaleString("pt-BR")} {selected.length === 1 ? "lançamento selecionado" : "lançamentos selecionados"} · {formatMoney(selectedTotal)}
                </span>
                <button type="button" disabled={updateManyMutation.isPending} onClick={() => setCategorizeOpen(true)} className="ml-auto rounded-[10px] bg-[#12321F] px-3.5 py-2 text-[12.5px] font-semibold hover:bg-[#1A4229] disabled:opacity-50">Categorizar</button>
                <button type="button" disabled={updateManyMutation.isPending} onClick={markSelectedPaid} className="rounded-[10px] bg-[#12B85C] px-3.5 py-2 text-[12.5px] font-bold hover:bg-[#0F9E4E] disabled:opacity-50">Marcar como pago</button>
                <button type="button" disabled={deleteManyMutation.isPending} onClick={removeSelected} className="flex items-center gap-2 rounded-[10px] px-3.5 py-2 text-[12.5px] font-semibold text-[#F4A497] hover:bg-[#12321F] disabled:opacity-50">
                  <DeleteIcon size={13} />Excluir
                </button>
              </div>
            )}

            <div className="min-h-0 flex-1 overflow-auto">
              <div className="min-w-[940px]">
                <div className={`${ROW_GRID} border-b border-[#F1F4F2] px-3 pb-2.5 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]`}>
                  <SelectionCheckbox checked={allSelected} mixed={someSelected} label="Selecionar todos" onChange={() => setSelected(allSelected ? [] : filtered.map(item => item.id))} />
                  <span>Descrição</span>
                  <SortableColumnHeader label="Categoria" sortKey="category" sort={sort} onSort={toggleSort} />
                  <SortableColumnHeader label="Conta" sortKey="account" sort={sort} onSort={toggleSort} />
                  <SortableColumnHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
                  <SortableColumnHeader label="Valor" sortKey="amount" sort={sort} onSort={toggleSort} className="justify-end" />
                  <span />
                </div>

                {transactionsQuery.isLoading && (
                  <div className="flex items-center justify-center gap-3 py-16 text-[12.5px] text-[#718077]">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#12B85C]/20 border-t-[#12B85C]" />Carregando lançamentos...
                  </div>
                )}
                {transactionsQuery.isError && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <strong className="text-[14px] text-[#B3261E]">Não foi possível carregar os lançamentos</strong>
                    <button type="button" onClick={() => transactionsQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button>
                  </div>
                )}
                {!transactionsQuery.isLoading && !transactionsQuery.isError && filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#DFF6EA] text-[#0A7A42]"><DocumentIcon size={23} /></span>
                    <strong className="mt-3 text-[14px]">Nenhum lançamento encontrado</strong>
                    <p className="mt-1 max-w-[360px] text-[12px] leading-relaxed text-[#8A968D]">Ajuste os filtros ou lance o primeiro movimento deste mês.</p>
                  </div>
                )}

                <div className="flex flex-col gap-1 pt-1">
                  {groupedTransactions.flatMap(group => [
                    ...(group.date ? [(
                      <div key={`group-${group.date}`} className="flex items-center gap-2.5 px-3 pb-1 pt-3">
                        <button type="button" onClick={() => setCollapsedDates(current => { const next = new Set(current); if (next.has(group.date!)) next.delete(group.date!); else next.add(group.date!); return next; })} className="text-[11.5px] font-bold uppercase tracking-[.06em] text-[#8A968D] hover:text-[#0B1F14]">
                          {formatDayLabel(group.date)}
                        </button>
                        <span className="h-px flex-1 bg-[#F1F4F2]" />
                        <span className={`text-[12px] font-semibold ${group.total >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(group.total)}</span>
                      </div>
                    )] : []),
                    ...(!group.date || !collapsedDates.has(group.date)
                      ? group.items.map(transaction => (
                        <TransactionGridRow
                          key={transaction.id}
                          transaction={transaction}
                          status={rowStatus(transaction, today)}
                          selected={selected.includes(transaction.id)}
                          showDate={sort !== null}
                          pendingStatus={toggleStatusMutation.isPending}
                          menuOpen={actionOpen === transaction.id}
                          onMenu={() => setActionOpen(actionOpen === transaction.id ? null : transaction.id)}
                          onToggleSelect={() => setSelected(current => current.includes(transaction.id) ? current.filter(id => id !== transaction.id) : [...current, transaction.id])}
                          onToggleStatus={() => markPaid(transaction)}
                          onCategorize={() => { setSelected([transaction.id]); setCategorizeOpen(true); }}
                          onEdit={() => { setEditing(transaction); setModalOpen(true); setActionOpen(null); }}
                          onDuplicate={() => duplicate(transaction)}
                          onDelete={() => remove(transaction)}
                        />
                      ))
                      : []),
                  ])}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-3.5 border-t border-[#F1F4F2] pt-3.5">
              <span className="text-[12.5px] text-[#8A968D]">
                {Math.min(visibleLimit, filtered.length).toLocaleString("pt-BR")} de {filtered.length.toLocaleString("pt-BR")} {filtered.length === 1 ? "lançamento" : "lançamentos"}
              </span>
              {filtered.length > visibleLimit && (
                <button type="button" onClick={() => setVisibleLimit(current => current + PAGE_SIZE)} className="rounded-[10px] border border-[#E3EAE5] px-3.5 py-2 text-[12.5px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">
                  Carregar mais
                </button>
              )}
            </div>
          </section>


          <footer className="sticky bottom-1 z-20 grid grid-cols-2 overflow-hidden rounded-[15px] bg-white shadow-[0_12px_35px_rgba(11,31,20,.12)] ring-1 ring-[#E1E8E3] sm:grid-cols-4"><div className="px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo anterior</span><strong className="mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.previousBalance)}</strong></div><div className="border-l border-[#EDF1EE] px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Entrada</span><strong className="mt-0.5 block text-[11.5px] text-[#0A9650] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.incoming)}</strong></div><div className="border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-l sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saída</span><strong className="mt-0.5 block text-[11.5px] text-[#C13B32] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(-summary.outgoing)}</strong></div><div className="border-l border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo final</span><strong className={`mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px] ${summary.previousBalance + summary.balance >= 0 ? "text-[#0A9650]" : "text-[#C13B32]"}`}>{formatMoney(summary.previousBalance + summary.balance)}</strong></div></footer>
        </section>
      </div>

      {modalOpen && <TransactionModal transaction={editing} defaultDate={defaultDateForMonth(period.year, period.month)} pending={mutationPending} options={organizationOptions} onManageOrganization={() => setLocation("/organizacao")} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveTransaction} />}
      {seriesPrompt && <SeriesScopeDialog action={seriesPrompt.action} transaction={seriesPrompt.transaction} pending={mutationPending || deleteMutation.isPending} onCancel={() => setSeriesPrompt(null)} onConfirm={scope => { if (seriesPrompt.action === "save") void commitSave(seriesPrompt.input, seriesPrompt.transaction, scope); else void commitDelete(seriesPrompt.transaction, scope); }} />}{categorizeOpen && <CategorizeModal selectedCount={selected.length} selectedTypes={selectedTypes} options={organizationOptions} pending={updateManyMutation.isPending} onClose={() => setCategorizeOpen(false)} onSave={categorizeSelected} />}
      {importOpen && <ImportTransactionsModal onClose={() => setImportOpen(false)} onImported={refresh} onManageOrganization={() => setLocation("/organizacao")} />}
    </main>
  );
}
