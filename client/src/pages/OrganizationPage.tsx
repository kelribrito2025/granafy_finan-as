import { CartaoVazio } from "@/components/CartaoVazio";
import { Hint } from "@/components/Hint";
import { useAuth } from "@/_core/hooks/useAuth";
import { AppSidebar } from "@/components/AppSidebar";
// O design system Voltura, com escopo nesta tela (ver DESIGN.md na raiz).
import "@/styles/voltura.css";
import {
  ArchiveIcon,
  ChartIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DeleteIcon,
  DocumentIcon,
  EditIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SidebarMenuIcon,
  UploadIcon,
  WalletIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { ModalDeConfirmacao } from "@/components/ModalDeConfirmacao";
import { ModalIcon } from "@/components/ModalIcon";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { CartaoSkeleton, ChartSkeleton, TableSkeleton } from "@/components/PageSkeleton";
import { buildCategoryTree, type CategoryNode, type FlatCategory } from "@/lib/categoryTree";
import { BANK_PRESETS, BankMark, type BankPresetId } from "@/lib/bancos";
import { RULE_MATCH_LABELS, RULE_MATCH_TYPES, type RuleMatchType } from "@shared/categoryRules";
import { formatMoney as formatMoneyWithPreferences } from "@/lib/appFormat";
import { ProfileMenu } from "@/components/ProfileMenu";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { useSemContas } from "@/hooks/useSemContas";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { todayIso } from "@/lib/period";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";

type Account = {
  id: number;
  name: string;
  institution: string;
  accountType: "corrente" | "poupanca" | "carteira" | "cartao" | "gateway" | "outro";
  color: string;
  initialBalance: number;
  /** A data a que o saldo inicial se refere. Nula: tudo soma, como antes da coluna. */
  initialBalanceDate: string | null;
  balance: number;
  transactionCount: number;
  monthTransactionCount: number;
  lastImportedAt: Date | string | null;
  importFormat: string;
  importBatchCount: number;
  isActive: boolean;
};

type CategoryRuleView = {
  id: number;
  matchType: RuleMatchType;
  matchValue: string;
  categoryId: number | null;
  category: string;
  costCenterId: number | null;
  costCenter: string;
  priority: number;
  autoReconcile: boolean;
  isActive: boolean;
};
type Category = {
  id: number;
  name: string;
  type: "entrada" | "saida" | "ambos";
  color: string;
  transactionCount: number;
  total: number;
  isActive: boolean;
};
type CostCenter = {
  id: number;
  name: string;
  color: string;
  transactionCount: number;
  total: number;
  isActive: boolean;
};

/** Colunas da tabela de contas, no cabeçalho e nas linhas. */
const ACCOUNT_GRID = "grid grid-cols-[minmax(0,1fr)_120px_150px_116px_140px_112px] gap-3";

function formatPercent(value: number) {
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value)}%`;
}

/** Tons da barra de distribuição, do maior saldo para o menor. */
const DISTRIBUTION_TONES = ["#12B85C", "#7EE2A8", "#1F3D2B", "#4C6355", "#8FB39E"];

function formatMoney(value: number) {
  return formatMoneyWithPreferences(value);
}

/**
 * A "sincronização" da conta. Não há conexão bancária: o que existe é o
 * histórico real de importação de arquivo, então o selo diz isso em vez de
 * prometer integração.
 */
function SyncBadge({ account }: { account: Account }) {
  if (!account.lastImportedAt) {
    return (
      <span className="flex items-center gap-2 text-[12.5px] text-[#8A968D]">
        <span className="h-2 w-2 rounded-full bg-[#C9D5CD]" />Manual
      </span>
    );
  }
  const when = new Date(account.lastImportedAt);
  const label = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(when);
  return (
    <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#0A7A42]" title={`${account.importBatchCount} importação(ões)`}>
      <span className="h-2 w-2 rounded-full bg-[#12B85C]" />
      {account.importFormat ? account.importFormat.toUpperCase() : "Arquivo"} · {label}
    </span>
  );
}

function CategoryRow({ node, depth, share, onEdit, onAddChild }: {
  node: CategoryNode;
  depth: number;
  share: number;
  onEdit: (category: Category) => void;
  /** "+ Subcategoria" na linha de raiz: abre o modal com esta como mãe. */
  onAddChild: (parentPath: string) => void;
}) {
  const podeEscrever = !useSomenteLeitura();
  const hasChildren = node.children.length > 0;
  return (
    <>
      <div
        className="flex items-center gap-3 border-t border-[#F1F4F2] py-2.5 transition hover:bg-[#F8FAF9]"
        style={{ paddingLeft: depth * 19 }}
      >
        {hasChildren
          ? <ChevronRightIcon size={14} className="shrink-0 rotate-90 text-[#8A968D]" />
          : <span className="w-[14px] shrink-0" />}
        <span className={`min-w-0 flex-1 truncate ${depth === 0 ? "text-[14px] font-semibold" : "text-[13px] text-[#4C6355]"}`}>
          {node.label}
          {!node.category && <span className="ml-2 text-[10.5px] uppercase tracking-[.06em] text-[#B3BFB7]">agrupamento</span>}
        </span>
        <span className="shrink-0 text-[12px] text-[#8A968D]">{node.subtotalCount}</span>
        {depth === 0 && (
          <span className="hidden h-1.5 w-[96px] shrink-0 overflow-hidden rounded-full bg-[#EDF2EE] sm:block">
            <span className="block h-full rounded-full bg-[#12B85C]" style={{ width: `${share}%` }} />
          </span>
        )}
        <span className={`w-[120px] shrink-0 text-right ${depth === 0 ? "text-[14px] font-bold" : "text-[13px] font-semibold"}`}>
          {formatMoney(node.subtotal)}
        </span>
        {podeEscrever && depth === 0 && (
        <Hint label="Nova subcategoria" placement="left" className="shrink-0">
          <button
            type="button"
            aria-label={`Nova subcategoria em ${node.label}`}
            onClick={() => onAddChild(node.path)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#B3BFB7] hover:bg-[#F1FBF6] hover:text-[#0A7A42]"
          >
            <PlusIcon size={13} />
          </button>
        </Hint>
        )}
        {podeEscrever && (
        <Hint label="Editar categoria" placement="left" className="shrink-0">
          <button
            type="button"
            disabled={!node.category}
            aria-label={`Editar ${node.label}`}
            onClick={() => node.category && onEdit(node.category as Category)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#B3BFB7] hover:bg-[#F1F4F2] disabled:invisible"
          >
            <EditIcon size={13} />
          </button>
        </Hint>
        )}
      </div>
      {node.children.map(child => (
        <CategoryRow key={child.path} node={child} depth={depth + 1} share={0} onEdit={onEdit} onAddChild={onAddChild} />
      ))}
    </>
  );
}

function CategoryGroupCard({ title, tone, nodes, total, onEdit, onAddChild }: {
  title: string;
  tone: "positive" | "negative";
  nodes: CategoryNode[];
  total: number;
  onEdit: (category: Category) => void;
  onAddChild: (parentPath: string) => void;
}) {
  const biggest = Math.max(1, ...nodes.map(node => Math.abs(node.subtotal)));
  return (
    <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:px-6">
      <div className="flex items-center gap-3 pb-1.5">
        <span className={`h-2.5 w-2.5 rounded-[3px] ${tone === "positive" ? "bg-[#12B85C]" : "bg-[#E5533D]"}`} />
        <h2 className="text-[15px] font-bold">{title}</h2>
        <span className="text-[12.5px] text-[#8A968D]">{nodes.length} {nodes.length === 1 ? "grupo" : "grupos"}</span>
        <span className={`ml-auto text-[15px] font-bold ${tone === "positive" ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
          {formatMoney(total)}
        </span>
      </div>
      {nodes.length === 0 ? (
        <p className="border-t border-[#F1F4F2] pt-3 text-[12px] leading-relaxed text-[#8A968D]">
          Nenhuma categoria de {title.toLowerCase()} cadastrada.
        </p>
      ) : (
        nodes.map(node => (
          <CategoryRow
            key={node.path}
            node={node}
            depth={0}
            share={(Math.abs(node.subtotal) / biggest) * 100}
            onEdit={onEdit}
            onAddChild={onAddChild}
          />
        ))
      )}
    </article>
  );
}

