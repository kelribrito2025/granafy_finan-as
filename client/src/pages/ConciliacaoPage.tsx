import { AppSidebar } from "@/components/AppSidebar";
import { AuroraSurface } from "@/components/AuroraSurface";
import {
  CheckIcon,
  ChevronRightIcon,
  DownloadIcon,
  MenuIcon,
  SearchIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { summarizeBatch } from "@shared/reconciliation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type Overview = inferRouterOutputs<AppRouter>["reconciliation"]["overview"];
type Item = Overview["items"][number];
type Tab = "pendentes" | "sugeridas" | "sem_par" | "conciliadas";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Cores e rótulo de cada situação, como no modelo. */
const STATUS_STYLE: Record<Item["status"], { label: string; chip: string }> = {
  sugerido: { label: "Sugerido", chip: "bg-[#DFF6EA] text-[#0A7A42]" },
  sem_par: { label: "Sem par", chip: "bg-[#FDECEA] text-[#8E1F16]" },
  conciliado: { label: "Conciliado", chip: "bg-[#F1F4F2] text-[#0A7A42]" },
  classificado: { label: "Classificado", chip: "bg-[#FFF3E6] text-[#8A4B00]" },
};

// A data cabe em "dd/mm" e o valor precisa de espaço para "− R$ 1.147,30" sem
// encostar no botão de confirmar.
const ROW_GRID = "grid grid-cols-[30px_minmax(0,1fr)_128px] gap-2.5 lg:grid-cols-[30px_54px_minmax(0,1fr)_minmax(0,1.05fr)_128px_112px]";

function signedMoney(value: number) {
  return value < 0 ? `− ${formatMoney(Math.abs(value))}` : `+ ${formatMoney(value)}`;
}

function Check({ checked, disabled = false, onChange, label }: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md transition ${
        disabled
          ? "cursor-not-allowed border border-[#E3EBE6] opacity-45"
          : checked
            ? "bg-[#12B85C] text-white"
            : "border border-[#C9D4CD] hover:border-[#12B85C]"
      }`}
    >
      {checked && !disabled && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
}

function KpiCard({ label, value, hint, valueClass, children }: {
  label: string;
  value: string;
  hint?: string;
  valueClass?: string;
  children?: React.ReactNode;
}) {
  return (
    <article className="flex flex-col gap-2.5 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
      <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]">{label}</span>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${valueClass ?? ""}`}>{value}</strong>
      {children}
      {hint && <span className="text-[12.5px] text-[#4C6355]">{hint}</span>}
    </article>
  );
}

/** A barra escura que aparece quando há seleção. */
function BatchBar({ items, onConfirm, pending }: {
  items: Item[];
  onConfirm: () => void;
  pending: boolean;
}) {
  const resumo = summarizeBatch(items.map(item => item.amount));
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[16px] bg-[#0B1F14] px-4 py-3 text-white">
      <span className="flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-md bg-[#12B85C]">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" aria-hidden="true">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
      <span className="text-[13.5px] font-bold">
        {resumo.count} {resumo.count === 1 ? "movimentação selecionada" : "movimentações selecionadas"}
      </span>
      <span className="text-[12.5px] text-[#C5DACE]">
        {resumo.incomingCount} {resumo.incomingCount === 1 ? "entrada" : "entradas"} e{" "}
        {resumo.outgoingCount} {resumo.outgoingCount === 1 ? "saída" : "saídas"} · líquido {signedMoney(resumo.net)}
      </span>
      <button
        type="button"
        disabled={pending}
        onClick={onConfirm}
        className="ml-auto flex h-[38px] items-center gap-2 rounded-[11px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-60"
      >
        <CheckIcon size={14} />
        {pending ? "Conciliando…" : "Conciliar selecionados"}
      </button>
    </div>
  );
}

