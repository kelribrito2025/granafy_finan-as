import { Hint } from "@/components/Hint";
import { useAuth } from "@/_core/hooks/useAuth";
import { roundCurrency } from "@shared/currency";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChartIcon,
  ChevronRightIcon,
  ClockIcon,
  CloseIcon,
  DeleteIcon,
  DocumentIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  MenuIcon,
  PlusIcon,
  PrintIcon,
  SearchIcon,
  SidebarMenuIcon,
  UploadIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { GranafyLoader } from "@/components/GranafyLoader";
import { formatDate as formatDateWithPreferences, formatMoney as formatMoneyWithPreferences } from "@/lib/appFormat";
import ImportTransactionsModal from "@/components/ImportTransactionsModal";
import { ModalIcon } from "@/components/ModalIcon";
import { SelectionCheckbox } from "@/components/SelectionCheckbox";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { TransactionModal } from "@/components/TransactionModal";
import type {
  OrganizationOptions,
  SeriesScope,
  Transaction,
  TransactionInput,
  TransactionType,
} from "@/lib/transactionTypes";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { todayIso } from "@/lib/period";
import { monogram, monogramSource, rowStatus, type RowStatus } from "@/lib/transactionRow";
import { buildTransactionDisplayGroups, type TransactionSortKey, type TransactionSortState } from "@/lib/transactionSort";
import { trpc } from "@/lib/trpc";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";



const EMPTY_TRANSACTIONS: Transaction[] = [];

const badgeClass = {
  positive: "bg-[#DFF6EA] text-[#0A7A42]",
  negative: "bg-[#FDECEA] text-[#8E1F16]",
  neutral: "bg-[#F1F4F2] text-[#4C6355]",
};

function formatMoney(value: number) {
  return formatMoneyWithPreferences(value);
}

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
  return formatDateWithPreferences(value);
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

/**
 * `highlight` põe o cartão sobre a superfície aurora — o mesmo destaque do
 * caixa disponível na visão geral. Sobre esse fundo as cores de sinal saem de
 * cena: verde ou vermelho sobre verde escuro não se lê.
 */
/*
 * O mesmo cartão de Pagas e recebidas — medidas, tipos e o selo do ícone.
 *
 * Eram dois desenhos parecidos e diferentes: `p-5` contra `p-6`, sem o selo
 * do ícone, e o resultado é que as duas telas mostravam a mesma fileira de
 * indicadores com 23 px de diferença de altura. Quem vai de uma para a outra
 * vê a página inteira pular.
 *
 * O cartão em destaque continua sem ícone dos dois lados: ele já se distingue
 * pelo fundo.
 */