function AccountModal({ account, tipoInicial, pending, onClose, onSave }: { account?: Account | null; /** O tipo já escolhido por quem abriu — os cartões do estado vazio. */ tipoInicial?: Account["accountType"]; pending: boolean; onClose: () => void; onSave: (values: { name: string; institution: string; accountType: Account["accountType"]; color: string; initialBalance: number; initialBalanceDate: string | null }) => Promise<void> }) {
  const matchedPreset = BANK_PRESETS.find(item => item.name.toLowerCase() === account?.institution.toLowerCase());
  const [institutionChoice, setInstitutionChoice] = useState<BankPresetId>(matchedPreset?.id ?? "outro");
  const [name, setName] = useState(account?.name ?? "");
  const [institution, setInstitution] = useState(account?.institution ?? "");
  const [accountType, setAccountType] = useState<Account["accountType"]>(account?.accountType ?? tipoInicial ?? "corrente");
  const [color, setColor] = useState(account?.color ?? "#12B85C");
  const [initialBalance, setInitialBalance] = useState(account ? formatCurrencyValue(account.initialBalance) : "0,00");
  /*
   * Conta nova nasce com a data de hoje: a pessoa digita o saldo que o banco
   * mostra agora, e os lançamentos até hoje não somam de novo. Conta antiga
   * mostra a data que tem — ou vazio, que é "tudo soma", o comportamento de
   * antes da coluna existir.
   */
  const [initialBalanceDate, setInitialBalanceDate] = useState(account ? (account.initialBalanceDate ?? "") : todayIso());
  const [errorMessage, setErrorMessage] = useState("");

  const selectPreset = (preset: (typeof BANK_PRESETS)[number]) => {
    const shouldReplaceName = !name.trim() || name === institution;
    setInstitutionChoice(preset.id);
    setInstitution(preset.name);
    setErrorMessage("");
    if (shouldReplaceName) setName(preset.name);
    if (!account) setColor(preset.color);
  };

  const selectOther = () => {
    const shouldClearName = !account && name === institution;
    setInstitutionChoice("outro");
    setErrorMessage("");
    if (BANK_PRESETS.some(item => item.name === institution)) setInstitution("");
    if (shouldClearName) setName("");
    if (!account) setColor("#12B85C");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = currencyInputToNumber(initialBalance);
    if (!Number.isFinite(parsed)) return toast.error("Informe um saldo inicial válido");
    if (!institution.trim()) return toast.error("Selecione ou informe a instituição");
    setErrorMessage("");
    try {
      await onSave({ name: name.trim(), institution: institution.trim(), accountType, color, initialBalance: parsed, initialBalanceDate: initialBalanceDate || null });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Não foi possível salvar a conta");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="account-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form onSubmit={submit} className="modal-enter max-h-[calc(100vh-32px)] w-full max-w-[520px] overflow-y-auto rounded-[22px] bg-white p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <ModalIcon icon={WalletIcon} />
          <div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Conta financeira</p><h2 id="account-modal-title" className="mt-1 text-xl font-bold">{account ? "Editar conta" : "Nova conta"}</h2><p className="mt-1 text-xs text-[#8A968D]">Escolha a instituição ou cadastre outro banco.</p></div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <div className="mt-5">
          <span className="mb-2 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Instituição</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BANK_PRESETS.map(preset => {
              const selected = institutionChoice === preset.id;
              return <button key={preset.id} type="button" aria-pressed={selected} onClick={() => selectPreset(preset)} className={`flex min-h-[70px] flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center ring-1 transition active:scale-[.98] ${selected ? "bg-[#F1FBF6] text-[#0A7A42] ring-2 ring-[#12B85C]" : "bg-[#F8FAF9] text-[#4C6355] ring-[#E1E8E3] hover:bg-[#F1F4F2]"}`}><BankMark institution={preset.name} color={preset.color} size="compact" /><strong className="mt-1.5 text-[10.5px] leading-tight">{preset.name}</strong></button>;
            })}
            <button type="button" aria-pressed={institutionChoice === "outro"} onClick={selectOther} className={`flex min-h-[70px] flex-col items-center justify-center rounded-xl px-2 py-2.5 text-center ring-1 transition active:scale-[.98] ${institutionChoice === "outro" ? "bg-[#F1FBF6] text-[#0A7A42] ring-2 ring-[#12B85C]" : "bg-[#F8FAF9] text-[#4C6355] ring-[#E1E8E3] hover:bg-[#F1F4F2]"}`}><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#DDE5E0] text-[15px] font-bold text-[#4C6355]">+</span><strong className="mt-1.5 text-[10.5px] leading-tight">Outro</strong></button>
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {institutionChoice === "outro" && <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome da instituição</span><input autoFocus required value={institution} onChange={event => setInstitution(event.target.value)} placeholder="Digite o banco ou instituição" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label>}
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome da conta</span><input autoFocus={institutionChoice !== "outro"} required value={name} onChange={event => { setName(event.target.value); setErrorMessage(""); }} placeholder="Ex.: Efi principal" className={`h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 focus:ring-2 ${errorMessage ? "ring-[#E8A39D] focus:ring-[#B3261E]" : "ring-[#E1E8E3] focus:ring-[#12B85C]"}`} /></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Tipo</span><select value={accountType} onChange={event => setAccountType(event.target.value as Account["accountType"])} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]"><option value="corrente">Conta corrente</option><option value="poupanca">Poupança</option><option value="carteira">Carteira</option><option value="cartao">Cartão</option><option value="gateway">Gateway</option><option value="outro">Outro</option></select></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Saldo inicial</span><input value={initialBalance} onFocus={event => event.currentTarget.select()} onChange={event => setInitialBalance(formatCurrencyInput(event.target.value))} inputMode="decimal" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" /></label>
          <label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Saldo em</span><input type="date" value={initialBalanceDate} onChange={event => setInitialBalanceDate(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3]" /></label>
          <p className="text-[11px] leading-relaxed text-[#8A968D] sm:col-span-2">O saldo inicial é o saldo <strong className="font-semibold text-[#4C6355]">nessa data</strong>. Lançamentos até ela não somam de novo — já estão dentro do valor. Sem data, tudo soma.</p>
          <label className="sm:col-span-2"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor de identificação</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor da conta" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label>
        </div>

        {errorMessage && <p role="alert" className="mt-4 rounded-xl bg-[#FDECEA] px-3.5 py-3 text-[11.5px] font-semibold text-[#8E1F16]">{errorMessage}</p>}
        <div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar conta"}</button></div>
      </form>
    </div>
  );
}

/*
 * A hierarquia mora no nome, com "/": "Custos Operacionais/Insumos". O modal
 * esconde isso — a pessoa escolhe a categoria-mãe numa lista e digita só o
 * nome da filha; o caminho completo é montado na hora de salvar. Um nível só:
 * a lista de mães oferece apenas categorias principais.
 */
