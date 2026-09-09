import { AppSidebar } from "@/components/AppSidebar";
import { AuroraSurface } from "@/components/AuroraSurface";
import { GranafyLoader } from "@/components/GranafyLoader";
import { HideValuesButton } from "@/components/HideValuesButton";
import {
  ArrowDownIcon,
  ArrowsUpDownIcon,
  ArrowUpIcon,
  ChevronRightIcon,
  ClockIcon,
  DownloadIcon,
  MenuIcon,
  SearchIcon,
  SwapIcon,
} from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { PageIcon } from "@/components/PageIcon";
import { KpiRowSkeleton } from "@/components/PageSkeleton";
import { ProfileMenu } from "@/components/ProfileMenu";
import { SidebarStatCard } from "@/components/SidebarStatCard";

import { trpc } from "@/lib/trpc";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { roundCurrency } from "@shared/currency";
import type { inferRouterOutputs } from "@trpc/server";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import type { AppRouter } from "../../../server/routers";

type Arrangement = "lista" | "colunas";
type Tab = "tudo" | "recebidas" | "pagas";
type Overview = inferRouterOutputs<AppRouter>["settled"]["overview"];
type Settled = Overview["items"][number];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const EMPTY: Settled[] = [];

/** 6692 → "6.692". O resto do sistema separa milhar; esta tela também. */
function contagem(n: number) {
  return n.toLocaleString("pt-BR");
}

/** "2026-09-05" → "05/09". Sem `new Date`, que desloca pelo fuso do navegador. */
function shortDate(iso: string) {
  const [, month, day] = iso.split("-");
  return `${day}/${month}`;
}

/** "2026-09-05" → "Sexta, 05 de setembro", como no cabeçalho de dia do modelo. */
function dayLabel(iso: string) {
  const [year, month, day] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${weekday}, ${day.toString().padStart(2, "0")} de ${MONTH_LABELS[month - 1].toLowerCase()}`;
}

function KpiCard({ label, value, hint, note, valueClass, icon, highlight = false }: {
  label: string;
  value: string;
  hint: string;
  /** O total do mês, quando um filtro está de pé. */
  note?: string;
  valueClass?: string;
  icon?: { node: ReactNode; className: string };
  highlight?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-center gap-2.5">
        {icon && <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] ${icon.className}`}>{icon.node}</span>}
        <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${highlight ? "text-[#8FB39E]" : "text-[#4C6355]"}`}>{label}</span>
      </div>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${highlight ? "text-white" : valueClass ?? ""}`}>{value}</strong>
      <span className={`text-[12.5px] ${highlight ? "text-[#7EE2A8]" : "text-[#4C6355]"}`}>{hint}</span>
      {note && <span className={`text-[11.5px] ${highlight ? "text-[#8FB39E]" : "text-[#8A968D]"}`}>{note}</span>}
    </>
  );
  if (highlight) {
    return <AuroraSurface className="rounded-[20px] p-6"><div className="flex flex-1 flex-col gap-2">{content}</div></AuroraSurface>;
  }
  return <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">{content}</article>;
}

/** A seta do tipo, no círculo colorido do modelo. */
function SideMark({ incoming, size = 28 }: { incoming: boolean; size?: number }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full ${incoming ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}
      style={{ width: size, height: size }}
    >
      {incoming ? <ArrowUpIcon size={size * 0.5} /> : <ArrowDownIcon size={size * 0.5} />}
    </span>
  );
}

