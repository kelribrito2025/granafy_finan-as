import { Hint } from "@/components/Hint";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { KpiRowSkeleton, SplitChartSkeleton, TableSkeleton } from "@/components/PageSkeleton";
import { ChartDot } from "@/components/ChartDot";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ChevronRightIcon,
  DownloadIcon,
  SidebarMenuIcon,
  TrendUpIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";

type View = "dia" | "semana" | "mes";
type Outputs = inferRouterOutputs<AppRouter>["cashflow"];
type DailyData = Outputs["daily"];
type MonthlyData = Outputs["monthly"];

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** Cartão do pé do menu com o dia mais baixo da projeção. */
function LowestBalanceCard({ lowest }: { lowest: { date: string; balance: number } }) {
  return (
    <SidebarStatCard
      tone={lowest.balance < 0 ? "negative" : "positive"}
      kicker="Menor saldo previsto"
      value={formatMoney(lowest.balance)}
      hint={`em ${formatDate(lowest.date)}`}
    />
  );
}

function signedMoney(value: number) {
  return value < 0 ? `− ${formatMoney(Math.abs(value))}` : `+ ${formatMoney(value)}`;
}

/** Dia sem entrada (ou sem saída) mostra travessão: "+ R$ 0,00" é ruído. */
function amountOrDash(value: number, sign: "+" | "−") {
  return value === 0 ? "—" : `${sign} ${formatMoney(value)}`;
}

/**
 * A curva de saldo: uma linha cheia para o que já aconteceu e uma tracejada para
 * a projeção, emendadas no dia de hoje.
 */
function BalanceCurve({ data }: { data: DailyData }) {
  const points = [
    { balance: data.opening, realized: true, date: data.start },
    ...data.buckets.map(bucket => ({ balance: bucket.balance, realized: bucket.realized, date: bucket.date })),
  ];
  if (points.length < 2) {
    return <p className="py-10 text-center text-[13px] text-[#4C6355]">Sem movimento no período para desenhar a curva.</p>;
  }

  const values = points.map(point => point.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = 600 / (points.length - 1);
  const at = (index: number) => ({
    x: index * stepX,
    y: 180 - ((points[index].balance - min) / span) * 160 - 10,
  });

  const lastRealized = points.reduce((last, point, index) => (point.realized ? index : last), 0);
  const path = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, offset) => {
      const { x, y } = at(from + offset);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");

  const realizedPath = path(0, lastRealized);
  const projectedPath = lastRealized < points.length - 1 ? path(lastRealized, points.length - 1) : "";
  const areaOf = (line: string, fromX: number, toX: number) => `${fromX},180 ${line} ${toX},180`;

  return (
    <>
      <div className="relative h-[180px] border-b border-l border-[#E3EBE6]">
        <svg viewBox="0 0 600 180" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <polygon points={areaOf(realizedPath, 0, at(lastRealized).x)} fill="#12B85C" opacity=".14" />
          <polyline points={realizedPath} fill="none" stroke="#12B85C" strokeWidth="3" />
          {projectedPath && (
            <>
              <polygon points={areaOf(projectedPath, at(lastRealized).x, 600)} fill="#12B85C" opacity=".07" />
              <polyline points={projectedPath} fill="none" stroke="#9BE3BC" strokeWidth="3" strokeDasharray="7 6" />
              <line x1={at(lastRealized).x} y1="0" x2={at(lastRealized).x} y2="180" stroke="#E3EBE6" strokeWidth="2" />
            </>
          )}
        </svg>
        <ChartDot
          x={at(points.length - 1).x}
          y={at(points.length - 1).y}
          width={600}
          height={180}
          size={10}
          color="#12B85C"
        />
      </div>
      <div className="flex text-[11.5px] font-semibold uppercase tracking-[.06em] text-[#4C6355]">
        {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
          const point = points[Math.min(points.length - 1, Math.round(fraction * (points.length - 1)))];
          return (
            <span key={fraction} className={`flex-1 ${fraction === 1 ? "text-right" : ""}`}>
              {point.date.slice(8, 10)}/{point.date.slice(5, 7)}
            </span>
          );
        })}
      </div>
    </>
  );
}