function KpiCard({ label, value, valueClass, hint, hintClass, note, icon, highlight = false }: {
  label: string;
  value: string;
  valueClass?: string;
  hint: string;
  hintClass?: string;
  /** Linha de rodapé do cartão: o total do mês quando há filtro de pé. */
  note?: string;
  icon?: { node: ReactNode; className: string };
  highlight?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ${icon.className}`}>{icon.node}</span>}
        <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${highlight ? "text-[#8FB39E]" : "text-[#4C6355]"}`}>
          {label}
        </span>
      </div>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${highlight ? "text-white" : valueClass ?? ""}`}>
        {value}
      </strong>
      <span className={`text-[12.5px] ${highlight ? "text-[#7EE2A8]" : hintClass ?? "text-[#4C6355]"}`}>{hint}</span>
      {note && (
        <span className={`text-[11.5px] ${highlight ? "text-[#8FB39E]" : "text-[#8A968D]"}`}>{note}</span>
      )}
    </>
  );

  if (highlight) {
    return (
      <AuroraSurface className="rounded-[20px] p-6">
        <div className="flex flex-1 flex-col gap-2">{content}</div>
      </AuroraSurface>
    );
  }
  return <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">{content}</article>;
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

function TransactionGridRow({ transaction, status, selected, showDate, pendingStatus, onToggleSelect, onToggleStatus, onCategorize, onEdit, onDuplicate, onDelete, menuOpen, onMenu, onCloseMenu }: {
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
  onCloseMenu: () => void;
}) {
  const isTransfer = transaction.type === "transferencia";
  const subtitle = rowSubtitle(transaction, status, showDate);
  // O menu de ações fecha ao clicar fora e no Esc, como os outros popovers.
  const menuAnchor = useRef<HTMLDivElement>(null);
  useDismissOnOutside(menuOpen, menuAnchor, onCloseMenu);
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
  // O par da saída espelha o da entrada: tinta clara com a letra escura por
  // cima. Fundo branco fazia o quadradinho sumir dentro da linha.
  const monogramClass = isTransfer
    ? "bg-[#F1F4F2] text-[#4C6355]"
    : transaction.amount >= 0
      ? "bg-[#DFF6EA] text-[#0A7A42]"
      : "bg-[#FDECEA] text-[#8E1F16]";

  return (
    /*
     * `content-visibility: auto` deixa o navegador pular o desenho da linha
     * enquanto ela está fora da tela. Um mês cheio tem 6.692 linhas, e montar
     * todas de uma vez é o que trava o extrato.
     *
     * O DOM continua inteiro: filtro, KPI, seleção em massa e a exportação do
     * item 2.5 trabalham sobre o array em memória, não sobre o que está
     * desenhado, então nenhum deles enxerga diferença. Ctrl+F do navegador
     * também continua achando texto de linha fora da tela.
     *
     * `contain-intrinsic-size` é obrigatório junto: sem ele a linha não
     * desenhada mede zero, a barra de rolagem encolhe e volta, e a página
     * pula sozinha enquanto se rola. 46px é a altura real desta linha.
     *
     * `menuOpen` desliga a otimização na linha aberta — o menu de ações
     * escapa dos limites dela, e `contain` cortaria o balão.
     */
    <div
      className={`relative ${ROW_GRID} rounded-[14px] px-3 py-2.5 text-[13.5px] transition ${background}`}
      style={menuOpen ? undefined : { contentVisibility: "auto", containIntrinsicSize: "auto 46px" }}
    >
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
      <div ref={menuAnchor} className="relative justify-self-end">
      {/* Sem dica, o "⋮" é o único botão da linha que não se explica: os outros
          têm rótulo ao lado ou cor que os denuncia. */}
      <Hint label="Ações do lançamento" placement="left">
      <button type="button" aria-label={`Ações de ${transaction.description}`} aria-expanded={menuOpen} onClick={onMenu} className="flex h-7 w-7 items-center justify-center rounded-lg text-[#4C6355] hover:bg-white">
        <MenuIcon size={16} />
      </button>
      </Hint>
      {menuOpen && (
        <div className="popover-enter absolute right-0 top-9 z-30 w-[160px] rounded-[15px] bg-white p-1.5 text-left shadow-[0_16px_42px_rgba(11,31,20,.2)] ring-1 ring-[#E1E8E3]">
          <button type="button" onClick={onDuplicate} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><DocumentIcon size={15} />Duplicar</button>
          <button type="button" onClick={onEdit} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium hover:bg-[#F1F4F2]"><EditIcon size={15} />Editar</button>
          <button type="button" onClick={onDelete} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-[12px] font-medium text-[#B3261E] hover:bg-[#FDECEA]"><DeleteIcon size={15} />Excluir</button>
        </div>
      )}
      </div>
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
        <div className="flex items-start gap-3">
        <ModalIcon icon={action === "delete" ? DeleteIcon : DocumentIcon} />
        <div className="min-w-0">
        <h2 id="series-scope-title" className="text-[18px] font-bold tracking-[-.01em]">
          {action === "delete" ? "Excluir lançamento recorrente" : "Salvar lançamento recorrente"}
        </h2>
        <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">
          Este é a parcela {position} de {total}. Escolha o alcance da mudança.
        </p>
        </div>
        </div>
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
          <ModalIcon icon={FilterIcon} />
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
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
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
  const [categorizeOpen, setCategorizeOpen] = useState(false);
  const [sort, setSort] = useState<TransactionSortState>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [actionOpen, setActionOpen] = useState<number | null>(null);
  const fecharMenuDeAcoes = useCallback(() => setActionOpen(null), []);
  const [modalOpen, setModalOpen] = useState(false);
  /*
   * `?importar=extrato` abre a importação já na chegada — o mesmo padrão do
   * `?nova=conta` de Contas e categorias. Quem vem do painel vazio clicou em
   * "Importar extrato"; cair aqui e ter de achar o botão é um clique virando
   * dois. A URL é limpa com `replace` para recarregar não reabrir o modal.
   */
  const [importOpen, setImportOpen] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("importar") === "extrato",
  );
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("importar")) return;
    window.history.replaceState(null, "", "/lancamentos");
  }, []);
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
    await Promise.all([
      utils.transactions.list.invalidate(),
      utils.transactions.dashboard.invalidate(),
      utils.organization.overview.invalidate(),
      utils.payables.invalidate(),
      utils.cashflow.invalidate(),
      utils.dre.invalidate(),
    ]);
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

  /*
   * Os totais do que está na tela.
   *
   * Item 2.6 da auditoria: os cartões somavam o mês inteiro enquanto a lista
   * mostrava o recorte, e o cartão de entradas chegava a misturar os dois —
   * valor do mês em cima da contagem do filtro. Filtrar por "Em aberto" dava
   * "R$ 70.354,58" sobre "3 lançamentos".
   *
   * Transferência fica de fora, como no `summarize` do servidor: mover dinheiro
   * entre contas próprias não é entrada nem saída.
   */
  const filteredSummary = useMemo(() => {
    const caixa = filtered.filter(item => item.type !== "transferencia");
    const incoming = roundCurrency(caixa.reduce((soma, item) => soma + Math.max(0, item.amount), 0));
    const outgoing = roundCurrency(caixa.reduce((soma, item) => soma + Math.abs(Math.min(0, item.amount)), 0));
    return { incoming, outgoing, balance: roundCurrency(incoming - outgoing) };
  }, [filtered]);

  /** Se algum filtro está de pé — muda o nome do CSV e a mensagem de vazio. */
  const filtrosAtivos = Boolean(search.trim())
    || typeFilter !== "todos"
    || statusFilter !== "todos"
    || accountFilter !== "todos"
    || categoryFilter !== "todos";


  const allSelected = filtered.length > 0 && filtered.every(item => selected.includes(item.id));
  const someSelected = !allSelected && filtered.some(item => selected.includes(item.id));
  const selectedTransactions = useMemo(() => transactions.filter(transaction => selected.includes(transaction.id)), [selected, transactions]);
  const selectedTypes = useMemo(() => Array.from(new Set(selectedTransactions.map(transaction => transaction.type))), [selectedTransactions]);
  // O extrato mostra o mês inteiro de uma vez: sem paginação, o que está na tela
  // é sempre o que os totais do rodapé estão somando.
  const groupedTransactions = useMemo(() => buildTransactionDisplayGroups(filtered, sort), [filtered, sort]);
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

  /*
   * O CSV é o que está na tela, não o mês inteiro.
   *
   * Exportava `transactions`, a resposta crua do servidor: quem filtrasse por
   * "Pendente" e exportasse levava também os pagos, sem nada avisando. E como
   * o arquivo vai para o contador, ninguém do outro lado tinha como perceber.
   *
   * Sai de `groupedTransactions` porque é exatamente o que foi desenhado —
   * filtros e ordenação de uma vez, sem repetir a regra num segundo lugar e
   * arriscar que os dois se afastem com o tempo.
   */
  const exportTransactions = () => {
    const linhas = groupedTransactions.flatMap(group => group.items);
    if (linhas.length === 0) {
      return toast.info(
        filtrosAtivos
          ? "Nenhum lançamento corresponde aos filtros. Limpe os filtros para exportar o mês."
          : "Não há lançamentos para exportar neste mês."
      );
    }
    const header = ["Data", "Tipo", "Descrição", "Contato", "Categoria", "Valor", "Conta", "Status", "Recorrente"];
    const rows = linhas.map(item => [item.transactionDate, item.type, item.description, item.contact, item.category, item.amount.toFixed(2), item.account, item.status, item.recurring ? "Sim" : "Não"]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    // O nome avisa que é recorte. Um arquivo chamado "lancamentos-2026-09"
    // com metade do mês dentro é o tipo de coisa que só aparece na conciliação
    // do contador, semanas depois.
    const sufixo = filtrosAtivos ? "-filtrado" : "";
    anchor.download = `lancamentos-${period.year}-${String(period.month).padStart(2, "0")}${sufixo}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={
            <SidebarStatCard
              tone={summary.balance < 0 ? "negative" : "positive"}
              kicker={`Resultado de ${monthLabel.split(" ")[0]}`}
              value={`${summary.balance < 0 ? "−" : "+"} ${formatMoney(Math.abs(summary.balance))}`}
              hint={`${filtered.length.toLocaleString("pt-BR")} ${filtered.length === 1 ? "lançamento" : "lançamentos"}`}
            />
          }
        />
        <section className="flex min-w-0 flex-1 flex-col gap-4 pb-1">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={DocumentIcon} />
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
                <Hint label="Exportar CSV"><button type="button" aria-label="Exportar lançamentos" onClick={exportTransactions} className={toolButton}><DownloadIcon size={17} /></button></Hint>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={8} className="rounded-lg bg-[#0B1F14] px-2.5 py-1.5 text-[11px] font-semibold text-white">Exportar CSV</TooltipContent>
            </Tooltip>
            <Hint label="Imprimir" className="hidden sm:inline-flex"><button type="button" aria-label="Imprimir lançamentos" onClick={() => window.print()} className={toolButton}><PrintIcon size={17} /></button></Hint>
            <button type="button" onClick={() => { setEditing(null); setModalOpen(true); }} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[.98] sm:px-4"><PlusIcon size={15} /><span className="hidden sm:inline">Novo lançamento</span><span className="sm:hidden">Novo</span></button>
            <ProfileMenu />
          </header>

          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {/* Valor e contagem saem os dois do recorte: era aqui que a tela
                misturava o total do mês com a contagem do filtro. Com filtro de
                pé, o total do mês vira a linha de baixo, para não sumir. */}
            <KpiCard
              highlight
              label="Entradas do período"
              value={formatMoney(filteredSummary.incoming)}
              valueClass="text-[#0A7A42]"
              hint={`${counts.incoming.toLocaleString("pt-BR")} ${counts.incoming === 1 ? "lançamento" : "lançamentos"}`}
              note={filtrosAtivos ? `mês inteiro: ${formatMoney(summary.incoming)}` : undefined}
            />
            <KpiCard
              label="Saídas do período"
              value={formatMoney(filteredSummary.outgoing)}
              valueClass="text-[#B3261E]"
              icon={{ node: <ArrowDownIcon size={15} />, className: "bg-[#FDECEA] text-[#B3261E]" }}
              hint={`${counts.outgoing.toLocaleString("pt-BR")} ${counts.outgoing === 1 ? "lançamento" : "lançamentos"}`}
              note={filtrosAtivos ? `mês inteiro: ${formatMoney(summary.outgoing)}` : undefined}
            />
            <KpiCard
              label="Resultado"
              value={formatMoney(filteredSummary.balance)}
              icon={{ node: <ChartIcon size={15} />, className: "bg-[#F1F4F2] text-[#4C6355]" }}
              hint={filteredSummary.incoming > 0 ? `margem ${formatPercent((filteredSummary.balance / filteredSummary.incoming) * 100)}` : "sem entradas no período"}
              hintClass={filteredSummary.balance >= 0 ? "font-semibold text-[#0A7A42]" : "font-semibold text-[#B3261E]"}
              note={filtrosAtivos ? `mês inteiro: ${formatMoney(summary.balance)}` : undefined}
            />
            <KpiCard
              label="Pendentes"
              value={counts.pending.toLocaleString("pt-BR")}
              icon={{ node: <ClockIcon size={15} />, className: "bg-[#F1F4F2] text-[#4C6355]" }}
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
                <SelectionCheckbox checked mixed tone="onDark" label="Limpar seleção" onChange={() => setSelected([])} />
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

                {/* `min-h` para os três estados caírem no meio do cartão: sem
                    ela eles ficam colados no cabeçalho da tabela, com a área
                    toda vazia embaixo. */}
                {transactionsQuery.isLoading && (
                  <div className="flex min-h-[420px] items-center justify-center">
                    <GranafyLoader label="Carregando lançamentos..." />
                  </div>
                )}
                {transactionsQuery.isError && (
                  <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
                    <strong className="text-[14px] text-[#B3261E]">Não foi possível carregar os lançamentos</strong>
                    <button type="button" onClick={() => transactionsQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button>
                  </div>
                )}
                {!transactionsQuery.isLoading && !transactionsQuery.isError && filtered.length === 0 && (
                  <div className="flex min-h-[420px] flex-col items-center justify-center text-center">
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
                          onCloseMenu={fecharMenuDeAcoes}
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
                {filtered.length.toLocaleString("pt-BR")} {filtered.length === 1 ? "lançamento" : "lançamentos"}
                {filtered.length !== transactions.length && ` de ${transactions.length.toLocaleString("pt-BR")} no mês`}
              </span>
            </div>
          </section>


          <div className="sticky bottom-1 z-20 flex flex-col gap-1">
            {/*
              O rodapé é a posição da conta, não o subtotal do recorte.
              "Saldo anterior" é o que a conta tinha antes do mês e "saldo final"
              é onde ela fecha. Recalcular os dois com o filtro daria
              "posição real + subtotal de um pedaço" — número que não é o saldo
              da conta nem o total do filtro, numa tela que vai para o contador.
              Com filtro de pé, o rótulo diz de que ele está falando.
            */}
            {filtrosAtivos && (
              <span className="self-center rounded-full bg-[#FFF3E6] px-3 py-1 text-[10.5px] font-semibold text-[#8A4B00]">
                Posição da conta no mês inteiro — o filtro não altera estes valores
              </span>
            )}
            <footer className="grid grid-cols-2 overflow-hidden rounded-[15px] bg-white shadow-[0_12px_35px_rgba(11,31,20,.12)] ring-1 ring-[#E1E8E3] sm:grid-cols-4"><div className="px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo anterior</span><strong className="mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.previousBalance)}</strong></div><div className="border-l border-[#EDF1EE] px-3 py-3 text-center sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Entrada</span><strong className="mt-0.5 block text-[11.5px] text-[#0A9650] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(summary.incoming)}</strong></div><div className="border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-l sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saída</span><strong className="mt-0.5 block text-[11.5px] text-[#C13B32] sm:ml-2 sm:inline sm:text-[12.5px]">{formatMoney(-summary.outgoing)}</strong></div><div className="border-l border-t border-[#EDF1EE] px-3 py-3 text-center sm:border-t-0 sm:px-4"><span className="block text-[9.5px] text-[#8A968D] sm:inline sm:text-[10.5px]">Saldo final</span><strong className={`mt-0.5 block text-[11.5px] sm:ml-2 sm:inline sm:text-[12.5px] ${summary.previousBalance + summary.balance >= 0 ? "text-[#0A9650]" : "text-[#C13B32]"}`}>{formatMoney(summary.previousBalance + summary.balance)}</strong></div></footer>
          </div>
        </section>
      </div>

      {modalOpen && <TransactionModal transaction={editing} defaultDate={defaultDateForMonth(period.year, period.month)} pending={mutationPending} options={organizationOptions} onManageOrganization={() => setLocation("/organizacao")} onClose={() => { setModalOpen(false); setEditing(null); }} onSave={saveTransaction} />}
      {seriesPrompt && <SeriesScopeDialog action={seriesPrompt.action} transaction={seriesPrompt.transaction} pending={mutationPending || deleteMutation.isPending} onCancel={() => setSeriesPrompt(null)} onConfirm={scope => { if (seriesPrompt.action === "save") void commitSave(seriesPrompt.input, seriesPrompt.transaction, scope); else void commitDelete(seriesPrompt.transaction, scope); }} />}{categorizeOpen && <CategorizeModal selectedCount={selected.length} selectedTypes={selectedTypes} options={organizationOptions} pending={updateManyMutation.isPending} onClose={() => setCategorizeOpen(false)} onSave={categorizeSelected} />}
      {importOpen && <ImportTransactionsModal onClose={() => setImportOpen(false)} onImported={refresh} onManageOrganization={() => setLocation("/organizacao")} />}
    </main>
  );
}