/** O "⋮" da linha. A única ação é estornar — nada se cria nesta tela. */
function RowActions({ open, onOpen, onClose, onEstornar }: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onEstornar: () => void;
}) {
  const anchor = useRef<HTMLDivElement>(null);
  useDismissOnOutside(open, anchor, useCallback(() => onClose(), [onClose]));
  return (
    <div ref={anchor} className="relative justify-self-end">
      <button
        type="button"
        aria-label="Ações do título"
        aria-expanded={open}
        onClick={onOpen}
        className="flex h-7 w-7 items-center justify-center rounded-[9px] text-[#8A968D] transition hover:bg-[#F1F4F2] hover:text-[#0B1F14]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-30 w-[176px] rounded-[12px] bg-white p-1 shadow-[0_12px_30px_rgba(11,31,20,.16)] ring-1 ring-[#E3EBE6]">
          <button
            type="button"
            onClick={onEstornar}
            className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[12.5px] font-medium text-[#8E1F16] transition hover:bg-[#FDECEA]"
          >
            <SwapIcon size={15} />
            Estornar
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * A confirmação do estorno.
 *
 * Mostra título e valor antes de agir porque estornar tira dinheiro do caixa
 * realizado do mês: o título volta para os abertos, sai desta tela e some dos
 * totais. Errar a linha num extrato de milhares é fácil demais para um clique
 * só resolver.
 */
function ConfirmarEstorno({ item, pending, onCancel, onConfirm }: {
  item: Settled;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="estorno-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]"
      onMouseDown={event => event.target === event.currentTarget && onCancel()}
    >
      <div className="modal-enter w-full max-w-[440px] rounded-[20px] bg-white p-6 text-[#0B1F14] shadow-[0_20px_50px_rgba(11,31,20,.16)]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={SwapIcon} />
          <div className="min-w-0">
            <h2 id="estorno-title" className="text-[18px] font-bold tracking-[-.01em]">Estornar liquidação</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">
              O título volta para <strong className="font-semibold text-[#4C6355]">A pagar e receber</strong> e sai desta tela.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-1.5 rounded-[14px] bg-[#F8FAF9] p-4">
          <strong className="text-[14px] leading-snug">{item.description}</strong>
          <span className="text-[12.5px] text-[#4C6355]">
            {item.account} · {item.category}{item.contact ? ` · ${item.contact}` : ""}
          </span>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <span className="text-[12.5px] text-[#4C6355]">
              Liquidado em {formatDate(item.settledAt!)}
              {item.settledAt !== item.transactionDate && ` · vencia em ${formatDate(item.transactionDate)}`}
            </span>
            <strong className={`text-[17px] ${item.amount > 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
              {item.amount > 0 ? "+ " : "− "}{formatMoney(Math.abs(item.amount))}
            </strong>
          </div>
        </div>

        <div className="mt-5 flex gap-2.5">
          <button type="button" disabled={pending} onClick={onCancel} className="h-11 flex-1 rounded-[12px] border border-[#E3EAE5] text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9] disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" disabled={pending} onClick={onConfirm} className="h-11 flex-1 rounded-[12px] bg-[#B3261E] text-[13px] font-bold text-white transition hover:bg-[#8E1F16] disabled:opacity-50">
            {pending ? "Estornando…" : "Estornar"}
          </button>
        </div>
      </div>
    </div>
  );
}

const ROW_GRID = "grid grid-cols-[76px_minmax(0,1.5fr)_minmax(0,1fr)_132px_112px_120px_28px] items-center gap-3";
const COLUMN_GRID = "grid grid-cols-[52px_minmax(0,1fr)_100px] items-center gap-3";

/**
 * Pagas e recebidas: o que já se moveu, pela data em que se moveu.
 *
 * A tela de "a pagar e receber" lista o que está em aberto, pelo vencimento.
 * Esta lista o que foi liquidado, pela liquidação — um título vencido em agosto
 * e pago em setembro sai de lá e aparece aqui, em setembro. Nada se cria por
 * aqui: consultar, exportar e, pela tela de lançamentos, estornar.
 */
export default function PagasRecebidasPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [arrangement, setArrangement] = useState<Arrangement>("colunas");
  const [tab, setTab] = useState<Tab>("tudo");
  const [search, setSearch] = useState("");
  const [accountFilter, setAccountFilter] = useState("todos");
  const [categoryFilter, setCategoryFilter] = useState("todos");
  const [menuAberto, setMenuAberto] = useState<number | null>(null);
  const [estornando, setEstornando] = useState<Settled | null>(null);

  const utils = trpc.useUtils();
  /*
   * O estorno é o mesmo `toggleStatus` do extrato: aqui todo título está pago,
   * então o botão só desfaz. A etapa anterior fez o toggle limpar o `settledAt`
   * junto, e é isso que tira a linha desta tela — sem limpar, ela voltaria para
   * os abertos e continuaria aparecendo aqui com uma liquidação que não
   * aconteceu mais.
   */
  const estorno = trpc.transactions.toggleStatus.useMutation({
    onSuccess: async (_registro, variables) => {
      const item = items.find(linha => linha.id === variables.id);
      setEstornando(null);
      // As duas telas mudam: o título sai daqui e reaparece nos abertos.
      await Promise.all([utils.settled.overview.invalidate(), utils.payables.overview.invalidate()]);
      toast.success(item ? `"${item.description}" voltou para A pagar e receber` : "Liquidação estornada");
    },
    onError: error => toast.error(error.message),
  });

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const query = trpc.settled.overview.useQuery(period);
  const data = query.data;
  const items = data?.items ?? EMPTY;
  const monthLabel = `${MONTH_LABELS[period.month - 1]} de ${period.year}`;

  const accounts = useMemo(
    () => Array.from(new Set(items.map(item => item.account))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items]
  );
  const categories = useMemo(
    () => Array.from(new Set(items.map(item => item.category))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [items]
  );

  const filtered = useMemo(() => {
    const termo = search.trim().toLowerCase();
    return items.filter(item => {
      const casaBusca = !termo
        || [item.description, item.contact, item.category, item.account].some(v => v.toLowerCase().includes(termo))
        || item.amount.toFixed(2).includes(termo);
      return casaBusca
        && (tab === "tudo" || (tab === "recebidas" ? item.amount > 0 : item.amount < 0))
        && (accountFilter === "todos" || item.account === accountFilter)
        && (categoryFilter === "todos" || item.category === categoryFilter);
    });
  }, [accountFilter, categoryFilter, items, search, tab]);

  /** Se algum filtro está de pé — muda o nome do CSV e o rodapé dos cartões. */
  const filtrosAtivos = Boolean(search.trim()) || tab !== "tudo" || accountFilter !== "todos" || categoryFilter !== "todos";

  /*
   * Os totais do que está na tela, na regra que o item 2.6 fixou: número que
   * descreve o resultado do período segue o filtro, e o total do mês vira a
   * linha de baixo do cartão para não sumir.
   */
  const resumo = useMemo(() => {
    const entradas = filtered.filter(item => item.amount > 0);
    const saidas = filtered.filter(item => item.amount < 0);
    const received = roundCurrency(entradas.reduce((soma, item) => soma + item.amount, 0));
    const paid = roundCurrency(saidas.reduce((soma, item) => soma - item.amount, 0));
    const atrasadas = filtered.filter(item => item.settledAt! > item.transactionDate);
    const dias = filtered.length > 0
      ? filtered.reduce((soma, item) => soma + diasEntre(item.transactionDate, item.settledAt!), 0) / filtered.length
      : null;
    return {
      received, paid,
      receivedCount: entradas.length,
      paidCount: saidas.length,
      moved: roundCurrency(received + paid),
      result: roundCurrency(received - paid),
      lateCount: atrasadas.length,
      averageDelayDays: dias,
      /*
       * Dias com entrada, contados só entre as recebidas.
       *
       * Antes eu contava sobre tudo que estava filtrado, e o cartão de
       * "Recebido" chegava a escrever "0 títulos · 7 dias com movimento" com o
       * filtro em Pagas — a mesma mistura de recortes que o item 2.6 tirou do
       * extrato, refeita aqui.
       */
      settledDays: new Set(entradas.map(item => item.settledAt)).size,
      lastSettledAt: filtered.reduce<string | null>((maior, item) => !maior || item.settledAt! > maior ? item.settledAt! : maior, null),
    };
  }, [filtered]);

  const recebidas = useMemo(() => filtered.filter(item => item.amount > 0), [filtered]);
  const pagas = useMemo(() => filtered.filter(item => item.amount < 0), [filtered]);

  /** Grupos por dia da liquidação, com o líquido de cada dia. */
  const porDia = useMemo(() => {
    const grupos = new Map<string, Settled[]>();
    for (const item of filtered) {
      grupos.set(item.settledAt!, [...(grupos.get(item.settledAt!) ?? []), item]);
    }
    return Array.from(grupos, ([date, linhas]) => ({
      date,
      linhas,
      liquido: roundCurrency(linhas.reduce((soma, item) => soma + item.amount, 0)),
    }));
  }, [filtered]);

  const exportCsv = () => {
    if (filtered.length === 0) {
      return alert(filtrosAtivos
        ? "Nenhum título liquidado corresponde aos filtros."
        : "Não há títulos liquidados neste mês.");
    }
    const header = ["Liquidado em", "Vencimento", "Atraso (dias)", "Título", "Contato", "Categoria", "Conta", "Valor"];
    const linhas = filtered.map(item => [
      item.settledAt, item.transactionDate, diasEntre(item.transactionDate, item.settledAt!),
      item.description, item.contact, item.category, item.account, item.amount.toFixed(2),
    ]);
    const csv = [header, ...linhas].map(l => l.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    // O sufixo declara o recorte, como na exportação de lançamentos: um arquivo
    // com metade do mês dentro não pode chegar no contador parecendo o mês todo.
    anchor.download = `pagas-e-recebidas-${period.year}-${String(period.month).padStart(2, "0")}${filtrosAtivos ? "-filtrado" : ""}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";
  const mesInteiro = (valor: string) => (filtrosAtivos ? `mês inteiro: ${valor}` : undefined);

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={
            <SidebarStatCard
              kicker="Resultado realizado"
              value={data ? formatMoney(data.totals.result) : "—"}
              /* O cartão da barra é sempre o mês, e o rótulo diz isso — como o
                 "resultado de setembro" do extrato, que não precisa de aviso
                 porque se nomeia sozinho. */
              hint={data ? `${contagem(data.totals.receivedCount + data.totals.paidCount)} títulos em ${monthLabel.toLowerCase()}` : monthLabel}
              tone={(data?.totals.result ?? 0) < 0 ? "negative" : "positive"}
            />
          }
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <PageIcon icon={ArrowsUpDownIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Pagas e recebidas</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {data
                  ? `${contagem(items.length)} ${items.length === 1 ? "título liquidado" : "títulos liquidados"} em ${monthLabel.toLowerCase()}`
                  : monthLabel}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-11 min-w-[168px] items-center justify-center rounded-[12px] bg-white px-4 text-[14px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))} className={toolButton}>
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

            <button type="button" aria-label="Exportar títulos liquidados" title="Exportar CSV" onClick={exportCsv} className={toolButton}><DownloadIcon size={17} /></button>
            <HideValuesButton />
            <ProfileMenu />
          </header>

          {query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              Não foi possível carregar os títulos liquidados: {query.error.message}
            </div>
          )}
          {query.isPending && !query.error && (
            <>
              <KpiRowSkeleton />
              <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]">
                <GranafyLoader label="Carregando títulos liquidados…" />
              </div>
            </>
          )}

          {data && (
            <>
              {/* O cartão escuro troca de assunto entre os dois modos, como nos
                  modelos: nas colunas ele mostra o movimentado, na lista o
                  resultado — e o prazo médio entra no lugar do resultado. */}
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                {arrangement === "colunas" ? (
                  <KpiCard
                    highlight
                    label="Movimentado no mês"
                    value={formatMoney(resumo.moved)}
                    hint={`${contagem(resumo.receivedCount + resumo.paidCount)} títulos · ${contagem(resumo.receivedCount)} recebimentos e ${contagem(resumo.paidCount)} pagamentos`}
                    note={mesInteiro(formatMoney(data.totals.moved))}
                  />
                ) : (
                  <KpiCard
                    highlight
                    label="Resultado realizado"
                    value={`${resumo.result < 0 ? "− " : "+ "}${formatMoney(Math.abs(resumo.result))}`}
                    hint={`${formatMoney(resumo.received)} entraram e ${formatMoney(resumo.paid)} saíram do caixa`}
                    note={mesInteiro(formatMoney(data.totals.result))}
                  />
                )}

                <KpiCard
                  label="Recebido"
                  value={formatMoney(resumo.received)}
                  valueClass="text-[#0A7A42]"
                  icon={{ node: <ArrowUpIcon size={15} />, className: "bg-[#DFF6EA] text-[#0A7A42]" }}
                  hint={arrangement === "lista"
                    ? `${contagem(resumo.receivedCount)} títulos · ${contagem(resumo.settledDays)} ${resumo.settledDays === 1 ? "dia com movimento" : "dias com movimento"}`
                    : `${contagem(resumo.receivedCount)} títulos${resumo.lastSettledAt ? ` · último em ${shortDate(resumo.lastSettledAt)}` : ""}`}
                  note={mesInteiro(formatMoney(data.totals.received))}
                />
                <KpiCard
                  label="Pago"
                  value={formatMoney(resumo.paid)}
                  valueClass="text-[#B3261E]"
                  icon={{ node: <ArrowDownIcon size={15} />, className: "bg-[#FDECEA] text-[#B3261E]" }}
                  hint={`${contagem(resumo.paidCount)} títulos · ${resumo.lateCount === 0 ? "nenhum com atraso" : `${contagem(resumo.lateCount)} com atraso`}`}
                  note={mesInteiro(formatMoney(data.totals.paid))}
                />

                {arrangement === "colunas" ? (
                  <KpiCard
                    label="Resultado realizado"
                    value={`${resumo.result < 0 ? "− " : "+ "}${formatMoney(Math.abs(resumo.result))}`}
                    valueClass={resumo.result < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}
                    hint="entrou de fato no caixa"
                    note={mesInteiro(formatMoney(data.totals.result))}
                  />
                ) : (
                  <KpiCard
                    label="Prazo médio"
                    icon={{ node: <ClockIcon size={15} />, className: "bg-[#F1F4F2] text-[#4C6355]" }}
                    /* Nulo e zero são coisas diferentes: mês sem título liquidado
                       não tem prazo, e escrever "0,0 dias" ali pareceria
                       pontualidade em vez de ausência. */
                    value={resumo.averageDelayDays === null ? "—" : `${resumo.averageDelayDays.toFixed(1).replace(".", ",")} dias`}
                    hint={resumo.averageDelayDays === null ? "sem título liquidado no período" : "entre vencimento e liquidação"}
                    note={data.totals.averageDelayDays !== null && filtrosAtivos
                      ? `mês inteiro: ${data.totals.averageDelayDays.toFixed(1).replace(".", ",")} dias`
                      : undefined}
                  />
                )}
              </section>

              {arrangement === "colunas" ? (
                <div className="grid gap-5 lg:grid-cols-2">
                  <ColunaDeTitulos titulo="Recebidas" itens={recebidas} incoming />
                  <ColunaDeTitulos titulo="Pagas" itens={pagas} incoming={false} />
                </div>
              ) : (
                <section className="flex flex-col gap-0.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
                  <div className="flex flex-wrap items-center gap-2.5 pb-4">
                    {([["tudo", "Tudo", filtered.length], ["recebidas", "Recebidas", recebidas.length], ["pagas", "Pagas", pagas.length]] as const).map(([value, label, quantos]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTab(value)}
                        className={`flex items-center gap-[7px] rounded-[11px] px-3.5 py-2.5 text-[13px] transition ${
                          tab === value ? "bg-[#0B1F14] font-bold text-white" : "text-[#4C6355] hover:bg-[#F8FAF9]"
                        }`}
                      >
                        {label}
                        <span className={tab === value ? "opacity-70" : "text-[#8A968D]"}>{contagem(quantos)}</span>
                      </button>
                    ))}

                    <label className="ml-auto flex h-11 w-[280px] items-center gap-2.5 rounded-[12px] bg-[#F8FAF9] px-3.5">
                      <SearchIcon size={15} className="shrink-0 text-[#8A968D]" />
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar título, contato ou valor…"
                        aria-label="Buscar entre os títulos liquidados"
                        className="min-w-0 flex-1 bg-transparent text-[13px] outline-none placeholder:text-[#8A968D]"
                      />
                    </label>

                    <select
                      value={accountFilter}
                      onChange={event => setAccountFilter(event.target.value)}
                      aria-label="Filtrar por conta"
                      className="h-11 rounded-[12px] border border-[#E3EBE6] bg-white px-3 text-[13px] font-semibold text-[#28382E] outline-none"
                    >
                      <option value="todos">Todas as contas</option>
                      {accounts.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                    <select
                      value={categoryFilter}
                      onChange={event => setCategoryFilter(event.target.value)}
                      aria-label="Filtrar por categoria"
                      className="h-11 max-w-[210px] rounded-[12px] border border-[#E3EBE6] bg-white px-3 text-[13px] font-semibold text-[#28382E] outline-none"
                    >
                      <option value="todos">Todas as categorias</option>
                      {categories.map(name => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </div>

                  <div className={`${ROW_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-[#4C6355]`}>
                    <span>Liquidado</span><span>Título</span><span>Contato</span><span>Categoria</span><span>Conta</span><span className="text-right">Valor</span><span />
                  </div>

                  {filtered.length === 0 && (
                    <p className="py-14 text-center text-[13px] text-[#8A968D]">
                      {filtrosAtivos ? "Nenhum título liquidado corresponde aos filtros." : "Nenhum título foi liquidado neste mês."}
                    </p>
                  )}

                  {porDia.map(grupo => (
                    <div key={grupo.date}>
                      <div className="mt-1.5 flex items-center gap-3 border-b border-[#E3EBE6] px-1 pb-2.5 pt-3.5">
                        <span className="text-[12.5px] font-bold tracking-[.02em]">{dayLabel(grupo.date)}</span>
                        <span className="ml-auto text-[12.5px] text-[#4C6355]">líquido do dia</span>
                        <span className={`text-[13.5px] font-bold ${grupo.liquido >= 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
                          {grupo.liquido >= 0 ? "+ " : "− "}{formatMoney(Math.abs(grupo.liquido))}
                        </span>
                      </div>
                      {grupo.linhas.map(item => (
                        <div
                          key={item.id}
                          className={`${ROW_GRID} border-b border-[#F1F4F2] px-1 py-3 text-[13px] transition hover:bg-[#F8FAF9]`}
                          /* Um mês cheio passa de seis mil linhas. O navegador
                             pula o desenho do que está fora da tela e o DOM
                             continua inteiro, então filtro, KPI e exportação
                             seguem lendo o array em memória. */
                          /* Com o menu aberto a otimização sai de cena: `contain`
                             cortaria o balão, que escapa dos limites da linha. */
                          style={menuAberto === item.id ? undefined : { contentVisibility: "auto", containIntrinsicSize: "auto 48px" }}
                        >
                          <span className="text-[#4C6355]">{shortDate(item.settledAt!)}</span>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <SideMark incoming={item.amount > 0} />
                            <span className="truncate text-[13.5px] font-semibold">{item.description}</span>
                          </div>
                          <span className="truncate text-[#4C6355]">{item.contact || "—"}</span>
                          <span className="truncate text-[#28382E]">{item.category}</span>
                          <span className="truncate text-[#4C6355]">{item.account}</span>
                          <span className={`whitespace-nowrap text-right text-[14px] font-bold ${item.amount > 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
                            {item.amount > 0 ? "+ " : "− "}{formatMoney(Math.abs(item.amount))}
                          </span>
                          <RowActions
                            open={menuAberto === item.id}
                            onOpen={() => setMenuAberto(menuAberto === item.id ? null : item.id)}
                            onClose={() => setMenuAberto(null)}
                            onEstornar={() => { setMenuAberto(null); setEstornando(item); }}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </section>
              )}

              {/*
                A barra dos três totais gruda no rodapé da janela.
                Num mês cheio a lista passa de seis mil linhas: sem o sticky, o
                total só aparece para quem rolar até o fim, e o número que
                resume a tela é justamente o que não pode exigir uma viagem.
                É o mesmo comportamento da barra de saldos do extrato.
              */}
              <footer className="sticky bottom-1 z-20 grid grid-cols-1 overflow-hidden rounded-[20px] bg-white shadow-[0_12px_35px_rgba(11,31,20,.12)] ring-1 ring-[#E1E8E3] sm:grid-cols-3">
                <div className="flex items-baseline justify-center gap-2.5 p-5">
                  <span className="text-[14px] text-[#4C6355]">Recebido</span>
                  <strong className="text-[16px] text-[#0A7A42]">{formatMoney(resumo.received)}</strong>
                </div>
                <div className="flex items-baseline justify-center gap-2.5 border-t border-[#E3EBE6] p-5 sm:border-l sm:border-t-0">
                  <span className="text-[14px] text-[#4C6355]">Pago</span>
                  <strong className="text-[16px] text-[#B3261E]">− {formatMoney(resumo.paid)}</strong>
                </div>
                <div className="flex items-baseline justify-center gap-2.5 border-t border-[#E3EBE6] p-5 sm:border-l sm:border-t-0">
                  <span className="text-[14px] text-[#4C6355]">Resultado</span>
                  <strong className={`text-[16px] ${resumo.result < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                    {resumo.result < 0 ? "− " : "+ "}{formatMoney(Math.abs(resumo.result))}
                  </strong>
                </div>
              </footer>

              {/* A nota do rodapé dos modelos, uma por modo. */}
              <p className="text-[13px] leading-relaxed text-[#4C6355]">
                {arrangement === "colunas"
                  ? <>Aqui só entram títulos já liquidados, na data em que o dinheiro entrou ou saiu. O que ainda está aberto fica em <strong className="font-semibold text-[#28382E]">A pagar e receber</strong>.</>
                  : "A data é a da liquidação, não a do vencimento — por isso um título vencido em agosto e pago em setembro aparece aqui em setembro."}
              </p>
            </>
          )}
        </section>
      </div>

      {estornando && (
        <ConfirmarEstorno
          item={estornando}
          pending={estorno.isPending}
          onCancel={() => setEstornando(null)}
          onConfirm={() => estorno.mutate({ id: estornando.id })}
        />
      )}
    </main>
  );
}

/** Uma das duas colunas do modo "duas colunas". */
function ColunaDeTitulos({ titulo, itens, incoming }: { titulo: string; itens: Settled[]; incoming: boolean }) {
  const total = roundCurrency(itens.reduce((soma, item) => soma + Math.abs(item.amount), 0));
  return (
    <section className="flex flex-col gap-0.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] sm:p-6">
      <div className="flex items-center gap-3 pb-3.5">
        <SideMark incoming={incoming} size={38} />
        <div className="flex flex-col">
          <span className="text-[16px] font-bold">{titulo}</span>
          <span className="text-[12.5px] text-[#4C6355]">{contagem(itens.length)} {itens.length === 1 ? "título" : "títulos"}</span>
        </div>
        <span className={`ml-auto whitespace-nowrap text-[20px] font-bold ${incoming ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
          {formatMoney(total)}
        </span>
      </div>

      <div className={`${COLUMN_GRID} border-b border-[#E3EBE6] pb-2 text-[11px] font-semibold uppercase tracking-[.1em] text-[#4C6355]`}>
        <span>Data</span><span>Título</span><span className="text-right">Valor</span>
      </div>

      {itens.length === 0 && (
        <p className="py-12 text-center text-[13px] text-[#8A968D]">Nada liquidado neste recorte.</p>
      )}

      {itens.map(item => (
        <div
          key={item.id}
          className={`${COLUMN_GRID} border-b border-[#F1F4F2] py-3 transition hover:bg-[#F8FAF9]`}
          style={{ contentVisibility: "auto", containIntrinsicSize: "auto 54px" }}
        >
          <span className="text-[13px] text-[#4C6355]">{shortDate(item.settledAt!)}</span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-[13.5px] font-semibold">{item.description}</span>
            <span className="truncate text-[11.5px] text-[#4C6355]">{item.account} · {item.category}</span>
          </div>
          <span className={`whitespace-nowrap text-right text-[14px] font-bold ${incoming ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
            {incoming ? "+ " : "− "}{formatMoney(Math.abs(item.amount))}
          </span>
        </div>
      ))}
    </section>
  );
}

/** Dias inteiros entre duas datas ISO, sem passar por fuso. */
function diasEntre(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
