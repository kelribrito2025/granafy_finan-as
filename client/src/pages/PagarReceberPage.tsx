import { AuroraSurface } from "@/components/AuroraSurface";
import { AppSidebar } from "@/components/AppSidebar";
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  MenuIcon,
  PlusIcon,
  SearchIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { STATUS_LABELS, type Title, type TitleStatus } from "@shared/payables";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { HideValuesButton } from "@/components/HideValuesButton";
import { usePrivacy } from "@/contexts/PrivacyContext";

type Arrangement = "lista" | "colunas";
type Tab = "tudo" | "receber" | "pagar" | "atrasados";
type Overview = inferRouterOutputs<AppRouter>["payables"]["overview"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Cores de cada situação, iguais às do modelo. */
const STATUS_STYLE: Record<TitleStatus, string> = {
  atrasado: "bg-[#FDECEA] text-[#8E1F16]",
  vence_hoje: "bg-[#F1F4F2] text-[#28382E]",
  em_aberto: "bg-[#F1F4F2] text-[#4C6355]",
  liquidado: "bg-[#DFF6EA] text-[#0A7A42]",
};

/** Cartão vermelho no pé do menu: só a dívida vencida, nunca o líquido. */
function OverdueCard({ count, amount }: { count: number; amount: number }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[16px] bg-[#FDECEA] p-3.5">
      <span className="text-[10px] font-semibold uppercase tracking-[.1em] text-[#8E1F16]">Em atraso</span>
      <span className="text-[20px] font-bold text-[#8E1F16]">{formatMoney(Math.abs(amount))}</span>
      <span className="text-[11.5px] text-[#8E1F16]">{count === 1 ? "1 título vencido" : `${count} títulos vencidos`}</span>
    </div>
  );
}

function KpiCard({ label, value, hint, valueClass, hintClass, icon, highlight = false }: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  valueClass?: string;
  hintClass?: string;
  icon?: { node: React.ReactNode; className: string };
  highlight?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ${icon.className}`}>{icon.node}</span>}
        <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${highlight ? "text-[#8FB39E]" : "text-[#4C6355]"}`}>{label}</span>
      </div>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${highlight ? "text-white" : valueClass ?? ""}`}>{value}</strong>
      <span className={`text-[12.5px] ${highlight ? "text-[#7EE2A8]" : hintClass ?? "text-[#4C6355]"}`}>{hint}</span>
    </>
  );
  if (highlight) {
    return <AuroraSurface className="rounded-[20px] p-6"><div className="flex flex-1 flex-col gap-2">{content}</div></AuroraSurface>;
  }
  return <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">{content}</article>;
}

/** Quadradinho com a seta do tipo do título. */
function SideMark({ side, size = 26 }: { side: "receber" | "pagar"; size?: number }) {
  const arrow = side === "receber"
    ? <path d="M12 19V5M5 12l7-7 7 7" />
    : <path d="M12 5v14M19 12l-7 7-7-7" />;
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-lg ${side === "receber" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}
      style={{ width: size, height: size }}
    >
      <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">{arrow}</svg>
    </span>
  );
}

function StatusTag({ status }: { status: TitleStatus }) {
  return (
    <span className={`justify-self-start rounded-md px-2.5 py-[3px] text-[11px] font-semibold ${STATUS_STYLE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function signedMoney(value: number) {
  return value < 0 ? <>− {formatMoney(Math.abs(value))}</> : <>+ {formatMoney(value)}</>;
}

const LIST_GRID = "grid grid-cols-[26px_minmax(0,1fr)_auto] gap-3 lg:grid-cols-[34px_84px_minmax(0,1fr)_170px_140px_120px_150px_44px]";

function SettleButton({ title, onSettle, pending }: { title: Title; onSettle: (id: number) => void; pending: boolean }) {
  const label = title.side === "receber" ? "Marcar como recebido" : "Marcar como pago";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          disabled={pending}
          onClick={() => onSettle(title.id)}
          className="flex h-8 w-8 items-center justify-center justify-self-end rounded-[10px] text-[#8A968D] transition hover:bg-[#F1F4F2] hover:text-[#0A7A42] disabled:opacity-40"
        >
          <CheckIcon size={16} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={6} className="rounded-lg bg-[#0B1F14] px-2.5 py-1.5 text-[11px] font-semibold text-white">{label}</TooltipContent>
    </Tooltip>
  );
}

function SingleList({ data, titles, onSettle, pending }: {
  data: Overview;
  titles: Title[];
  onSettle: (id: number) => void;
  pending: boolean;
}) {
  const visible = new Set(titles.map(title => title.id));
  const groups = data.groups
    .map(group => ({ ...group, titles: group.titles.filter(title => visible.has(title.id)) }))
    .filter(group => group.titles.length > 0);

  if (groups.length === 0) {
    return <p className="py-10 text-center text-[13.5px] text-[#4C6355]">Nenhum título nesta seleção.</p>;
  }

  return (
    <>
      <div className={`${LIST_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]`}>
        <span className="hidden lg:block" />
        <span className="hidden lg:block">Venc.</span>
        <span className="lg:col-start-3">Título</span>
        <span className="hidden lg:block">Contato</span>
        <span className="hidden lg:block">Categoria</span>
        <span className="hidden lg:block">Situação</span>
        <span className="text-right">Valor</span>
        <span className="hidden lg:block" />
      </div>

      {groups.map(group => (
        <div key={group.key}>
          <div className="flex items-center gap-2.5 px-1 pb-2 pt-3.5">
            <span className="text-[12.5px] font-bold text-[#0B1F14]">
              {group.key === "hoje" ? `Hoje · ${formatDate(data.today)}` : group.label}
            </span>
            <span className="text-[12px] text-[#4C6355]">
              {group.titles.length === 1 ? "1 título" : `${group.titles.length} títulos`} ·{" "}
              {group.receivable !== 0 && group.payable !== 0
                ? <>{formatMoney(group.receivable)} a receber · {formatMoney(Math.abs(group.payable))} a pagar</>
                : signedMoney(group.balance)}
            </span>
            <span className="h-px flex-1 bg-[#F1F4F2]" />
          </div>

          {group.titles.map(title => (
            <div key={title.id} className={`${LIST_GRID} items-center border-b border-[#F1F4F2] px-1 py-[11px] transition hover:bg-[#F8FAF9]`}>
              <SideMark side={title.side} />
              <span className={`hidden text-[13px] lg:block ${title.titleStatus === "atrasado" ? "font-semibold text-[#8E1F16]" : "text-[#4C6355]"}`}>
                {formatDate(title.transactionDate)}
              </span>
              <div className="min-w-0">
                <span className="block truncate text-[14px] font-semibold" title={title.description}>{title.description}</span>
                <span className="block truncate text-[12px] text-[#4C6355] lg:hidden">
                  {formatDate(title.transactionDate)} · {STATUS_LABELS[title.titleStatus]}
                </span>
              </div>
              <span className="hidden truncate text-[13px] text-[#4C6355] lg:block" title={title.contact}>{title.contact || "—"}</span>
              <span className="hidden truncate text-[13px] text-[#4C6355] lg:block" title={title.category}>{title.category}</span>
              <span className="hidden lg:block"><StatusTag status={title.titleStatus} /></span>
              <span className={`text-right text-[14px] font-bold ${title.side === "receber" ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
                {signedMoney(title.amount)}
              </span>
              <span className="hidden lg:block"><SettleButton title={title} onSettle={onSettle} pending={pending} /></span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

// A última coluna precisa caber "+ R$ 17.930,00" sem quebrar o sinal em outra linha.
const COLUMN_GRID = "grid grid-cols-[64px_minmax(0,1fr)_auto] gap-2.5 sm:grid-cols-[74px_minmax(0,1fr)_106px_146px_32px]";

function SideColumn({ side, titles, total, warning, onSettle, pending, onNew }: {
  side: "receber" | "pagar";
  titles: Title[];
  total: number;
  warning: { text: string; amount: number } | null;
  onSettle: (id: number) => void;
  pending: boolean;
  onNew: () => void;
}) {
  const receiving = side === "receber";
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
      <div className="flex items-center gap-3 pb-3.5">
        <SideMark side={side} size={30} />
        <div className="flex min-w-0 flex-col">
          <span className="text-[15px] font-bold">{receiving ? "A receber" : "A pagar"}</span>
          <span className="text-[12px] text-[#4C6355]">
            {titles.length === 1 ? "1 título" : `${titles.length} títulos`}
          </span>
        </div>
        <span className={`ml-auto text-[19px] font-bold ${receiving ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
          {formatMoney(Math.abs(total))}
        </span>
      </div>

      {warning && (
        <div className={`mb-3 flex items-center gap-2.5 rounded-[14px] px-3.5 py-3 ${receiving ? "bg-[#F1FBF6]" : "bg-[#FDECEA]"}`}>
          <span className={`flex-1 text-[12.5px] font-bold ${receiving ? "text-[#0A7A42]" : "text-[#8E1F16]"}`}>{warning.text}</span>
          <span className={`text-[13px] font-bold ${receiving ? "text-[#0A7A42]" : "text-[#8E1F16]"}`}>{formatMoney(Math.abs(warning.amount))}</span>
        </div>
      )}

      <div className={`${COLUMN_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]`}>
        <span>Venc.</span>
        <span>Título</span>
        <span className="hidden sm:block">Situação</span>
        <span className="text-right">Valor</span>
        <span className="hidden sm:block" />
      </div>

      {titles.length === 0 ? (
        <p className="py-8 text-center text-[13px] text-[#4C6355]">
          {receiving ? "Nada a receber neste mês." : "Nada a pagar neste mês."}
        </p>
      ) : (
        titles.map(title => (
          <div key={title.id} className={`${COLUMN_GRID} items-center border-b border-[#F1F4F2] px-1 py-[11px] transition hover:bg-[#F8FAF9]`}>
            <span className={`text-[13px] ${title.titleStatus === "atrasado" ? "font-semibold text-[#8E1F16]" : "text-[#4C6355]"}`}>
              {formatDate(title.transactionDate)}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13.5px] font-semibold" title={title.description}>{title.description}</span>
              <span className="truncate text-[12px] text-[#4C6355]">{title.contact || title.category}</span>
            </div>
            <span className="hidden sm:block"><StatusTag status={title.titleStatus} /></span>
            <span className={`whitespace-nowrap text-right text-[14px] font-bold ${receiving ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
              {signedMoney(title.amount)}
            </span>
            <SettleButton title={title} onSettle={onSettle} pending={pending} />
          </div>
        ))
      )}

      <button
        type="button"
        onClick={onNew}
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#B9C7BE] text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
      >
        <PlusIcon size={14} />
        {receiving ? "Nova cobrança" : "Nova despesa"}
      </button>
    </div>
  );
}

function TotalsBar({ receivable, payable, balance }: { receivable: number; payable: number; balance: number }) {
  return (
    <div className="mt-2 grid grid-cols-1 overflow-hidden rounded-[14px] bg-[#F8FAF9] sm:grid-cols-3">
      <div className="flex items-baseline justify-center gap-2 px-4 py-3.5">
        <span className="text-[12.5px] text-[#4C6355]">A receber</span>
        <span className="text-[15px] font-bold text-[#0A7A42]">{formatMoney(receivable)}</span>
      </div>
      <div className="flex items-baseline justify-center gap-2 border-t border-[#E3EBE6] px-4 py-3.5 sm:border-l sm:border-t-0">
        <span className="text-[12.5px] text-[#4C6355]">A pagar</span>
        <span className="text-[15px] font-bold text-[#B3261E]">− {formatMoney(Math.abs(payable))}</span>
      </div>
      <div className="flex items-baseline justify-center gap-2 border-t border-[#E3EBE6] px-4 py-3.5 sm:border-l sm:border-t-0">
        <span className="text-[12.5px] text-[#4C6355]">Saldo</span>
        <span className={`text-[15px] font-bold ${balance < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>{signedMoney(balance)}</span>
      </div>
    </div>
  );
}

export default function PagarReceberPage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [arrangement, setArrangement] = useState<Arrangement>("lista");
  const [tab, setTab] = useState<Tab>("tudo");
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const query = trpc.payables.overview.useQuery(period);
  const utils = trpc.useUtils();
  const settle = trpc.transactions.toggleStatus.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.payables.invalidate(),
        utils.transactions.invalidate(),
        utils.cashflow.invalidate(),
        utils.dre.invalidate(),
      ]);
      toast.success("Título liquidado.");
    },
    onError: error => toast.error(error.message),
  });

  const data = query.data;
  const overduePayables = data?.overdue.filter(title => title.side === "pagar") ?? [];
  const monthLabel = `${MONTH_LABELS[period.month - 1]} de ${period.year}`;

  const filtered = useMemo(() => {
    if (!data) return [] as Title[];
    const term = search.trim().toLowerCase();
    return data.open.filter(title => {
      if (tab === "receber" && title.side !== "receber") return false;
      if (tab === "pagar" && title.side !== "pagar") return false;
      if (tab === "atrasados" && title.titleStatus !== "atrasado") return false;
      if (!term) return true;
      return `${title.description} ${title.contact} ${title.category}`.toLowerCase().includes(term);
    });
  }, [data, search, tab]);

  const exportCsv = () => {
    if (!data || data.open.length === 0) return toast.info("Não há títulos abertos para exportar.");
    const header = ["Vencimento", "Tipo", "Título", "Contato", "Categoria", "Situação", "Valor", "Conta"];
    const rows = data.open.map(title => [
      title.transactionDate,
      title.side === "receber" ? "A receber" : "A pagar",
      title.description,
      title.contact,
      title.category,
      STATUS_LABELS[title.titleStatus],
      title.amount.toFixed(2),
      title.account,
    ]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `a-pagar-e-receber-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";
  const goToNew = () => setLocation("/lancamentos");

  const tabs: Array<{ key: Tab; label: string; count: number; danger?: boolean }> = data
    ? [
        { key: "tudo", label: "Tudo", count: data.open.length },
        { key: "receber", label: "A receber", count: data.receivables.length },
        { key: "pagar", label: "A pagar", count: data.payables.length },
        { key: "atrasados", label: "Atrasados", count: data.overdue.length, danger: true },
      ]
    : [];

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={overduePayables.length > 0 ? <OverdueCard count={overduePayables.length} amount={data?.totals.overduePayable ?? 0} /> : undefined}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">A pagar e receber</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {data
                  ? `${data.open.length} ${data.open.length === 1 ? "título aberto" : "títulos abertos"} em ${monthLabel.toLowerCase()}`
                  : monthLabel}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-11 min-w-[168px] items-center justify-center rounded-[12px] bg-white px-4 text-[14px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <div className="flex h-11 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1]">
              {([["lista", "Lista única"], ["colunas", "Duas colunas"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setArrangement(value)}
                  className={`flex items-center px-[15px] text-[13px] transition ${arrangement === value ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <button type="button" aria-label="Exportar títulos" title="Exportar CSV" onClick={exportCsv} className={toolButton}><DownloadIcon size={17} /></button>
            <button
              type="button"
              onClick={goToNew}
              title="Abre a tela de lançamentos, onde a conta é cadastrada"
              className="flex h-11 items-center gap-2 rounded-[12px] bg-[#12B85C] px-4 text-[14px] font-bold text-white transition hover:bg-[#0F9E4E] active:scale-[.98]"
            >
              <PlusIcon size={15} />
              Nova conta
            </button>
            <HideValuesButton />
            <ProfileMenu />
          </header>

          {query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              Não foi possível carregar os títulos: {query.error.message}
            </div>
          )}
          {query.isPending && !query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#4C6355] ring-1 ring-[#E1E8E3]">Carregando títulos…</div>
          )}

          {data && (
            <>
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  highlight
                  label="Caixa projetado"
                  value={formatMoney(data.projectedCash)}
                  hint={`em ${formatDate(data.projectedCashDate)}`}
                />
                <KpiCard
                  label="A receber"
                  value={formatMoney(data.totals.receivable)}
                  valueClass="text-[#0A7A42]"
                  icon={{
                    className: "bg-[#DFF6EA] text-[#0A7A42]",
                    node: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>,
                  }}
                  hint={`${data.receivables.length} ${data.receivables.length === 1 ? "título" : "títulos"} · ${data.dueToday.filter(title => title.side === "receber").length} vencem hoje`}
                />
                <KpiCard
                  label="A pagar"
                  value={formatMoney(Math.abs(data.totals.payable))}
                  valueClass="text-[#B3261E]"
                  icon={{
                    className: "bg-[#FDECEA] text-[#B3261E]",
                    node: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg>,
                  }}
                  hint={overduePayables.length > 0
                    ? <>{overduePayables.length} em atraso · {formatMoney(Math.abs(data.totals.overduePayable))}</>
                    : "nenhum em atraso"}
                  hintClass={overduePayables.length > 0 ? "font-semibold text-[#8E1F16]" : undefined}
                />
                <KpiCard
                  label="Saldo do mês"
                  value={signedMoney(data.totals.balance)}
                  valueClass={data.totals.balance < 0 ? "text-[#B3261E]" : ""}
                  hint="se tudo for liquidado no prazo"
                />
              </section>

              {arrangement === "lista" ? (
                <section className="flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                  <div className="flex flex-wrap items-center gap-2.5 pb-3.5">
                    <div className="flex items-stretch rounded-[11px] bg-[#F1F4F2] p-[3px]">
                      {tabs.map(({ key, label, count, danger }) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setTab(key)}
                          className={`rounded-[9px] px-3.5 py-2 text-[13px] transition ${
                            tab === key
                              ? "bg-white font-bold text-[#0A7A42]"
                              : danger && count > 0
                                ? "font-semibold text-[#8E1F16]"
                                : "text-[#4C6355]"
                          }`}
                        >
                          {label} · {count}
                        </button>
                      ))}
                    </div>
                    <label className="relative ml-auto w-full sm:w-[240px]">
                      <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A968D]" />
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar título ou contato…"
                        className="h-10 w-full rounded-[11px] border border-[#E3EBE6] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#12B85C]"
                      />
                    </label>
                  </div>

                  <SingleList data={data} titles={filtered} onSettle={id => settle.mutate({ id })} pending={settle.isPending} />
                  <TotalsBar receivable={data.totals.receivable} payable={data.totals.payable} balance={data.totals.balance} />
                </section>
              ) : (
                <>
                  <section className="flex flex-col items-start gap-5 lg:flex-row">
                    <SideColumn
                      side="receber"
                      titles={data.receivables}
                      total={data.totals.receivable}
                      warning={
                        data.dueToday.filter(title => title.side === "receber").length > 0
                          ? {
                              text: `${data.dueToday.filter(title => title.side === "receber").length} recebimentos previstos para hoje`,
                              amount: data.totals.dueTodayReceivable,
                            }
                          : null
                      }
                      onSettle={id => settle.mutate({ id })}
                      pending={settle.isPending}
                      onNew={goToNew}
                    />
                    <SideColumn
                      side="pagar"
                      titles={data.payables}
                      total={data.totals.payable}
                      warning={
                        overduePayables.length > 0
                          ? {
                              text: `${overduePayables.length} ${overduePayables.length === 1 ? "título em atraso" : "títulos em atraso"}`,
                              amount: data.totals.overduePayable,
                            }
                          : null
                      }
                      onSettle={id => settle.mutate({ id })}
                      pending={settle.isPending}
                      onNew={goToNew}
                    />
                  </section>
                  <div className="rounded-[20px] bg-white px-5 py-1 ring-1 ring-[#E1E8E3] sm:px-6">
                    <TotalsBar receivable={data.totals.receivable} payable={data.totals.payable} balance={data.totals.balance} />
                  </div>
                </>
              )}

              <p className="text-[12px] text-[#4C6355]">
                Título é lançamento pendente e o vencimento é a data dele. Atrasados de meses anteriores
                aparecem aqui mesmo quando o mês selecionado é outro.
              </p>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