const FLOW_GRID = "grid grid-cols-[minmax(0,1fr)_110px] gap-3 sm:grid-cols-[92px_minmax(0,1fr)_120px_120px_140px] lg:grid-cols-[96px_minmax(0,1fr)_140px_140px_150px_110px]";

function DailyTable({ data }: { data: DailyData }) {
  const peak = Math.max(...data.buckets.map(bucket => Math.abs(bucket.balance)), 1);
  const unit = data.granularity === "semana" ? "semanas" : "dias";

  return (
    <>
      <div className={`${FLOW_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]`}>
        <span className="hidden sm:block">{data.granularity === "semana" ? "Semana" : "Dia"}</span>
        <span className="sm:col-start-2">Situação</span>
        <span className="hidden text-right sm:block">Entradas</span>
        <span className="hidden text-right sm:block">Saídas</span>
        <span className="text-right">Saldo final</span>
        <span className="hidden lg:block" />
      </div>

      {data.buckets.length === 0 ? (
        <p className="py-10 text-center text-[13.5px] text-[#4C6355]">Nenhum movimento em {data.label.toLowerCase()}.</p>
      ) : (
        data.buckets.map(bucket => (
          <div key={bucket.date} className={`${FLOW_GRID} items-center border-b border-[#F1F4F2] px-1 py-[11px] transition hover:bg-[#F8FAF9]`}>
            <span className={`hidden text-[13px] font-semibold sm:block ${bucket.realized ? "text-[#0B1F14]" : "text-[#4C6355]"}`}>{bucket.label}</span>
            <div className="min-w-0">
              <span className="block text-[13px] text-[#4C6355]">
                <span className="font-semibold sm:hidden">{bucket.label} · </span>
                {bucket.realized ? "realizado" : "projetado"}
              </span>
              <span className="block text-[12px] text-[#4C6355] sm:hidden">
                <span className="text-[#0A7A42]">{amountOrDash(bucket.incoming, "+")}</span>
                {" · "}
                <span className="text-[#B3261E]">{amountOrDash(bucket.outgoing, "−")}</span>
              </span>
            </div>
            <span className={`hidden text-right text-[13.5px] font-semibold sm:block ${bucket.incoming === 0 ? "text-[#4C6355]" : "text-[#0A7A42]"}`}>
              {amountOrDash(bucket.incoming, "+")}
            </span>
            <span className={`hidden text-right text-[13.5px] font-semibold sm:block ${bucket.outgoing === 0 ? "text-[#4C6355]" : "text-[#B3261E]"}`}>
              {amountOrDash(bucket.outgoing, "−")}
            </span>
            <span className="text-right text-[14px] font-bold">{formatMoney(bucket.balance)}</span>
            <span className="hidden h-2 overflow-hidden rounded-full bg-[#EDF2EE] lg:block">
              <span
                className={`block h-full rounded-full ${bucket.realized ? "bg-[#12B85C]" : "bg-[#9BE3BC]"}`}
                style={{ width: `${Math.max(3, (Math.abs(bucket.balance) / peak) * 100)}%` }}
              />
            </span>
          </div>
        ))
      )}

      <div className={`${FLOW_GRID} -mx-2 mt-1.5 items-center rounded-[14px] bg-[#F1FBF6] px-3 py-3.5`}>
        <span className="hidden text-[14px] font-bold text-[#0A7A42] sm:block">{data.label.split(" de ")[0]}</span>
        <span className="text-[13px] text-[#4C6355] sm:col-start-2">
          <span className="font-bold text-[#0A7A42] sm:hidden">{data.label.split(" de ")[0]} · </span>
          {data.buckets.length} {unit} com movimento
        </span>
        <span className="hidden text-right text-[14px] font-bold text-[#0A7A42] sm:block">+ {formatMoney(data.totals.incoming)}</span>
        <span className="hidden text-right text-[14px] font-bold text-[#B3261E] sm:block">− {formatMoney(data.totals.outgoing)}</span>
        <span className="text-right text-[15px] font-bold text-[#0A7A42]">{formatMoney(data.closing)}</span>
        <span className="hidden lg:block" />
      </div>
    </>
  );
}