function CategoryModal({ category, categorias, maeInicial = null, pending, onClose, onSave }: {
  category?: Category | null;
  categorias: readonly Category[];
  /** Caminho da mãe pré-escolhida, quando aberto pelo "+ Subcategoria" de um grupo. */
  maeInicial?: string | null;
  pending: boolean;
  onClose: () => void;
  onSave: (values: { name: string; type: Category["type"]; color: string }) => Promise<void>;
}) {
  const partes = (category?.name ?? "").split("/");
  const [mae, setMae] = useState(category ? partes.slice(0, -1).join("/") : (maeInicial ?? ""));
  const [name, setName] = useState(category ? partes[partes.length - 1]!.trim() : "");
  const [type, setType] = useState<Category["type"]>(category?.type ?? categorias.find(c => c.name === maeInicial)?.type ?? "ambos");
  const [color, setColor] = useState(category?.color ?? categorias.find(c => c.name === maeInicial)?.color ?? "#4C6355");

  /* Só principais viram mãe; a mãe atual entra mesmo se for só agrupamento sem cadastro. */
  const maes = [...new Set([
    ...categorias.filter(c => c.isActive && !c.name.includes("/") && c.id !== category?.id).map(c => c.name),
    ...(mae ? [mae] : []),
  ])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  /* Uma principal com filhas não pode virar filha: as filhas perderiam a mãe pelo nome. */
  const temFilhas = category ? categorias.some(c => c.name.startsWith(`${category.name}/`)) : false;
  const nomeInvalido = name.includes("/");

  const escolherMae = (valor: string) => {
    setMae(valor);
    const escolhida = categorias.find(c => c.name === valor);
    if (escolhida && !category) { setType(escolhida.type); setColor(escolhida.color); }
  };
  const salvar = () => onSave({ name: mae ? `${mae}/${name.trim()}` : name.trim(), type, color });
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}><form onSubmit={async event => { event.preventDefault(); if (nomeInvalido) return; await salvar(); }} className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-5 sm:p-6"><div className="flex items-start gap-3"><ModalIcon icon={FilterIcon} /><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Classificação</p><h2 className="mt-1 text-xl font-bold">{category ? "Editar categoria" : mae ? "Nova subcategoria" : "Nova categoria"}</h2><p className="mt-1 text-xs text-[#8A968D]">{mae ? `Dentro de ${mae}.` : "Crie grupos para relatórios e importações."}</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button></div><div className="mt-5 space-y-4"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Dentro de</span><select value={mae} disabled={temFilhas} onChange={event => escolherMae(event.target.value)} className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C] disabled:opacity-60"><option value="">Nenhuma (categoria principal)</option>{maes.map(item => <option key={item} value={item}>{item}</option>)}</select>{temFilhas && <span className="mt-1 block text-[11px] text-[#8A968D]">Esta categoria tem subcategorias e precisa continuar principal.</span>}</label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome</span><input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder={mae ? "Ex.: Insumos" : "Ex.: Custos de plataforma"} className={`h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 focus:ring-2 ${nomeInvalido ? "ring-[#E5533D] focus:ring-[#E5533D]" : "ring-[#E1E8E3] focus:ring-[#12B85C]"}`} />{nomeInvalido && <span className="mt-1 block text-[11px] text-[#B3261E]">Sem barra no nome: para criar uma subcategoria, escolha a mãe em “Dentro de”.</span>}</label><div><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Aplica-se a</span><div className="grid grid-cols-3 rounded-xl bg-[#F1F4F2] p-1">{(["entrada", "saida", "ambos"] as const).map(value => <button key={value} type="button" onClick={() => setType(value)} className={`rounded-[9px] px-2 py-2 text-[11.5px] font-bold capitalize ${type === value ? "bg-white text-[#0A7A42]" : "text-[#718077]"}`}>{value === "ambos" ? "Ambos" : value}</button>)}</div></div><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor da categoria" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label></div><div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending || nomeInvalido} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : mae ? "Salvar subcategoria" : "Salvar categoria"}</button></div></form></div>;
}

function CostCenterModal({ costCenter, pending, onClose, onSave }: { costCenter?: CostCenter | null; pending: boolean; onClose: () => void; onSave: (values: { name: string; color: string }) => Promise<void> }) {
  const [name, setName] = useState(costCenter?.name ?? "");
  const [color, setColor] = useState(costCenter?.color ?? "#4C6355");
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}><form onSubmit={async event => { event.preventDefault(); await onSave({ name, color }); }} className="modal-enter w-full max-w-[440px] rounded-[22px] bg-white p-5 sm:p-6"><div className="flex items-start gap-3"><ModalIcon icon={ChartIcon} /><div><p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Rateio</p><h2 className="mt-1 text-xl font-bold">{costCenter ? "Editar centro de custo" : "Novo centro de custo"}</h2><p className="mt-1 text-xs text-[#8A968D]">Separe os lançamentos por área, projeto ou unidade.</p></div><button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button></div><div className="mt-5 space-y-4"><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Nome</span><input autoFocus required minLength={2} maxLength={120} value={name} onChange={event => setName(event.target.value)} placeholder="Ex.: Comercial" className="h-11 w-full rounded-xl bg-[#F8FAF9] px-3.5 text-[13px] outline-none ring-1 ring-[#E1E8E3] focus:ring-2 focus:ring-[#12B85C]" /></label><label><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Cor</span><div className="flex h-11 items-center gap-3 rounded-xl bg-[#F8FAF9] px-3 ring-1 ring-[#E1E8E3]"><input aria-label="Cor do centro de custo" type="color" value={color} onChange={event => setColor(event.target.value)} className="h-7 w-8 cursor-pointer border-0 bg-transparent" /><span className="text-[12px] font-semibold uppercase text-[#718077]">{color}</span></div></label></div><div className="mt-6 flex gap-2.5"><button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button><button disabled={pending} type="submit" className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar centro de custo"}</button></div></form></div>;
}

function RuleModal({ categories, costCenters, pending, onClose, onSave }: {
  categories: Category[];
  costCenters: CostCenter[];
  pending: boolean;
  onClose: () => void;
  onSave: (values: { matchType: RuleMatchType; matchValue: string; categoryId: number | null; costCenterId: number | null; priority: number; autoReconcile: boolean }) => Promise<void>;
}) {
  const [matchType, setMatchType] = useState<RuleMatchType>("descricao");
  const [matchValue, setMatchValue] = useState("");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [costCenterId, setCostCenterId] = useState<number | null>(null);
  const [autoReconcile, setAutoReconcile] = useState(false);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="rule-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form
        onSubmit={async event => {
          event.preventDefault();
          if (!categoryId && !costCenterId) return toast.info("Escolha uma categoria ou um centro de custo.");
          await onSave({ matchType, matchValue: matchValue.trim(), categoryId, costCenterId, priority: 0, autoReconcile });
        }}
        className="modal-enter w-full max-w-[460px] rounded-[22px] bg-white p-6 text-[#0B1F14]"
      >
        <div className="flex items-start gap-3">
          <ModalIcon icon={FilterIcon} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Classificação automática</p>
            <h2 id="rule-modal-title" className="mt-1 text-xl font-bold">Nova regra</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#8A968D]">
              Aplicada ao importar OFX ou CSV. Você vê o resultado na prévia antes de gravar.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <div className="mt-5 space-y-4">
          <div className="flex gap-3">
            <label className="min-w-0 flex-1">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Quando</span>
              <select value={matchType} onChange={event => setMatchType(event.target.value as RuleMatchType)} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]">
                {RULE_MATCH_TYPES.map(value => <option key={value} value={value}>{RULE_MATCH_LABELS[value]}</option>)}
              </select>
            </label>
            <label className="min-w-0 flex-[1.4]">
              <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Texto</span>
              <input autoFocus required minLength={2} maxLength={180} value={matchValue} onChange={event => setMatchValue(event.target.value)} placeholder="Ex.: Twilio" className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Classificar como</span>
            <select value={categoryId ?? ""} onChange={event => setCategoryId(Number(event.target.value) || null)} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]">
              <option value="">Não alterar a categoria</option>
              {categories.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Centro de custo</span>
            <select value={costCenterId ?? ""} onChange={event => setCostCenterId(Number(event.target.value) || null)} className="h-11 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 text-[13px] outline-none focus:border-[#12B85C]">
              <option value="">Não alterar o centro de custo</option>
              {costCenters.filter(item => item.isActive).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={autoReconcile}
            onClick={() => setAutoReconcile(value => !value)}
            className="flex items-center gap-3 rounded-xl border border-[#E3EAE5] px-3.5 py-3 text-left transition hover:bg-[#F8FAF9]"
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-[12.5px] font-semibold">
                {autoReconcile ? "Concilia sozinha" : "Só sugere"}
              </span>
              <span className="text-[11px] leading-relaxed text-[#4C6355]">
                {autoReconcile
                  ? "na conciliação, o que esta regra explicar entra sem conferência item a item"
                  : "na conciliação, a regra explica a sugestão e você confirma"}
              </span>
            </span>
            <span className={`flex h-[26px] w-11 shrink-0 items-center rounded-full p-[3px] transition ${autoReconcile ? "justify-end bg-[#12B85C]" : "justify-start bg-[#D8E2DB]"}`}>
              <span className="h-5 w-5 rounded-full bg-white" />
            </span>
          </button>
          <p className="rounded-xl bg-[#F1FBF6] px-3.5 py-3 text-[11px] leading-relaxed text-[#4C6355]">
            A regra só troca a categoria se ela for compatível com o tipo do lançamento. Uma categoria de entrada nunca é aplicada a uma saída.
          </p>
        </div>

        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button>
          <button type="submit" disabled={pending} className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Salvando..." : "Criar regra"}</button>
        </div>
      </form>
    </div>
  );
}