function ConfirmBatchModal({ items, onClose, onConfirm, pending }: {
  items: Item[];
  onClose: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  const resumo = summarizeBatch(items.map(item => item.amount));
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#0B1F14]/[.42] p-6 sm:p-10">
      <div className="flex w-full max-w-[452px] flex-col gap-5 rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.24)]">
        <div>
          <h2 className="text-[18px] font-bold">
            Conciliar {resumo.count} {resumo.count === 1 ? "movimentação" : "movimentações"}?
          </h2>
          <p className="mt-1 text-[13px] text-[#4C6355]">os lançamentos ficam marcados como conferidos</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1 rounded-[14px] bg-[#F8FAF9] p-3.5">
            <span className="text-[12px] text-[#4C6355]">
              {resumo.incomingCount} {resumo.incomingCount === 1 ? "entrada" : "entradas"}
            </span>
            <span className="text-[15px] font-bold text-[#0A7A42]">{signedMoney(resumo.incoming)}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-[14px] bg-[#F8FAF9] p-3.5">
            <span className="text-[12px] text-[#4C6355]">
              {resumo.outgoingCount} {resumo.outgoingCount === 1 ? "saída" : "saídas"}
            </span>
            <span className="text-[15px] font-bold text-[#B3261E]">{signedMoney(resumo.outgoing)}</span>
          </div>
        </div>

        <div className="flex items-baseline justify-between rounded-[14px] bg-[#F1FBF6] px-4 py-3.5">
          <span className="text-[13px] text-[#4C6355]">Valor líquido do lote</span>
          <span className={`text-[16px] font-bold ${resumo.net < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
            {signedMoney(resumo.net)}
          </span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-[14px] border border-[#E3EBE6] p-4">
          <span className="text-[12.5px] font-bold">O que vai acontecer</span>
          <span className="text-[12.5px] leading-relaxed text-[#4C6355]">
            As {resumo.count} movimentações passam a “Conciliado” e entram no saldo conferido.
            Conciliar o lote não altera a diferença de saldo — ela só muda quando a movimentação
            que a causa for resolvida.
          </span>
        </div>

        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]"
          >
            Revisar item a item
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-11 flex-1 rounded-xl bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-60"
          >
            {pending ? "Conciliando…" : `Conciliar ${resumo.count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ConciliacaoPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("pendentes");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchModal, setBatchModal] = useState(false);

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const query = trpc.reconciliation.overview.useQuery({ ...period, accountId });
  const utils = trpc.useUtils();

  const refresh = async () => {
    setSelected(new Set());
    await Promise.all([
      utils.reconciliation.overview.invalidate(),
      utils.transactions.invalidate(),
    ]);
  };

  const confirm = trpc.reconciliation.confirm.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Movimentação conciliada."); },
    onError: error => toast.error(error.message),
  });
  const confirmBatch = trpc.reconciliation.confirmBatch.useMutation({
    onSuccess: async result => {
      setBatchModal(false);
      await refresh();
      toast.success(
        result.puladas > 0
          ? `${result.conciliadas} conciliadas · ${result.puladas} sem sugestão válida`
          : `${result.conciliadas} ${result.conciliadas === 1 ? "movimentação conciliada" : "movimentações conciliadas"}`
      );
    },
    onError: error => toast.error(error.message),
  });

  const data = query.data;
  const monthLabel = `${MONTH_LABELS[period.month - 1]} de ${period.year}`;

  const visible = useMemo(() => {
    if (!data) return [] as Item[];
    const term = search.trim().toLowerCase();
    return data.items.filter(item => {
      if (tab === "pendentes" && item.status !== "sugerido" && item.status !== "sem_par") return false;
      if (tab === "sugeridas" && item.status !== "sugerido") return false;
      if (tab === "sem_par" && item.status !== "sem_par") return false;
      if (tab === "conciliadas" && item.status !== "conciliado") return false;
      if (!term) return true;
      return `${item.description} ${item.contact}`.toLowerCase().includes(term);
    });
  }, [data, search, tab]);

  const selectableIds = visible.filter(item => item.status === "sugerido").map(item => item.id);
  const selectedItems = (data?.items ?? []).filter(item => selected.has(item.id));
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const exportCsv = () => {
    if (!data || data.items.length === 0) return toast.info("Não há movimentações para exportar.");
    const header = ["Data", "Descrição no extrato", "Valor", "Situação", "Lançamento", "Motivo"];
    const rows = data.items.map(item => [
      item.movementDate,
      item.description,
      item.amount.toFixed(2),
      STATUS_STYLE[item.status].label,
      item.linkedTransaction?.description ?? item.suggestion?.description ?? "",
      item.suggestion?.label ?? "",
    ]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(";")).join("\n");
    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `conciliacao-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";

  const tabs: Array<{ key: Tab; label: string; count: number; danger?: boolean }> = data
    ? [
        { key: "pendentes", label: "Pendentes", count: data.counts.pendentes },
        { key: "sugeridas", label: "Sugeridas", count: data.counts.sugeridos },
        { key: "sem_par", label: "Sem par", count: data.counts.semPar, danger: true },
        { key: "conciliadas", label: "Conciliadas", count: data.counts.conciliados },
      ]
    : [];

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><MenuIcon size={18} /></button>
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Conciliação bancária</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {data ? `fila de revisão · ${data.counts.pendentes} ${data.counts.pendentes === 1 ? "item pendente" : "itens pendentes"}` : monthLabel}
              </p>
            </div>

            {data && data.accounts.length > 0 && (
              <label className="flex h-11 items-center gap-2 rounded-[12px] bg-white px-3.5 text-[14px] font-bold ring-1 ring-[#DFE6E1]">
                <span className="sr-only">Conta bancária</span>
                <select
                  value={data.account.id}
                  onChange={event => { setAccountId(Number(event.target.value)); setSelected(new Set()); }}
                  className="max-w-[180px] bg-transparent text-[14px] font-bold outline-none"
                >
                  {data.accounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>
              </label>
            )}

            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Mês anterior" onClick={() => { setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1)); setSelected(new Set()); }} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-11 min-w-[168px] items-center justify-center rounded-[12px] bg-white px-4 text-[14px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => { setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1)); setSelected(new Set()); }} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <button type="button" aria-label="Exportar conciliação" title="Exportar CSV" onClick={exportCsv} className={toolButton}><DownloadIcon size={17} /></button>
            <ProfileMenu />
          </header>

          {query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              {query.error.message}
            </div>
          )}
          {query.isPending && !query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#4C6355] ring-1 ring-[#E1E8E3]">Carregando o extrato…</div>
          )}

          {data && (
            <>
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard label="Progresso do mês" value={`${data.progress}%`}>
                  <span className="block h-2 overflow-hidden rounded-full bg-[#EDF2EE]">
                    <span className="block h-full rounded-full bg-[#12B85C]" style={{ width: `${data.progress}%` }} />
                  </span>
                </KpiCard>
                <KpiCard
                  label="Sugestões automáticas"
                  value={String(data.counts.sugeridos)}
                  valueClass="text-[#0A7A42]"
                  hint="prontas para confirmar em lote"
                />
                <KpiCard
                  label="Sem correspondência"
                  value={String(data.counts.semPar)}
                  valueClass="text-[#B3261E]"
                  hint="precisam de decisão manual"
                />
                <AuroraSurface className="rounded-[20px] p-6">
                  <div className="flex flex-1 flex-col gap-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Diferença de saldo</span>
                    <strong className="text-[26px] font-bold tracking-[-.02em] text-[#7EE2A8]">
                      {data.balance.difference === null ? "—" : formatMoney(Math.abs(data.balance.difference))}
                    </strong>
                    <span className="text-[12.5px] text-[#C5DACE]">
                      {data.balance.statement === null
                        ? "o extrato importado não declara saldo"
                        : `banco ${formatMoney(data.balance.statement)} · sistema ${formatMoney(data.balance.system)}`}
                    </span>
                  </div>
                </AuroraSurface>
              </section>

              <section className="flex flex-col items-start gap-5 xl:flex-row">
                <div className="flex min-w-0 flex-1 flex-col rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                  <div className="flex flex-wrap items-center gap-2.5 pb-4">
                    <div className="flex flex-wrap items-stretch rounded-[11px] bg-[#F1F4F2] p-[3px]">
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
                    <label className="relative ml-auto w-full sm:w-[250px]">
                      <SearchIcon size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8A968D]" />
                      <input
                        value={search}
                        onChange={event => setSearch(event.target.value)}
                        placeholder="Buscar no extrato…"
                        className="h-10 w-full rounded-[11px] border border-[#E3EBE6] bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[#12B85C]"
                      />
                    </label>
                  </div>

                  {selectedItems.length > 0 && (
                    <BatchBar
                      items={selectedItems}
                      pending={confirmBatch.isPending}
                      onConfirm={() => setBatchModal(true)}
                    />
                  )}

                  <div className={`${ROW_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]`}>
                    <span>
                      {selectableIds.length > 0 && (
                        <Check
                          checked={allSelected}
                          label="Selecionar todas as sugeridas"
                          onChange={() => setSelected(current => {
                            if (selectableIds.every(id => current.has(id))) return new Set();
                            return new Set(selectableIds);
                          })}
                        />
                      )}
                    </span>
                    <span className="hidden lg:block">Data</span>
                    <span className="truncate">Descrição no extrato</span>
                    <span className="hidden truncate lg:block">Lançamento sugerido e situação</span>
                    <span className="text-right">Valor</span>
                    <span className="hidden lg:block" />
                  </div>

                  {visible.length === 0 ? (
                    <p className="py-10 text-center text-[13.5px] text-[#4C6355]">
                      Nenhuma movimentação nesta seleção.
                    </p>
                  ) : (
                    visible.map(item => {
                      const style = STATUS_STYLE[item.status];
                      const conciliada = item.status === "conciliado";
                      return (
                        <div
                          key={item.id}
                          className={`${ROW_GRID} items-center border-b border-[#F1F4F2] px-1 py-[11px] transition ${
                            selected.has(item.id) ? "bg-[#F1FBF6]" : "hover:bg-[#F8FAF9]"
                          }`}
                        >
                          <Check
                            checked={selected.has(item.id)}
                            disabled={item.status !== "sugerido"}
                            label={`Selecionar ${item.description}`}
                            onChange={() => toggle(item.id)}
                          />
                          <span
                            title={formatDate(item.movementDate)}
                            className="hidden whitespace-nowrap text-[13px] text-[#4C6355] lg:block"
                          >
                            {item.movementDate.slice(8, 10)}/{item.movementDate.slice(5, 7)}
                          </span>
                          <div className="min-w-0">
                            <span className="block truncate text-[13.5px] font-semibold" title={item.description}>
                              {item.description}
                            </span>
                            <span className="block truncate text-[11px] text-[#4C6355] lg:hidden">
                              {formatDate(item.movementDate)} · {style.label}
                            </span>
                          </div>
                          <div className="hidden min-w-0 flex-col gap-[3px] lg:flex">
                            <span className="truncate text-[13px]" title={item.linkedTransaction?.description ?? item.suggestion?.description ?? ""}>
                              {item.linkedTransaction?.description ?? item.suggestion?.description ?? "—"}
                            </span>
                            <span className="flex min-w-0 items-center gap-[7px]">
                              <span className={`shrink-0 rounded-[5px] px-[7px] py-[2px] text-[10.5px] font-semibold ${style.chip}`}>
                                {style.label}
                              </span>
                              <span className="truncate text-[11px] text-[#4C6355]">
                                {item.suggestion?.label
                                  ?? (conciliada
                                    ? item.reconciledAt ? `desde ${formatDate(new Date(item.reconciledAt).toISOString().slice(0, 10))}` : "conferido"
                                    : "classifique para fechar o saldo")}
                              </span>
                            </span>
                          </div>
                          <span className={`whitespace-nowrap text-right text-[14.5px] font-bold ${item.amount < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                            {signedMoney(item.amount)}
                          </span>
                          <span className="hidden justify-self-end lg:block">
                            {item.suggestion && (
                              <button
                                type="button"
                                disabled={confirm.isPending}
                                onClick={() => confirm.mutate({
                                  movementId: item.id,
                                  transactionId: item.suggestion!.transactionId,
                                  origin: "sugestao",
                                })}
                                className="flex h-8 items-center gap-1.5 rounded-[10px] bg-[#F1FBF6] px-2.5 text-[12px] font-semibold text-[#0A7A42] transition hover:bg-[#DFF6EA] disabled:opacity-50"
                              >
                                <CheckIcon size={13} />
                                Confirmar
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[340px]">
                  <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                    <span className="text-[15px] font-bold">Regras de conciliação</span>
                    {data.rules.length === 0 ? (
                      <p className="text-[12.5px] leading-relaxed text-[#4C6355]">
                        Nenhuma regra cadastrada. As regras de categoria de Contas e categorias também
                        explicam sugestões aqui.
                      </p>
                    ) : (
                      data.rules.slice(0, 4).map(rule => (
                        <div key={rule.id} className="flex flex-col gap-0.5 rounded-[14px] bg-[#F8FAF9] px-3.5 py-3">
                          <span className="truncate text-[12.5px] text-[#4C6355]">
                            Extrato contém <span className="font-semibold text-[#0B1F14]">“{rule.matchValue}”</span>
                          </span>
                          <span className="truncate text-[12.5px] font-semibold text-[#0A7A42]">{rule.category}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                    <span className="text-[15px] font-bold">Diferença de saldo</span>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#4C6355]">Saldo no banco</span>
                      <span className="font-bold">{data.balance.statement === null ? "—" : formatMoney(data.balance.statement)}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[#4C6355]">Saldo no GranaFy</span>
                      <span className="font-bold">{formatMoney(data.balance.system)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#F1F4F2] pt-3 text-[13px]">
                      <span className="text-[#4C6355]">Diferença</span>
                      <span className={`font-bold ${data.balance.difference ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                        {data.balance.difference === null ? "—" : formatMoney(Math.abs(data.balance.difference))}
                      </span>
                    </div>
                    <p className="text-[11.5px] leading-relaxed text-[#4C6355]">
                      {data.balance.statement === null
                        ? "Importe um extrato OFX que declare o saldo para o GranaFy poder comparar."
                        : `Saldo do banco em ${formatDate(data.balance.statementDate!)}, contra o que está pago na conta até a mesma data.`}
                    </p>
                  </div>

                </aside>
              </section>

              <p className="text-[12px] text-[#4C6355]">
                Sugestão só aparece com o valor batendo ao centavo, na mesma conta e com no máximo três
                dias de diferença. Nada é conciliado sem confirmação.
              </p>
            </>
          )}
        </section>
      </div>

      {batchModal && selectedItems.length > 0 && (
        <ConfirmBatchModal
          items={selectedItems}
          pending={confirmBatch.isPending}
          onClose={() => setBatchModal(false)}
          onConfirm={() => confirmBatch.mutate({ movementIds: selectedItems.map(item => item.id) })}
        />
      )}
    </main>
  );
}