function AlertCard({ tone, title, detail, value }: {
  tone: "positive" | "negative";
  title: string;
  detail: string;
  value: string;
}) {
  const positive = tone === "positive";
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3.5 rounded-[20px] bg-white px-6 py-5 ring-1 ring-[#E1E8E3]">
      <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] ${positive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FDECEA] text-[#B3261E]"}`}>
        {positive ? (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
        ) : (
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L14.7 3.9a2 2 0 00-3.4 0z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[13.5px] font-bold">{title}</span>
        <span className="truncate text-[12.5px] text-[#4C6355]" title={detail}>{detail}</span>
      </div>
      <span className={`shrink-0 text-[17px] font-bold ${positive ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>{value}</span>
    </div>
  );
}

type MonthlyRow = { key: string; label: string; kind: "grupo" | "item" | "faixa" | "resultado"; values: number[] };

function buildMonthlyRows(data: MonthlyData): MonthlyRow[] {
  const collect = (pick: (column: MonthlyData["columns"][number]) => Array<{ label: string; value: number }>) => {
    const labels: string[] = [];
    for (const column of data.columns) {
      for (const root of pick(column)) if (!labels.includes(root.label)) labels.push(root.label);
    }
    return labels.map(label => ({
      key: label,
      label,
      kind: "item" as const,
      values: data.columns.map(column => pick(column).find(root => root.label === label)?.value ?? 0),
    }));
  };

  const sortByTotal = (rows: MonthlyRow[]) =>
    [...rows].sort((left, right) =>
      right.values.reduce((sum, value) => sum + value, 0) - left.values.reduce((sum, value) => sum + value, 0)
    );

  return [
    { key: "abertura", label: "Saldo inicial", kind: "faixa", values: data.columns.map(column => column.opening) },
    { key: "entradas", label: "Entradas", kind: "grupo", values: data.columns.map(column => column.incoming) },
    ...sortByTotal(collect(column => column.incomingByRoot)).map(row => ({ ...row, key: `in/${row.key}` })),
    { key: "saidas", label: "Saídas", kind: "grupo", values: data.columns.map(column => column.outgoing) },
    ...sortByTotal(collect(column => column.outgoingByRoot)).map(row => ({ ...row, key: `out/${row.key}` })),
    { key: "resultado", label: "Resultado do mês", kind: "faixa", values: data.columns.map(column => column.result) },
    { key: "fechamento", label: "Saldo final", kind: "resultado", values: data.columns.map(column => column.closing) },
  ];
}

const MONTHLY_STYLE: Record<MonthlyRow["kind"], { row: string; label: string; value: string }> = {
  grupo: { row: "py-3 border-b border-[#E3EBE6]", label: "text-[14px] font-bold text-[#0B1F14]", value: "text-[14px] font-semibold text-[#0B1F14]" },
  item: { row: "py-2.5 pl-5 border-b border-[#F1F4F2]", label: "text-[13.5px] text-[#28382E]", value: "text-[13.5px] text-[#28382E]" },
  faixa: { row: "mt-1.5 rounded-[14px] bg-[#F8FAF9] py-3", label: "text-[14px] font-bold text-[#0B1F14]", value: "text-[14px] font-semibold text-[#0B1F14]" },
  resultado: { row: "mt-1.5 rounded-[14px] bg-[#F1FBF6] py-3.5", label: "text-[15px] font-bold text-[#0A7A42]", value: "text-[15px] font-semibold text-[#0A7A42]" },
};

function MonthlyTable({ data }: { data: MonthlyData }) {
  const rows = buildMonthlyRows(data);
  const monthWidth = data.columns.length > 6 ? 96 : 108;
  const labelWidth = 200;
  const gap = 10;
  const grid = {
    display: "grid",
    gridTemplateColumns: `minmax(${labelWidth}px, 1fr) repeat(${data.columns.length}, ${monthWidth}px)`,
    gap: `${gap}px`,
  } as const;

  return (
    <div className="-mx-2 overflow-x-auto px-2">
      <div style={{ minWidth: labelWidth + data.columns.length * (monthWidth + gap) }}>
        <div style={grid} className="border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]">
          <span>Conta</span>
          {data.columns.map(column => (
            <span key={`${column.year}-${column.month}`} className={`text-right ${column.projected ? "opacity-70" : "text-[#0B1F14]"}`}>
              {column.label}
            </span>
          ))}
        </div>

        {rows.map(row => {
          const style = MONTHLY_STYLE[row.kind];
          const faixa = row.kind === "faixa" || row.kind === "resultado";
          return (
            <div key={row.key} style={grid} className={`items-center px-1 ${style.row} ${faixa ? "-mx-2 px-3" : ""}`}>
              <span className={`min-w-0 truncate ${style.label}`} title={row.label}>{row.label}</span>
              {row.values.map((value, index) => {
                const saida = row.key === "saidas" || row.key.startsWith("out/");
                const vazio = value === 0 && (saida || row.key === "entradas" || row.key.startsWith("in/"));
                return (
                  <span
                    key={data.columns[index].label + index}
                    className={`text-right ${style.value} ${data.columns[index].projected ? "opacity-70" : ""} ${
                      vazio ? "text-[#8A968D]" : saida ? "text-[#B3261E]" : ""
                    }`}
                  >
                    {vazio
                      ? "—"
                      : saida
                        ? `− ${formatMoney(value)}`
                        : row.key === "resultado"
                          ? signedMoney(value)
                          : formatMoney(value)}
                  </span>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FluxoCaixaPage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [view, setView] = useState<View>("dia");

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const dailyQuery = trpc.cashflow.daily.useQuery(
    { ...period, granularity: view === "semana" ? "semana" : "dia" },
    { enabled: view !== "mes" }
  );
  const monthlyQuery = trpc.cashflow.monthly.useQuery({ ...period, span: 6 }, { enabled: view === "mes" });

  const daily = dailyQuery.data;
  const monthly = monthlyQuery.data;
  const monthLabel = `${MONTH_LABELS[period.month - 1]} de ${period.year}`;
  const loading = view === "mes" ? monthlyQuery.isPending : dailyQuery.isPending;
  const error = view === "mes" ? monthlyQuery.error : dailyQuery.error;

  const exportCsv = () => {
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    let csv = "";
    let name = "";

    if (view === "mes") {
      if (!monthly) return toast.info("Aguarde o carregamento da projeção.");
      const header = ["Conta", ...monthly.columns.map(column => `${column.label}/${String(column.year).slice(2)}${column.projected ? " (proj.)" : ""}`)];
      const body = buildMonthlyRows(monthly).map(row => [row.label, ...row.values.map(value => value.toFixed(2))]);
      csv = [header, ...body].map(row => row.map(quote).join(";")).join("\n");
      name = `fluxo-de-caixa-mensal-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    } else {
      if (!daily) return toast.info("Aguarde o carregamento do fluxo.");
      const header = ["Período", "Situação", "Entradas", "Saídas", "Saldo final"];
      const body = daily.buckets.map(bucket => [
        bucket.date,
        bucket.realized ? "realizado" : "projetado",
        bucket.incoming.toFixed(2),
        bucket.outgoing.toFixed(2),
        bucket.balance.toFixed(2),
      ]);
      csv = [header, ...body].map(row => row.map(quote).join(";")).join("\n");
      name = `fluxo-de-caixa-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    }

    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={daily?.lowest ? <LowestBalanceCard lowest={daily.lowest} /> : undefined}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={TrendUpIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Fluxo de caixa</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {view === "mes" && monthly ? `projeção de ${monthly.from} a ${monthly.to}` : `realizado e projetado · ${monthLabel.toLowerCase()}`}
              </p>
            </div>

            {/* O mês vem logo depois do título, como em Lançamentos: é o
                mesmo controle, e ficar num lugar em cada tela obriga a
                procurá-lo de novo a cada troca de página. As medidas são as de
                lá: todo cabeçalho segue a escala de Lançamentos (h-10). */}
            <div className="order-3 mx-auto flex w-full items-center justify-center gap-1.5 lg:order-none lg:w-auto">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-10 min-w-[174px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <div className="flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1]">
              {([["dia", "Diário"], ["semana", "Semanal"], ["mes", "Mensal"]] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setView(value)}
                  className={`flex items-center px-[15px] text-[13px] transition ${view === value ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <Hint label="Exportar CSV"><button type="button" aria-label="Exportar fluxo" onClick={exportCsv} className={toolButton}><DownloadIcon size={17} /></button></Hint>
            <ProfileMenu />
          </header>

          {error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              Não foi possível carregar o fluxo de caixa: {error.message}
            </div>
          )}
          {/*
            O esqueleto segue a VISÃO, porque as duas telas desta página têm
            formas diferentes: diária e semanal abrem com o cartão do saldo ao
            lado da curva, mais dois avisos e a tabela; mensal abre com quatro
            cartões e vai direto para a tabela — não tem gráfico nenhum.
            
            O de antes era três KPIs e um gráfico largo, que é a forma de
            nenhuma das duas.
          */}
          {loading && !error && (view === "mes" ? (
            <>
              <KpiRowSkeleton cards={4} />
              <TableSkeleton />
            </>
          ) : (
            <>
              <SplitChartSkeleton />
              <KpiRowSkeleton cards={2} colunas={2} />
              <TableSkeleton />
            </>
          ))}

          {view !== "mes" && daily && (
            <>
              <section className="flex flex-col gap-5 lg:flex-row">
                <AuroraSurface className="w-full shrink-0 rounded-[20px] p-6 lg:w-[340px]">
                  <div className="flex flex-1 flex-col gap-2.5">
                    <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Saldo de hoje</span>
                    <span className="text-[36px] font-bold leading-none tracking-[-.03em]">{formatMoney(daily.cashToday)}</span>
                    <span className={`text-[12.5px] font-semibold ${daily.monthChange < 0 ? "text-[#F4A497]" : "text-[#7EE2A8]"}`}>
                      {signedMoney(daily.monthChange)} no mês
                    </span>
                    <div className="mt-3 flex flex-col gap-2.5 border-t border-[#1F3D2B] pt-3.5 text-[12.5px]">
                      <div className="flex justify-between gap-3">
                        <span className="text-[#C5DACE]">Previsto em {formatDate(daily.end)}</span>
                        <span className="font-bold">{formatMoney(daily.closing)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="truncate text-[#C5DACE]">Previsto em {daily.nextMonthLabel.split(" de ")[0]}</span>
                        <span className="font-bold">{formatMoney(daily.nextMonthClosing)}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span className="text-[#C5DACE]">Menor saldo do período</span>
                        <span className="font-bold text-[#7EE2A8]">{daily.lowest ? formatMoney(daily.lowest.balance) : "—"}</span>
                      </div>
                    </div>
                  </div>
                </AuroraSurface>

                <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="text-[15px] font-bold">Saldo dia a dia</span>
                    <span className="text-[12.5px] text-[#4C6355]">realizado até {formatDate(daily.today)} · projetado a partir dos pendentes</span>
                    <span className="ml-auto flex gap-3.5 text-[12px] text-[#4C6355]">
                      <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded-sm bg-[#12B85C]" />Realizado</span>
                      <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded-sm bg-[#9BE3BC]" />Projetado</span>
                    </span>
                  </div>
                  <BalanceCurve data={daily} />
                </div>
              </section>

              {(daily.biggestIncome || daily.tightestDay) && (
                <section className="flex flex-col gap-5 lg:flex-row">
                  {daily.biggestIncome && (
                    <AlertCard
                      tone="positive"
                      title="Maior entrada do mês"
                      detail={`${daily.biggestIncome.description} · ${formatDate(daily.biggestIncome.date)}`}
                      value={`+ ${formatMoney(daily.biggestIncome.amount)}`}
                    />
                  )}
                  {daily.tightestDay && (
                    <AlertCard
                      tone="negative"
                      title="Dia mais apertado"
                      detail={`${formatDate(daily.tightestDay.date)} · maior saída líquida do mês`}
                      value={`− ${formatMoney(Math.abs(daily.tightestDay.amount))}`}
                    />
                  )}
                </section>
              )}

              <section className="flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                <div className="flex flex-wrap items-center gap-3 pb-3.5">
                  <span className="text-[15px] font-bold">Movimento por {view === "semana" ? "semana" : "dia"}</span>
                  <span className="text-[12.5px] text-[#4C6355]">
                    {view === "semana" ? "semanas" : "dias"} sem movimento são omitidos · saldo inicial de {formatMoney(daily.opening)}
                  </span>
                </div>
                <DailyTable data={daily} />
              </section>
            </>
          )}

          {view === "mes" && monthly && (
            <>
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <AuroraSurface className="rounded-[20px] p-6">
                  <div className="flex flex-1 flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Saldo em {formatDate(monthly.closingDate)}</span>
                    <span className="text-[28px] font-bold leading-none tracking-[-.025em]">{formatMoney(monthly.totals.closing)}</span>
                    <span className={`text-[12.5px] font-semibold ${monthly.totals.closing - monthly.totals.opening < 0 ? "text-[#F4A497]" : "text-[#7EE2A8]"}`}>
                      {signedMoney(monthly.totals.closing - monthly.totals.opening)} no período
                    </span>
                  </div>
                </AuroraSurface>
                <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                  <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]">Entradas previstas</span>
                  <strong className="text-[24px] font-bold tracking-[-.02em] text-[#0A7A42]">{formatMoney(monthly.totals.incoming)}</strong>
                  <span className="text-[12.5px] text-[#4C6355]">média de {formatMoney(monthly.totals.incoming / monthly.columns.length)}/mês</span>
                </article>
                <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                  <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]">Saídas previstas</span>
                  <strong className="text-[24px] font-bold tracking-[-.02em] text-[#B3261E]">{formatMoney(monthly.totals.outgoing)}</strong>
                  <span className="text-[12.5px] text-[#4C6355]">média de {formatMoney(monthly.totals.outgoing / monthly.columns.length)}/mês</span>
                </article>
                <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                  <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]">Runway</span>
                  <strong className="text-[24px] font-bold tracking-[-.02em]">
                    {monthly.runway === null ? "—" : `${monthly.runway.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} meses`}
                  </strong>
                  <span className="text-[12.5px] text-[#4C6355]">
                    {monthly.runway === null
                      ? "sem saída registrada para calcular"
                      : `sem novas entradas · queima de ${formatMoney(monthly.averageOutflow)}/mês`}
                  </span>
                </article>
              </section>

              <section className="flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                <div className="flex flex-wrap items-center gap-3 pb-3.5">
                  <span className="text-[15px] font-bold">Projeção mês a mês</span>
                  <span className="text-[12.5px] text-[#4C6355]">meses ainda não iniciados aparecem em tom mais claro</span>
                </div>
                <MonthlyTable data={monthly} />
                <p className="mt-4 text-[12px] text-[#4C6355]">
                  A projeção usa só lançamentos já registrados — inclusive as parcelas futuras de
                  recorrências. Não há estimativa de tendência.
                </p>
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