function ImportPlanModal({ pending, onClose, onSave }: {
  pending: boolean;
  onClose: () => void;
  onSave: (content: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setContent(await file.text());
    } catch {
      toast.error("Não foi possível ler o arquivo");
    }
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="plan-modal-title" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <form
        onSubmit={async event => { event.preventDefault(); await onSave(content); }}
        className="modal-enter w-full max-w-[520px] rounded-[22px] bg-white p-6 text-[#0B1F14]"
      >
        <div className="flex items-start gap-3">
          <ModalIcon icon={UploadIcon} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#12B85C]">Cadastro em lote</p>
            <h2 id="plan-modal-title" className="mt-1 text-xl font-bold">Importar plano de contas</h2>
            <p className="mt-1 text-[12px] leading-relaxed text-[#8A968D]">
              Uma categoria por linha, no formato <b>Caminho;tipo</b>. O caminho usa “/” para a hierarquia e o tipo aceita entrada, saída ou ambos.
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose} className="ml-auto rounded-xl bg-[#F1F4F2] p-2 text-[#4C6355]"><CloseIcon size={17} /></button>
        </div>

        <label className="mt-5 flex h-[46px] cursor-pointer items-center gap-2.5 rounded-xl border border-dashed border-[#C9D5CD] px-3.5 hover:bg-[#F8FAF9]">
          <UploadIcon size={15} />
          <span className="text-[13px] font-semibold text-[#0A7A42]">Escolher arquivo CSV ou TXT</span>
          <input type="file" accept=".csv,.txt" onChange={event => { void readFile(event.target.files?.[0]); event.target.value = ""; }} className="hidden" />
        </label>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Ou cole aqui</span>
          <textarea
            value={content}
            onChange={event => setContent(event.target.value)}
            placeholder={"Receitas Operacionais/Prestação de Serviços;entrada\nDespesas Fixas/Aluguel;saida"}
            className="min-h-[150px] w-full resize-y rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 py-3 font-mono text-[12px] outline-none focus:border-[#12B85C]"
          />
        </label>
        <p className="mt-2 text-[11px] leading-relaxed text-[#8A968D]">
          Categorias que já existem são puladas — importar o mesmo arquivo duas vezes não duplica o cadastro.
        </p>

        <div className="mt-6 flex gap-2.5">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-[#F1F4F2] px-4 py-3 text-[13px] font-bold text-[#4C6355]">Cancelar</button>
          <button type="submit" disabled={pending || content.trim().length === 0} className="flex-1 rounded-xl bg-[#12B85C] px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50">{pending ? "Importando..." : "Importar"}</button>
        </div>
      </form>
    </div>
  );
}

/*
 * A tela de contas de quem ainda não tem nenhuma.
 *
 * A lista vazia com o cabeçalho de colunas dizia "nenhuma conta ativa" como
 * se fosse um filtro. Sem conta nenhuma — nem arquivada — o que a pessoa
 * precisa é entender o que é uma conta aqui e cadastrar a primeira, já pelo
 * tipo certo: os quatro cartões abrem o modal com o tipo escolhido. O cartão
 * do saldo consolidado não entra: saldo é coisa de quem tem conta.
 */
const TIPOS_DE_CONTA: Array<{ tipo: Account["accountType"]; titulo: string; texto: string; icone: ReactNode }> = [
  { tipo: "corrente", titulo: "Conta corrente", texto: "Banco, agência e saldo inicial", icone: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></> },
  { tipo: "cartao", titulo: "Cartão de crédito", texto: "A fatura entra como dívida no saldo", icone: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></> },
  { tipo: "carteira", titulo: "Caixa", texto: "Dinheiro em espécie, saldo inicial", icone: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></> },
  { tipo: "gateway", titulo: "Adquirente ou gateway", texto: "Maquininha, Pix ou meio de pagamento", icone: <><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" /></> },
];

function ContasVazias({ onCadastrar }: { onCadastrar: (tipo?: Account["accountType"]) => void }) {
  const traco = (conteudo: ReactNode, tamanho = 20) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{conteudo}</svg>
  );
  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-7 rounded-[20px] bg-white px-6 py-14 text-center ring-1 ring-[#E1E8E3] sm:px-10">
        {/* Uma conta em rascunho, uma cadastrada, e o sinal de somar. */}
        <div aria-hidden="true" className="relative flex h-[112px] w-[112px] items-center justify-center">
          <span className="absolute inset-0 rounded-[36px] bg-[#F1FBF6]" />
          <span className="absolute left-[14px] top-[22px] h-[38px] w-[56px] -rotate-[8deg] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] bg-white" />
          <span className="absolute right-[14px] top-[30px] flex h-[38px] w-[56px] rotate-[6deg] items-center justify-center rounded-[10px] border-[1.5px] border-[#12B85C] bg-[#DFF6EA] text-[#0A7A42]">
            {traco(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>)}
          </span>
          <span className="absolute bottom-[14px] left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">
            <PlusIcon size={16} />
          </span>
        </div>

        <div className="flex max-w-[520px] flex-col gap-2">
          <h2 className="text-[22px] font-bold tracking-[-.02em]">Nenhuma conta cadastrada</h2>
          <p className="text-[14px] leading-relaxed text-[#4C6355]">
            As contas são a base do GranaFy: é nelas que entram e saem os lançamentos, e é a partir delas
            que o saldo consolidado, a conciliação e o DRE são calculados.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onCadastrar()}
          className="flex h-12 items-center gap-2 rounded-[12px] bg-[#12B85C] px-[22px] text-[14px] font-bold text-white"
        >
          <PlusIcon size={16} />
          Cadastrar primeira conta
        </button>

        <div className="flex w-full max-w-[720px] flex-col gap-3 border-t border-[#F1F4F2] pt-6">
          <span className="text-left text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Que tipo de conta você quer cadastrar?</span>
          <div className="grid gap-3 sm:grid-cols-2">
            {TIPOS_DE_CONTA.map(item => (
              <button
                key={item.tipo}
                type="button"
                onClick={() => onCadastrar(item.tipo)}
                className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] bg-white p-3.5 text-left transition hover:bg-[#F8FAF9]"
              >
                <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] bg-[#F1F4F2] text-[#28382E]">{traco(item.icone, 17)}</span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[13.5px] font-bold">{item.titulo}</span>
                  <span className="text-[12px] text-[#8A968D]">{item.texto}</span>
                </span>
                <ChevronRightIcon size={16} className="shrink-0 text-[#8A968D]" />
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default function OrganizationPage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [section, setSection] = useState<"accounts" | "categories">("accounts");
  const [categoryView, setCategoryView] = useState<"categories" | "costCenters">("categories");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState<"active" | "archived">("active");
  const [ruleModal, setRuleModal] = useState(false);
  const [importPlanOpen, setImportPlanOpen] = useState(false);
  /*
   * `?nova=conta` abre o modal já na chegada.
   *
   * Quem vem da conciliação sem conta bancária clicou em "Cadastrar conta
   * bancária" — cair nesta página e ter de achar o botão de novo transforma um
   * clique em três. O `useState` com inicializador, e não um efeito: com efeito
   * a página pinta uma vez sem o modal e ele aparece no quadro seguinte.
   *
   * A URL é limpa logo depois, com `replace`, por dois motivos: recarregar a
   * página não deve reabrir o modal, e o botão "voltar" do navegador não deve
   * levar de volta a um endereço que abre modal.
   */
  const [accountModal, setAccountModal] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).get("nova") === "conta"
  );

  useEffect(() => {
    if (!accountModal) return;
    if (!new URLSearchParams(window.location.search).has("nova")) return;
    window.history.replaceState(null, "", "/organizacao");
  }, [accountModal]);
  const [categoryModal, setCategoryModal] = useState(false);
  /** Mãe pré-escolhida quando o modal abre pelo "+ Subcategoria" de um grupo. */
  const [novaSubDe, setNovaSubDe] = useState<string | null>(null);
  const [costCenterModal, setCostCenterModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [tipoInicial, setTipoInicial] = useState<Account["accountType"] | undefined>(undefined);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const utils = trpc.useUtils();
  const overviewQuery = trpc.organization.overview.useQuery();
  const semContasRapido = useSemContas();
  const data = overviewQuery.data;
  const refresh = async () => { await Promise.all([utils.organization.overview.invalidate(), utils.organization.options.invalidate(), utils.transactions.list.invalidate(), utils.transactions.dashboard.invalidate()]); };
  const podeEscrever = !useSomenteLeitura();
  const createAccount = trpc.organization.createAccount.useMutation({ onSuccess: refresh });
  const updateAccount = trpc.organization.updateAccount.useMutation({ onSuccess: refresh });
  const toggleAccount = trpc.organization.toggleAccount.useMutation({ onSuccess: refresh });
  const deleteAccount = trpc.organization.deleteAccount.useMutation({ onSuccess: refresh });
  const createCategory = trpc.organization.createCategory.useMutation({ onSuccess: refresh });
  const updateCategory = trpc.organization.updateCategory.useMutation({ onSuccess: refresh });
  const toggleCategory = trpc.organization.toggleCategory.useMutation({ onSuccess: refresh });
  const deleteCategory = trpc.organization.deleteCategory.useMutation({ onSuccess: refresh });
  const createCostCenter = trpc.organization.createCostCenter.useMutation({ onSuccess: refresh });
  const updateCostCenter = trpc.organization.updateCostCenter.useMutation({ onSuccess: refresh });
  const toggleCostCenter = trpc.organization.toggleCostCenter.useMutation({ onSuccess: refresh });
  const deleteCostCenter = trpc.organization.deleteCostCenter.useMutation({ onSuccess: refresh });
  const rulesQuery = trpc.organization.rules.useQuery();
  const refreshRules = async () => { await utils.organization.rules.invalidate(); };
  const createRule = trpc.organization.createRule.useMutation({ onSuccess: refreshRules });
  const deleteRule = trpc.organization.deleteRule.useMutation({ onSuccess: refreshRules });
  const importCategories = trpc.organization.importCategories.useMutation({ onSuccess: refresh });
  const initials = (user?.name || user?.email || "NV").split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("");
  const activeAccounts = data?.accounts.filter(item => item.isActive).length ?? 0;
  const activeCategories = data?.categories.filter(item => item.isActive).length ?? 0;
  const activeCostCenters = data?.costCenters.filter(item => item.isActive).length ?? 0;
  const totalBalance = data?.accounts.reduce((sum, item) => sum + item.balance, 0) ?? 0;
  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] active:scale-95";

  const accounts = (data?.accounts ?? []) as Account[];
  const archivedAccounts = accounts.filter(item => !item.isActive).length;
  const rules = (rulesQuery.data ?? []) as CategoryRuleView[];
  const uncategorized = data?.uncategorized ?? { count: 0, amount: 0 };

  const visibleAccounts = useMemo(() => {
    const term = accountSearch.trim().toLowerCase();
    return accounts.filter(item =>
      (accountFilter === "active" ? item.isActive : !item.isActive) &&
      (!term || `${item.name} ${item.institution}`.toLowerCase().includes(term))
    );
  }, [accountFilter, accountSearch, accounts]);

  /** Participação de cada conta ativa no saldo, só entre as positivas. */
  const distribution = useMemo(() => {
    const positives = accounts.filter(item => item.isActive && item.balance > 0);
    const sum = positives.reduce((total, item) => total + item.balance, 0);
    if (sum <= 0) return [];
    return [...positives]
      .sort((left, right) => right.balance - left.balance)
      .slice(0, DISTRIBUTION_TONES.length)
      .map((item, index) => ({
        id: item.id,
        name: item.name,
        share: (item.balance / sum) * 100,
        tone: DISTRIBUTION_TONES[index],
      }));
  }, [accounts]);

  /** Cartão entra como dívida; as demais contas são caixa. */
  const cashTotals = useMemo(() => {
    const active = accounts.filter(item => item.isActive);
    const inAccounts = active.filter(item => item.accountType !== "cartao").reduce((total, item) => total + item.balance, 0);
    const cards = active.filter(item => item.accountType === "cartao").reduce((total, item) => total + item.balance, 0);
    return { inAccounts, cards, available: inAccounts + cards };
  }, [accounts]);

  const { incomeTree, expenseTree, incomeTotal, expenseTotal } = useMemo(() => {
    const all = (data?.categories ?? []) as FlatCategory[];
    // "ambos" aparece nos dois lados: é onde o usuário classifica os dois tipos.
    const income = all.filter(item => item.type === "entrada" || item.type === "ambos");
    const expense = all.filter(item => item.type === "saida" || item.type === "ambos");
    return {
      incomeTree: buildCategoryTree(income),
      expenseTree: buildCategoryTree(expense),
      incomeTotal: income.reduce((total, item) => total + Math.max(0, item.total), 0),
      expenseTotal: expense.reduce((total, item) => total + Math.min(0, item.total), 0),
    };
  }, [data?.categories]);

  const costCenterBars = useMemo(() => {
    const items = (data?.costCenters ?? []).filter(item => item.transactionCount > 0);
    const biggest = Math.max(1, ...items.map(item => Math.abs(item.total)));
    return [...items]
      .sort((left, right) => Math.abs(right.total) - Math.abs(left.total))
      .map(item => ({ ...item, share: (Math.abs(item.total) / biggest) * 100 }));
  }, [data?.costCenters]);

  const headerSubtitle = section === "accounts" && (semContasRapido || (accounts.length === 0 && !overviewQuery.isLoading))
    ? "nenhuma conta cadastrada"
    : section === "accounts"
    ? `${activeAccounts} ${activeAccounts === 1 ? "conta ativa" : "contas ativas"}${archivedAccounts > 0 ? ` · ${archivedAccounts} arquivada${archivedAccounts === 1 ? "" : "s"}` : ""}`
    : `${activeCategories} categorias · ${activeCostCenters} centros de custo`;

  const primaryLabel = section === "accounts"
    ? "Nova conta"
    : categoryView === "categories" ? "Nova categoria" : "Novo centro de custo";

  const openPrimary = () => {
    if (section === "accounts") { setEditingAccount(null); setAccountModal(true); return; }
    if (categoryView === "categories") { setEditingCategory(null); setNovaSubDe(null); setCategoryModal(true); return; }
    setEditingCostCenter(null);
    setCostCenterModal(true);
  };

  const openCategoryEditor = (category: Category) => {
    setEditingCategory(category);
    setNovaSubDe(null);
    setCategoryModal(true);
  };
  const openSubcategoria = (parentPath: string) => {
    setEditingCategory(null);
    setNovaSubDe(parentPath);
    setCategoryModal(true);
  };

  const saveRule = async (values: Parameters<typeof createRule.mutateAsync>[0]) => {
    try {
      await createRule.mutateAsync(values);
      setRuleModal(false);
      toast.success("Regra criada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar a regra");
    }
  };

  /*
   * As quatro exclusões desta tela passam pelo mesmo modal.
   *
   * Eram quatro `window.confirm`: popup do navegador, que trava a aba, ignora
   * o tema e escreve o endereço do site em cima da pergunta. Aqui a pergunta
   * guarda o que vai sumir, o título e o texto que explicam a consequência, e
   * o que fazer quando a pessoa disser sim.
   */
  type Exclusao = { titulo: string; texto: string; executar: () => Promise<void> };
  const [exclusao, setExclusao] = useState<Exclusao | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const confirmarExclusao = async () => {
    if (!exclusao) return;
    setExcluindo(true);
    try {
      await exclusao.executar();
      setExclusao(null);
    } finally {
      setExcluindo(false);
    }
  };

  const handleDeleteRule = (rule: CategoryRuleView) => setExclusao({
    titulo: "Excluir esta regra?",
    texto: `“${rule.matchValue}” deixa de classificar lançamentos novos. Os já classificados não mudam.`,
    executar: async () => {
      try {
        await deleteRule.mutateAsync({ id: rule.id });
        toast.success("Regra removida");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível excluir a regra");
      }
    },
  });

  const savePlan = async (content: string) => {
    try {
      const result = await importCategories.mutateAsync({ content });
      setImportPlanOpen(false);
      toast.success(result.created === 0
        ? "Nenhuma categoria nova: todas já existiam"
        : `${result.created} ${result.created === 1 ? "categoria criada" : "categorias criadas"}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar o plano");
    }
  };

  const saveAccount = async (values: Parameters<typeof createAccount.mutateAsync>[0]) => {
    if (editingAccount) await updateAccount.mutateAsync({ id: editingAccount.id, ...values }); else await createAccount.mutateAsync(values); setAccountModal(false); setEditingAccount(null); toast.success(editingAccount ? "Conta atualizada" : "Conta criada");
  };
  const saveCategory = async (values: Parameters<typeof createCategory.mutateAsync>[0]) => {
    try { if (editingCategory) await updateCategory.mutateAsync({ id: editingCategory.id, ...values }); else await createCategory.mutateAsync(values); setCategoryModal(false); setEditingCategory(null); setNovaSubDe(null); toast.success(editingCategory ? "Categoria atualizada" : values.name.includes("/") ? "Subcategoria criada" : "Categoria criada"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar a categoria"); }
  };
  const handleDeleteAccount = (item: Account) => setExclusao({
    titulo: "Excluir esta conta?",
    texto: `“${item.name}” sai da lista e das telas do dia a dia. Se ela tiver lançamentos, o servidor recusa e sugere arquivar.`,
    executar: async () => {
      try { await deleteAccount.mutateAsync({ id: item.id }); toast.success("Conta excluída"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); }
    },
  });
  const handleDeleteCategory = (item: Category) => setExclusao({
    titulo: "Excluir esta categoria?",
    texto: `“${item.name}” sai do plano de contas. Se ela já tiver lançamentos, o servidor recusa e sugere desativar.`,
    executar: async () => {
      try { await deleteCategory.mutateAsync({ id: item.id }); toast.success("Categoria excluída"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); }
    },
  });
  const saveCostCenter = async (values: Parameters<typeof createCostCenter.mutateAsync>[0]) => {
    try { if (editingCostCenter) await updateCostCenter.mutateAsync({ id: editingCostCenter.id, ...values }); else await createCostCenter.mutateAsync(values); setCostCenterModal(false); setEditingCostCenter(null); toast.success(editingCostCenter ? "Centro de custo atualizado" : "Centro de custo criado"); } catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível salvar o centro de custo"); }
  };
  const handleDeleteCostCenter = (item: CostCenter) => setExclusao({
    titulo: "Excluir este centro de custo?",
    texto: `“${item.name}” sai da lista. Se já tiver lançamentos apontando para ele, o servidor recusa e sugere desativar.`,
    executar: async () => {
      try { await deleteCostCenter.mutateAsync({ id: item.id }); toast.success("Centro de custo excluído"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "Não foi possível excluir"); }
    },
  });

  const loading = overviewQuery.isLoading;
  const failed = overviewQuery.isError;
  /* Nenhuma conta, nem arquivada: a tela de contas vira o convite. */
  const semContas = semContasRapido || (!loading && !failed && accounts.length === 0);

  return (
    <main className="voltura vg-pagina">
      <div className="flex w-full">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={
            <SidebarStatCard
              tone={totalBalance < 0 ? "negative" : "positive"}
              kicker="Saldo consolidado"
              value={semContas ? "—" : formatMoney(totalBalance)}
              hint={semContas ? "nenhuma conta cadastrada" : `${activeAccounts} ${activeAccounts === 1 ? "conta ativa" : "contas ativas"}`}
            />
          }
        />
        <section className="vg-casca vg-conteudo flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={WalletIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">{section === "accounts" ? "Contas" : "Categorias"}</h1>
              <p className="mt-0.5 text-[12.5px] text-[#8A968D]">{headerSubtitle}</p>
            </div>

            {section === "accounts" ? (
              <label className={`relative min-w-[200px] flex-1 sm:max-w-[260px] ${semContas ? "pointer-events-none opacity-50" : ""}`}>
                <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A968D]" />
                <input value={accountSearch} onChange={event => setAccountSearch(event.target.value)} placeholder="Buscar conta…" className="h-10 w-full rounded-[12px] bg-white pl-10 pr-3 text-[13px] outline-none ring-1 ring-[#DFE6E1] focus:ring-2 focus:ring-[#12B85C]/30" />
              </label>
            ) : (
              <div className="flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1]">
                {([["categories", "Categorias"], ["costCenters", "Centros de custo"]] as const).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setCategoryView(value)} aria-pressed={categoryView === value} className={`px-4 text-[13px] transition ${categoryView === value ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"}`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            {section === "categories" && podeEscrever && (
              <Hint label="Importar plano de contas"><button type="button" aria-label="Importar plano de contas" onClick={() => setImportPlanOpen(true)} className={toolButton}><UploadIcon size={17} /></button></Hint>
            )}
            {podeEscrever && (
            <button type="button" onClick={openPrimary} className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold sm:px-4 text-white hover:bg-[#0F9E4E]">
              <PlusIcon size={15} />{primaryLabel}
            </button>
            )}
            <ProfileMenu />
          </header>

          <section className="flex rounded-[14px] bg-white p-1 ring-1 ring-[#E1E8E3] sm:w-fit">
            {([["accounts", "Contas"], ["categories", "Categorias"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setSection(value)} className={`flex-1 rounded-[10px] px-5 py-2.5 text-[12.5px] font-bold sm:flex-none ${section === value ? "bg-[#DFF6EA] text-[#0A7A42]" : "text-[#718077]"}`}>
                {label}
              </button>
            ))}
          </section>

          {!semContas && loading && (
            <>
              {/* A forma real desta tela nas duas abas: um cartão largo no topo
                  e a lista embaixo. Eram três indicadores estreitos, que
                  viravam um cartão de largura inteira quando o dado chegava. */}
              <CartaoSkeleton />
              <TableSkeleton linhas={5} />
            </>
          )}
          {failed && <section className="flex min-h-[420px] flex-1 flex-col items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]"><strong className="text-[#B3261E]">Não foi possível carregar</strong><button type="button" onClick={() => overviewQuery.refetch()} className="mt-3 rounded-xl bg-[#FDECEA] px-4 py-2 text-[12px] font-bold text-[#8E1F16]">Tentar novamente</button></section>}

          {semContas && section === "accounts" && !podeEscrever && (
            <CartaoVazio icone={<WalletIcon size={20} />} titulo="Nenhuma conta cadastrada" texto="O dono ainda não cadastrou contas nesta empresa." alturaMinima={420} />
          )}
          {semContas && section === "accounts" && podeEscrever && (
            <ContasVazias onCadastrar={tipo => { setEditingAccount(null); setTipoInicial(tipo); setAccountModal(true); }} />
          )}

          {!loading && !failed && !semContas && section === "accounts" && (
            <>
              <AuroraSurface className="rounded-[20px] p-6">
                <div className="flex flex-1 flex-col gap-3.5">
                  <div className="flex items-center gap-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Saldo consolidado</span>
                    <span className="ml-auto rounded-lg bg-[#06120B]/55 px-2.5 py-1 text-[11px] font-semibold text-white">
                      {activeAccounts} {activeAccounts === 1 ? "conta ativa" : "contas ativas"}
                    </span>
                  </div>
                  <strong className="text-[38px] font-bold leading-none tracking-[-.03em]">{formatMoney(totalBalance)}</strong>
                  {distribution.length > 0 && (
                    <>
                      <div className="flex h-2.5 gap-1.5 overflow-hidden rounded-full">
                        {distribution.map(item => (
                          <span key={item.id} style={{ width: `${item.share}%`, backgroundColor: item.tone }} className="block" />
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 pt-0.5">
                        {distribution.map(item => (
                          <span key={item.id} className="flex items-center gap-2 text-[12px] text-[#C5DACE]">
                            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: item.tone }} />
                            {item.name} {formatPercent(item.share)}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </AuroraSurface>

              <section className="flex min-h-0 flex-1 flex-col gap-1 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:px-6">
                <div className="flex flex-wrap items-center gap-2.5 pb-3">
                  <h2 className="text-[15px] font-bold">Todas as contas</h2>
                  <div className="ml-auto flex items-center gap-2">
                    {([["active", `Ativas · ${activeAccounts}`], ["archived", `Arquivadas · ${archivedAccounts}`]] as const).map(([value, label]) => (
                      <button key={value} type="button" onClick={() => setAccountFilter(value)} className={`rounded-[10px] px-3 py-1.5 text-[12.5px] transition ${accountFilter === value ? "bg-[#F1F4F2] font-semibold text-[#28382E]" : "text-[#8A968D] hover:bg-[#F8FAF9]"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <div className="min-w-[840px]">
                    <div className={`${ACCOUNT_GRID} border-b border-[#E3EAE5] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]`}>
                      <span>Conta</span><span>Tipo</span><span>Sincronização</span><span>Lançamentos</span><span className="text-right">Saldo atual</span><span />
                    </div>
                    {visibleAccounts.length === 0 ? (
                      <CartaoVazio
                        icone={<WalletIcon size={20} />}
                        titulo={accountSearch ? "Nenhuma conta nesta busca" : accountFilter === "active" ? "Nenhuma conta ativa" : "Nenhuma conta arquivada"}
                        texto={accountSearch
                          ? "Nenhuma conta corresponde ao que você digitou."
                          : accountFilter === "active"
                            ? "Cadastre uma conta para importar OFX ou CSV e organizar os saldos."
                            : "Contas arquivadas somem das telas do dia a dia e ficam guardadas aqui."}
                        acoes={accountSearch || accountFilter !== "active" || !podeEscrever ? [] : [{ rotulo: "Cadastrar conta", onClick: () => { setEditingAccount(null); setAccountModal(true); }, icone: <PlusIcon size={15} /> }]}
                      />
                    ) : visibleAccounts.map(item => (
                      <div key={item.id} className={`${ACCOUNT_GRID} items-center border-b border-[#F1F4F2] px-1 py-3 transition hover:bg-[#F8FAF9]`}>
                        <div className="flex min-w-0 items-center gap-3">
                          <BankMark institution={item.institution} color={item.color} />
                          <div className="min-w-0">
                            <span className="block truncate text-[14px] font-semibold">{item.name}</span>
                            <span className="block truncate text-[12px] text-[#8A968D]">{item.institution || "Sem instituição"}</span>
                          </div>
                        </div>
                        <span className="truncate text-[13px] capitalize text-[#4C6355]">{item.accountType}</span>
                        <SyncBadge account={item} />
                        <span className="text-[13px] text-[#4C6355]">{item.monthTransactionCount} no mês</span>
                        <span className={`text-right text-[15px] font-bold ${item.balance >= 0 ? "" : "text-[#B3261E]"}`}>{formatMoney(item.balance)}</span>
                        {/*
                          As dicas destas três abrem para a esquerda.

                          A tabela vive num `overflow-x-auto`, e um balão
                          invisível conta como conteúdo: o de "Excluir conta",
                          centrado sobre o último botão, passava 30 px da borda
                          direita e criava uma barra de rolagem horizontal numa
                          tabela que cabia inteira na tela. Abrindo para dentro,
                          o balão não estica nada — e de quebra deixa de ser
                          cortado pelo próprio contêiner, que também recorta em
                          cima.
                        */}
                        {podeEscrever && (
                        <div className="flex items-center justify-end gap-1">
                          <Hint label={item.isActive ? "Arquivar conta" : "Reativar conta"} placement="left"><button type="button" aria-label={item.isActive ? `Arquivar ${item.name}` : `Reativar ${item.name}`} onClick={() => toggleAccount.mutate({ id: item.id })} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#F1F4F2]">{item.isActive ? <ArchiveIcon size={15} /> : <CheckIcon size={15} />}</button></Hint>
                          <Hint label="Editar conta" placement="left"><button type="button" aria-label={`Editar ${item.name}`} onClick={() => { setEditingAccount(item); setAccountModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#F1F4F2]"><EditIcon size={15} /></button></Hint>
                          <Hint label="Excluir conta" placement="left"><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => handleDeleteAccount(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#FDECEA] hover:text-[#B3261E]"><DeleteIcon size={15} /></button></Hint>
                        </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 overflow-hidden rounded-[14px] bg-[#F8FAF9] sm:grid-cols-3">
                  <div className="flex items-baseline justify-center gap-2 px-4 py-3.5">
                    <span className="text-[12.5px] text-[#8A968D]">Em conta</span>
                    <strong className="text-[15px] font-bold">{formatMoney(cashTotals.inAccounts)}</strong>
                  </div>
                  <div className="flex items-baseline justify-center gap-2 border-t border-[#E3EAE5] px-4 py-3.5 sm:border-l sm:border-t-0">
                    <span className="text-[12.5px] text-[#8A968D]">Cartões</span>
                    <strong className={`text-[15px] font-bold ${cashTotals.cards < 0 ? "text-[#B3261E]" : ""}`}>{formatMoney(cashTotals.cards)}</strong>
                  </div>
                  <div className="flex items-baseline justify-center gap-2 border-t border-[#E3EAE5] px-4 py-3.5 sm:border-l sm:border-t-0">
                    <span className="text-[12.5px] text-[#8A968D]">Disponível real</span>
                    <strong className={`text-[15px] font-bold ${cashTotals.available >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{formatMoney(cashTotals.available)}</strong>
                  </div>
                </div>
              </section>
            </>
          )}

          {!loading && !failed && section === "categories" && (
            <section className="grid flex-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col gap-5">
                {categoryView === "categories" ? (
                  <>
                    <CategoryGroupCard title="Receitas" tone="positive" nodes={incomeTree} total={incomeTotal} onEdit={openCategoryEditor} onAddChild={openSubcategoria} />
                    <CategoryGroupCard title="Despesas" tone="negative" nodes={expenseTree} total={expenseTotal} onEdit={openCategoryEditor} onAddChild={openSubcategoria} />
                  </>
                ) : (
                  <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:px-6">
                    <div className="flex items-center gap-3 pb-2">
                      <h2 className="text-[15px] font-bold">Centros de custo</h2>
                      <span className="ml-auto text-[12.5px] text-[#8A968D]">{data?.costCenters.length ?? 0} cadastrados</span>
                    </div>
                    {(data?.costCenters.length ?? 0) === 0 ? (
                      <p className="rounded-[14px] bg-[#F8FAF9] p-4 text-[12px] leading-relaxed text-[#8A968D]">
                        O centro de custo é opcional no lançamento. Crie um quando quiser separar os gastos por área, projeto ou unidade.
                      </p>
                    ) : (
                      <div className="flex flex-col">
                        {data?.costCenters.map(item => (
                          <div key={item.id} className="flex items-center gap-3 border-t border-[#F1F4F2] py-3">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: item.color }} />
                            <span className={`min-w-0 flex-1 truncate text-[14px] font-semibold ${item.isActive ? "" : "text-[#8A968D] line-through"}`}>{item.name}</span>
                            <span className="text-[12px] text-[#8A968D]">{item.transactionCount} lançamentos</span>
                            <span className="w-[130px] text-right text-[14px] font-bold">{formatMoney(item.total)}</span>
                            {podeEscrever && (
                            <div className="flex items-center gap-1">
                              <button type="button" title={item.isActive ? "Desativar" : "Ativar"} aria-label={`${item.isActive ? "Desativar" : "Ativar"} ${item.name}`} onClick={() => toggleCostCenter.mutate({ id: item.id })} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#F1F4F2]"><CheckIcon size={15} /></button>
                              <Hint label="Editar centro de custo" placement="top"><button type="button" aria-label={`Editar ${item.name}`} onClick={() => { setEditingCostCenter(item); setCostCenterModal(true); }} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#F1F4F2]"><EditIcon size={15} /></button></Hint>
                              <Hint label="Excluir centro de custo" placement="top"><button type="button" aria-label={`Excluir ${item.name}`} onClick={() => handleDeleteCostCenter(item)} className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] hover:bg-[#FDECEA] hover:text-[#B3261E]"><DeleteIcon size={15} /></button></Hint>
                            </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </article>
                )}
              </div>

              <aside className="flex flex-col gap-5">
                <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                  <h2 className="text-[15px] font-bold">Centros de custo</h2>
                  <div className="mt-3.5 flex flex-col gap-3">
                    {costCenterBars.length === 0 ? (
                      <p className="text-[12px] leading-relaxed text-[#8A968D]">Nenhum centro de custo com movimento.</p>
                    ) : costCenterBars.map(item => (
                      <div key={item.id} className="flex flex-col gap-1.5">
                        <div className="flex text-[13px]">
                          <span className="min-w-0 flex-1 truncate font-semibold">{item.name}</span>
                          <span className="shrink-0 font-bold">{formatMoney(item.total)}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-[#EDF2EE]">
                          <div className="h-full rounded-full bg-[#12B85C]" style={{ width: `${item.share}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  {podeEscrever && (
                  <button type="button" onClick={() => { setEditingCostCenter(null); setCostCenterModal(true); }} className="mt-4 flex h-[42px] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#C9D5CD] text-[13px] font-semibold text-[#4C6355] hover:bg-[#F8FAF9]">
                    <PlusIcon size={14} />Novo centro de custo
                  </button>
                  )}
                </article>

                <article className="rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3]">
                  <div className="flex items-center gap-3">
                    <h2 className="text-[15px] font-bold">Regras automáticas</h2>
                    <span className="ml-auto text-[12px] text-[#8A968D]">{rules.length}</span>
                  </div>
                  <div className="mt-3.5 flex flex-col gap-2.5">
                    {rules.length === 0 ? (
                      <p className="text-[12px] leading-relaxed text-[#8A968D]">
                        Nenhuma regra ainda. Elas classificam sozinhas o que chega pela importação de OFX ou CSV.
                      </p>
                    ) : rules.slice(0, 4).map(rule => (
                      <div key={rule.id} className={`rounded-[14px] bg-[#F8FAF9] p-3 ${rule.isActive ? "" : "opacity-60"}`}>
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="block text-[12.5px] text-[#8A968D]">
                              {RULE_MATCH_LABELS[rule.matchType]} <span className="font-semibold text-[#0B1F14]">“{rule.matchValue}”</span>
                              {rule.autoReconcile && (
                                <span className="ml-2 rounded-[5px] bg-[#DFF6EA] px-[7px] py-[2px] text-[10.5px] font-semibold text-[#0A7A42]">
                                  concilia sozinha
                                </span>
                              )}
                            </span>
                            <span className="mt-1 flex items-center gap-2 text-[13px] font-semibold">
                              <ChevronRightIcon size={13} />
                              <span className="min-w-0 truncate">{[rule.category, rule.costCenter].filter(Boolean).join(" · ")}</span>
                            </span>
                          </div>
                          {podeEscrever && (
                          <Hint label="Excluir regra" placement="top"><button type="button" aria-label={`Excluir regra ${rule.matchValue}`} onClick={() => handleDeleteRule(rule)} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[#B3BFB7] hover:bg-[#FDECEA] hover:text-[#B3261E]"><DeleteIcon size={13} /></button></Hint>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {podeEscrever && (
                  <button type="button" onClick={() => setRuleModal(true)} className="mt-4 flex h-[42px] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#C9D5CD] text-[13px] font-semibold text-[#4C6355] hover:bg-[#F8FAF9]">
                    <PlusIcon size={14} />Nova regra
                  </button>
                  )}
                </article>

                {uncategorized.count > 0 && (
                  <article className="rounded-[20px] bg-[#FDECEA] p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="text-[#8E1F16]"><DocumentIcon size={17} /></span>
                      <strong className="text-[13.5px] font-bold text-[#8E1F16]">
                        {uncategorized.count} {uncategorized.count === 1 ? "lançamento sem categoria" : "lançamentos sem categoria"}
                      </strong>
                    </div>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-[#8E1F16]">
                      {formatMoney(uncategorized.amount)} ficaram fora do resultado por falta de classificação.
                    </p>
                    <button type="button" onClick={() => setLocation("/lancamentos")} className="mt-3 h-[38px] w-full rounded-[12px] bg-white text-[12.5px] font-bold text-[#8E1F16] hover:bg-[#FFF6F5]">
                      Abrir lançamentos
                    </button>
                  </article>
                )}
              </aside>
            </section>
          )}

          {!loading && !failed && (data?.imports.length ?? 0) > 0 && section === "accounts" && (
            <section className="rounded-[18px] bg-white p-4 ring-1 ring-[#E1E8E3]">
              <div className="mb-3 flex items-center">
                <h2 className="text-[14px] font-bold">Importações recentes</h2>
                <button type="button" onClick={() => setLocation("/lancamentos")} className="ml-auto text-[11.5px] font-bold text-[#0A7A42]">Abrir lançamentos</button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {data?.imports.slice(0, 6).map(item => (
                  <div key={item.id} className="flex items-center gap-3 rounded-xl bg-[#F8FAF9] p-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DFF6EA] text-[10px] font-bold uppercase text-[#0A7A42]">{item.format}</span>
                    <div className="min-w-0">
                      <strong className="block truncate text-[11.5px]">{item.fileName}</strong>
                      <span className="block text-[10px] text-[#8A968D]">{item.importedCount} importados · {item.duplicateCount} duplicados</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      </div>

      {exclusao && (
        <ModalDeConfirmacao
          titulo={exclusao.titulo}
          texto={exclusao.texto}
          pendente={excluindo}
          onCancelar={() => setExclusao(null)}
          onConfirmar={confirmarExclusao}
        />
      )}
      {accountModal && <AccountModal account={editingAccount} tipoInicial={tipoInicial} pending={createAccount.isPending || updateAccount.isPending} onClose={() => { setAccountModal(false); setEditingAccount(null); setTipoInicial(undefined); }} onSave={saveAccount} />}
      {categoryModal && <CategoryModal category={editingCategory} categorias={(data?.categories ?? []) as Category[]} maeInicial={novaSubDe} pending={createCategory.isPending || updateCategory.isPending} onClose={() => { setCategoryModal(false); setEditingCategory(null); setNovaSubDe(null); }} onSave={saveCategory} />}
      {costCenterModal && <CostCenterModal costCenter={editingCostCenter} pending={createCostCenter.isPending || updateCostCenter.isPending} onClose={() => { setCostCenterModal(false); setEditingCostCenter(null); }} onSave={saveCostCenter} />}
      {ruleModal && <RuleModal categories={data?.categories ?? []} costCenters={data?.costCenters ?? []} pending={createRule.isPending} onClose={() => setRuleModal(false)} onSave={saveRule} />}
      {importPlanOpen && <ImportPlanModal pending={importCategories.isPending} onClose={() => setImportPlanOpen(false)} onSave={savePlan} />}
    </main>
  );
}
