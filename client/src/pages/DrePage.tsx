import { Hint } from "@/components/Hint";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { ChartSkeleton, KpiRowSkeleton } from "@/components/PageSkeleton";
import { AppSidebar } from "@/components/AppSidebar";
import {
  ChevronRightIcon,
  DocumentIcon,
  DownloadIcon,
  PlusIcon,
  SidebarMenuIcon,
  UploadIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { useSemContas } from "@/hooks/useSemContas";
import { marginOf, variationHelpsProfit, type DreLineKind } from "@shared/dre";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";

type DreOutputs = inferRouterOutputs<AppRouter>["dre"];
type StatementData = DreOutputs["statement"];
type SeriesData = DreOutputs["series"];
type Regime = "competencia" | "caixa";
type View = "mes" | "semestre" | "ano";

const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function KpiCard({ label, value, hint, hintClass, highlight = false, valueClass }: {
  label: string;
  value: string;
  hint: string;
  hintClass?: string;
  highlight?: boolean;
  valueClass?: string;
}) {
  const content = (
    <>
      <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${highlight ? "text-[#8FB39E]" : "text-[#8A968D]"}`}>{label}</span>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${valueClass ?? (highlight ? "text-white" : "")}`}>{value}</strong>
      <span className={`text-[12.5px] font-semibold ${hintClass ?? (highlight ? "text-[#7EE2A8]" : "text-[#8A968D]")}`}>{hint}</span>
    </>
  );
  if (highlight) {
    return <AuroraSurface className="rounded-[20px] p-6"><div className="flex flex-1 flex-col gap-2">{content}</div></AuroraSurface>;
  }
  return <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">{content}</article>;
}

/** Verde quando o número ajuda o resultado, vermelho quando atrapalha. */
function toneOf(value: number | null) {
  if (value === null || value === 0) return "text-[#8A968D]";
  return value > 0 ? "text-[#0A7A42]" : "text-[#B3261E]";
}

/** Percentual já arredondado, com o sinal na frente. */
function formatPercent(value: number | null, digits = 1) {
  if (value === null) return "—";
  const formatted = Math.abs(value).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return `${value < 0 ? "−" : "+"}${formatted}%`;
}

function formatShare(value: number, base: number) {
  if (base === 0) return "—";
  const share = Math.abs(value / base) * 100;
  return `${share.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** Espaçamento, régua e peso de cada nível da demonstração. */
const LINE_STYLE: Record<DreLineKind, { row: string; label: string; value: string }> = {
  grupo: {
    row: "py-[13px] border-b border-[#E3EBE6]",
    label: "text-[14.5px] font-bold text-[#0B1F14]",
    value: "text-[14.5px] font-semibold",
  },
  item: {
    row: "py-[10px] pl-6 border-b border-[#F1F4F2]",
    label: "text-[14px] text-[#28382E]",
    value: "text-[14px] font-semibold",
  },
  subitem: {
    row: "py-[9px] pl-11 border-b border-[#F8FAF9]",
    label: "text-[13px] text-[#4C6355]",
    value: "text-[13px]",
  },
  subtotal: {
    row: "mt-1.5 rounded-[14px] bg-[#F8FAF9] py-[14px]",
    label: "text-[15px] font-bold text-[#0B1F14]",
    value: "text-[15px] font-semibold text-[#0B1F14]",
  },
  resultado: {
    row: "mt-1.5 rounded-[14px] bg-[#F1FBF6] py-4",
    label: "text-[16px] font-bold text-[#0A7A42]",
    value: "text-[16px] font-semibold text-[#0A7A42]",
  },
};

/** Colunas da demonstração. As duas últimas só cabem a partir de telas médias. */
const STATEMENT_GRID = "grid grid-cols-[minmax(0,1fr)_112px] gap-3 sm:grid-cols-[minmax(0,1fr)_150px_84px] lg:grid-cols-[minmax(0,1fr)_168px_92px_132px]";

function moneyToneOf(value: number, kind: DreLineKind) {
  if (kind === "resultado") return "";
  if (value < 0) return "text-[#B3261E]";
  return kind === "subitem" ? "text-[#4C6355]" : "text-[#0B1F14]";
}

/** Valor da linha com o sinal explícito que a demonstração usa. */
function signedMoney(value: number) {
  if (value < 0) return `− ${formatMoney(Math.abs(value))}`;
  return formatMoney(value);
}

function MonthStatement({ data }: { data: StatementData }) {
  const base = data.totals.receitaBruta;
  return (
    <>
      <div className={`${STATEMENT_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]`}>
        <span>Conta</span>
        <span className="text-right">Valor</span>
        <span className="hidden text-right sm:block">% receita</span>
        <span className="hidden text-right lg:block">vs. {data.previousLabel.split(" de ")[0]}</span>
      </div>

      {data.lines.map(line => {
        const style = LINE_STYLE[line.kind];
        const faixa = line.kind === "subtotal" || line.kind === "resultado";
        return (
          <div key={line.key} className={`${STATEMENT_GRID} items-center px-1 ${style.row} ${faixa ? "-mx-2 px-3" : ""}`}>
            <span className={`min-w-0 truncate ${style.label}`} title={line.label}>{line.label}</span>
            <span className={`text-right ${style.value} ${moneyToneOf(line.value, line.kind)}`}>{signedMoney(line.value)}</span>
            <span className="hidden text-right text-[12.5px] text-[#4C6355] sm:block">{formatShare(line.value, base)}</span>
            <span
              className={`hidden text-right text-[12.5px] font-semibold lg:block ${
                line.variation === null
                  ? "text-[#8A968D]"
                  : variationHelpsProfit(line.value, line.previous)
                    ? "text-[#0A7A42]"
                    : "text-[#B3261E]"
              }`}
              title={`${data.previousLabel}: ${signedMoney(line.previous)}`}
            >
              {formatPercent(line.variation)}
            </span>
          </div>
        );
      })}
    </>
  );
}

/** Uma linha do comparativo: o rótulo, o valor de cada mês e o total do período. */
type SeriesRow = { key: string; label: string; kind: DreLineKind; values: number[] };

function buildSeriesRows(data: SeriesData): SeriesRow[] {
  const pick = (key: string, label: string, kind: DreLineKind, read: (totals: SeriesData["columns"][number]["totals"]) => number): SeriesRow => ({
    key,
    label,
    kind,
    values: data.columns.map(column => read(column.totals)),
  });

  const rootLabels: string[] = [];
  for (const column of data.columns) {
    for (const root of column.operatingRoots) {
      if (!rootLabels.includes(root.label)) rootLabels.push(root.label);
    }
  }
  const rootRows: SeriesRow[] = rootLabels.map(label => ({
    key: `raiz/${label}`,
    label: `(−) ${label}`,
    kind: "item",
    values: data.columns.map(column => column.operatingRoots.find(root => root.label === label)?.value ?? 0),
  }));
  rootRows.sort((left, right) => {
    const sum = (row: SeriesRow) => row.values.reduce((total, value) => total + Math.abs(value), 0);
    return sum(right) - sum(left);
  });

  return [
    pick("receita_bruta", "Receita bruta", "grupo", totals => totals.receitaBruta),
    pick("deducoes", "(−) Deduções", "item", totals => totals.deducoes),
    pick("receita_liquida", "Receita líquida", "subtotal", totals => totals.receitaLiquida),
    pick("custos", "(−) Custos diretos", "item", totals => totals.custos),
    pick("margem", "Margem de contribuição", "subtotal", totals => totals.margemContribuicao),
    ...rootRows,
    pick("ebitda", "EBITDA", "subtotal", totals => totals.ebitda),
    pick("depreciacao", "(−) Depreciação", "item", totals => totals.depreciacao),
    pick("financeiro", "(+/−) Financeiro e impostos", "item", totals =>
      totals.financeiro + totals.impostosLucro + totals.naoOperacional),
    pick("lucro", "Lucro líquido", "resultado", totals => totals.lucroLiquido),
  ];
}

function SeriesTable({ data }: { data: SeriesData }) {
  const rows = buildSeriesRows(data);
  // Seis colunas cabem numa tela de 1440; doze não cabem em tela nenhuma e o
  // cartão rola na horizontal. A largura mínima sai do próprio template para o
  // trilho de rolagem nunca cortar a coluna do período.
  const monthWidth = data.columns.length > 6 ? 96 : 104;
  const labelWidth = 200;
  const totalWidth = 124;
  const gap = 10;
  const grid = {
    display: "grid",
    gridTemplateColumns: `minmax(${labelWidth}px, 1fr) repeat(${data.columns.length}, ${monthWidth}px) ${totalWidth}px`,
    gap: `${gap}px`,
  } as const;

  return (
    // As faixas de subtotal sangram 8px para os lados; sem essa folga elas
    // criariam rolagem horizontal numa tabela que cabe na tela.
    <div className="-mx-2 overflow-x-auto px-2">
      <div style={{ minWidth: labelWidth + data.columns.length * monthWidth + totalWidth + (data.columns.length + 1) * gap }}>
        <div style={grid} className="border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#8A968D]">
          <span>Conta</span>
          {data.columns.map(column => (
            <span key={`${column.year}-${column.month}`} className={`text-right ${column.isCurrent ? "text-[#0B1F14]" : ""}`}>
              {column.label}
            </span>
          ))}
          <span className="text-right text-[#0B1F14]">Período</span>
        </div>

        {rows.map(row => {
          const style = LINE_STYLE[row.kind];
          const faixa = row.kind === "subtotal" || row.kind === "resultado";
          const total = row.values.reduce((sum, value) => sum + value, 0);
          return (
            <div key={row.key} style={grid} className={`items-center px-1 ${style.row} ${faixa ? "-mx-2 px-3" : ""}`}>
              <span className={`min-w-0 truncate ${style.label}`} title={row.label}>{row.label}</span>
              {row.values.map((value, index) => (
                <span
                  key={data.columns[index].label + index}
                  className={`text-right ${style.value} ${moneyToneOf(value, row.kind)}`}
                >
                  {signedMoney(value)}
                </span>
              ))}
              <span className={`text-right font-bold ${style.value} ${moneyToneOf(total, row.kind)}`}>{signedMoney(total)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfitChart({ data }: { data: SeriesData }) {
  const values = data.columns.map(column => column.totals.lucroLiquido);
  const peak = Math.max(...values.map(Math.abs), 1);
  const recent = data.columns.length - 2;

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-4 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
      <div className="flex items-baseline gap-3">
        <span className="text-[15px] font-bold">Lucro líquido por mês</span>
        <span className="ml-auto text-[12.5px] text-[#8A968D]">{data.columns[0].label} → {data.columns[data.columns.length - 1].label}</span>
      </div>
      <div className="flex h-[150px] items-end gap-2.5">
        {data.columns.map((column, index) => {
          const value = values[index];
          const tone = value < 0 ? "bg-[#B3261E]" : index >= recent ? "bg-[#12B85C]" : index >= recent - 2 ? "bg-[#9BE3BC]" : "bg-[#DFF6EA]";
          return (
            <div key={`${column.year}-${column.month}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
              <div
                title={`${column.label}: ${signedMoney(value)}`}
                className={`w-full rounded-t-md ${tone}`}
                style={{ height: `${Math.max(2, (Math.abs(value) / peak) * 100)}%` }}
              />
              <span className={`text-[11.5px] ${column.isCurrent ? "font-bold text-[#0B1F14]" : "text-[#8A968D]"}`}>{column.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MarginsCard({ data }: { data: SeriesData }) {
  const sum = (read: (totals: SeriesData["columns"][number]["totals"]) => number) =>
    data.columns.reduce((total, column) => total + read(column.totals), 0);

  const receitaLiquida = sum(totals => totals.receitaLiquida);
  const lucro = sum(totals => totals.lucroLiquido);
  const margins = [
    { label: "Margem de contribuição", value: marginOf(sum(totals => totals.margemContribuicao), receitaLiquida) },
    { label: "Margem EBITDA", value: marginOf(sum(totals => totals.ebitda), receitaLiquida) },
    { label: "Margem líquida", value: marginOf(lucro, receitaLiquida) },
  ];

  return (
    <div className="flex w-full shrink-0 flex-col gap-3.5 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3] lg:w-[340px]">
      <span className="text-[15px] font-bold">Margens do período</span>
      <div className="flex flex-col gap-3">
        {margins.map(margin => (
          <div key={margin.label} className="flex flex-col gap-1.5">
            <div className="flex text-[13px]">
              <span>{margin.label}</span>
              <span className="ml-auto font-bold">
                {margin.value === null ? "—" : `${margin.value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#EDF2EE]">
              <div className="h-full rounded-full bg-[#12B85C]" style={{ width: `${Math.min(100, Math.max(0, margin.value ?? 0))}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-1.5 rounded-[14px] bg-[#F1FBF6] p-3.5">
        <span className="text-[12.5px] text-[#4C6355]">Lucro acumulado no período</span>
        <span className="text-[22px] font-bold text-[#0A7A42]">{signedMoney(lucro)}</span>
      </div>
    </div>
  );
}

/*
 * O mês sem nenhum lançamento na demonstração.
 *
 * A DRE zerada é uma tabela de traços que não explica nada. No lugar dela:
 * as linhas que vão ser calculadas (para a pessoa saber o que vem), os dois
 * caminhos que trazem lançamentos, e os três passos até um mês fechado.
 */
function KpisDoMesVazio() {
  const apagado = "text-[#B9C7BE]";
  return (
    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard highlight label="Lucro líquido" value="R$ 0,00" valueClass="text-[#8FB39E]" hintClass="text-[#8FB39E]" hint="O resultado do mês é calculado a partir dos lançamentos por categoria." />
      <KpiCard label="Receita líquida" value="—" valueClass={apagado} hint="Vendas e serviços menos devoluções" />
      <KpiCard label="Margem líquida" value="—" valueClass={apagado} hint="Lucro sobre a receita do período" />
      <KpiCard label="Ponto de equilíbrio" value="—" valueClass={apagado} hint="Depende das despesas fixas cadastradas" />
    </section>
  );
}

function DreVazia({ regime, onNovoLancamento, onImportar, onVerCompetencia }: {
  regime: Regime;
  onNovoLancamento: () => void;
  onImportar: () => void;
  onVerCompetencia: () => void;
}) {
  const podeEscrever = !useSomenteLeitura();
  const [explicando, setExplicando] = useState(false);
  const traco = (conteudo: ReactNode, tamanho = 20) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{conteudo}</svg>
  );
  const linhas = [
    ["Receita bruta", "categorias de receita"],
    ["(−) Custos", "custos operacionais"],
    ["= Lucro bruto", "receita menos custos"],
    ["(−) Despesas", "administrativas e comerciais"],
    ["= Lucro líquido", "resultado do período"],
  ];
  const passos = [
    { titulo: "Registre os lançamentos", texto: "Manualmente ou pelo extrato do banco em OFX ou CSV.", icone: <><path d="M3 6h.01" /><path d="M3 12h.01" /><path d="M3 18h.01" /><path d="M8 6h13" /><path d="M8 12h13" /><path d="M8 18h13" /></> },
    { titulo: "Confira as categorias", texto: "Cada categoria já sabe se é receita, custo ou despesa.", icone: <><path d="M12.586 2.586A2 2 0 0011.172 2H4a2 2 0 00-2 2v7.172a2 2 0 00.586 1.414l8.704 8.704a2.426 2.426 0 003.42 0l6.58-6.58a2.426 2.426 0 000-3.42z" /><circle cx="7.5" cy="7.5" r="1" /></> },
    { titulo: "Feche o mês", texto: "Com o mês fechado, a posição do último dia fica salva no balanço.", icone: <><path d="M15 2H7a2 2 0 00-2 2v16a2 2 0 002 2h10a2 2 0 002-2V6z" /><path d="M14 2v4h5" /><path d="M9 13h6" /><path d="M9 17h6" /></> },
  ];

  return (
    <>
      <section className="flex flex-1 flex-col items-center justify-center gap-7 rounded-[20px] bg-white px-6 py-14 text-center ring-1 ring-[#E1E8E3] sm:px-10">
        {/* Uma demonstração em rascunho, uma preenchida, e o sinal de somar. */}
        <div aria-hidden="true" className="relative flex h-[112px] w-[112px] items-center justify-center">
          <span className="absolute inset-0 rounded-[36px] bg-[#F1FBF6]" />
          <span className="absolute left-[16px] top-[20px] h-[64px] w-[52px] -rotate-[7deg] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] bg-white" />
          <span className="absolute right-[16px] top-[26px] flex h-[64px] w-[52px] rotate-[6deg] flex-col justify-center gap-1.5 rounded-[10px] border-[1.5px] border-[#12B85C] bg-[#DFF6EA] px-2.5">
            <span className="h-[3px] w-full rounded-[2px] bg-[#0A7A42]" />
            <span className="h-[3px] w-[70%] rounded-[2px] bg-[#7EE2A8]" />
            <span className="h-[3px] w-[85%] rounded-[2px] bg-[#0A7A42]" />
          </span>
          <span className="absolute bottom-[12px] left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">
            <PlusIcon size={16} />
          </span>
        </div>

        <div className="flex max-w-[520px] flex-col gap-2">
          <h2 className="text-[22px] font-bold tracking-[-.02em]">Sem resultado para demonstrar</h2>
          <p className="text-[14px] leading-relaxed text-[#4C6355]">
            O DRE monta receitas, custos e despesas a partir das categorias dos seus lançamentos.
            Registre o primeiro movimento do mês e a demonstração se preenche sozinha.
          </p>
        </div>

        {podeEscrever && (
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onNovoLancamento} className="flex h-12 items-center gap-2 rounded-[12px] bg-[#12B85C] px-[22px] text-[14px] font-bold text-white transition hover:bg-[#0F9E4E]">
            <PlusIcon size={16} />
            Novo lançamento
          </button>
          <button type="button" onClick={onImportar} className="flex h-12 items-center gap-2 rounded-[12px] border border-[#E3EBE6] bg-white px-[22px] text-[14px] font-semibold text-[#28382E] transition hover:bg-[#F8FAF9]">
            <UploadIcon size={16} />
            Importar extrato
          </button>
        </div>
        )}

        <div className="flex w-full max-w-[820px] flex-col gap-2 border-t border-[#F1F4F2] pt-6">
          <span className="text-left text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]">As linhas que o GranaFy vai calcular</span>
          {linhas.map(([nome, origem]) => (
            <div key={nome} className="flex items-center gap-3.5 rounded-[12px] bg-[#F8FAF9] px-4 py-[13px]">
              <span className="min-w-0 flex-1 text-left text-[13px] font-bold text-[#28382E]">{nome}</span>
              <span className="hidden whitespace-nowrap text-[12px] text-[#8A968D] sm:block">{origem}</span>
              <span className="w-[96px] text-right text-[14px] font-bold text-[#B9C7BE]">—</span>
            </div>
          ))}
        </div>

        <div className="grid w-full max-w-[820px] gap-3.5 sm:grid-cols-3">
          {passos.map((passo, indice) => (
            <div key={passo.titulo} className="flex flex-col items-start gap-2.5 rounded-[16px] bg-[#F8FAF9] p-[18px] text-left">
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA] text-[#0A7A42]">{traco(passo.icone)}</span>
              <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]">Passo {indice + 1}</span>
              <strong className="text-[14px] font-bold">{passo.titulo}</strong>
              <span className="text-[12.5px] leading-relaxed text-[#4C6355]">{passo.texto}</span>
            </div>
          ))}
        </div>

        {/* Não há página de ajuda; o link abre a explicação aqui mesmo. */}
        <button type="button" onClick={() => setExplicando(atual => !atual)} aria-expanded={explicando} className="text-[13px] font-semibold text-[#0A7A42] hover:underline">
          Como o GranaFy monta o DRE {explicando ? "↑" : "→"}
        </button>
        {explicando && (
          <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-[16px] bg-[#F8FAF9] p-5 text-left text-[13px] leading-relaxed text-[#28382E]">
            <p>
              Cada categoria carrega o seu papel: <strong>receita</strong>, <strong>custo</strong> ou
              <strong> despesa</strong>. O DRE soma os lançamentos do mês por esse papel — receita bruta
              menos custos dá o lucro bruto; menos despesas, o lucro líquido.
            </p>
            <p>
              <strong>Competência</strong> conta cada lançamento no mês da data dele, pago ou não. <strong>Caixa</strong> conta
              só o que já foi pago, e no mês do pagamento. Os dois são a mesma lista de lançamentos vista por
              regras diferentes; você alterna na demonstração.
            </p>
            <p>
              Transferências entre contas, compra de ativo e distribuição de lucro nunca entram no resultado:
              movem dinheiro, não geram nem consomem lucro.
            </p>
          </div>
        )}
      </section>

      <p className="text-[12px] text-[#8A968D]">
        Transferências entre contas nunca entram no resultado.{" "}
        {regime === "competencia"
          ? "Regime de competência: cada lançamento conta no mês do fato, não no do pagamento."
          : <>Regime de caixa: só o que já foi pago conta, no mês do pagamento. <button type="button" onClick={onVerCompetencia} className="font-semibold text-[#0A7A42] hover:underline">Ver por competência</button></>}
      </p>
    </>
  );
}

export default function DrePage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [regime, setRegime] = useState<Regime>("competencia");
  const [view, setView] = useState<View>("mes");

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const statementQuery = trpc.dre.statement.useQuery({ ...period, regime }, { enabled: view === "mes" });
  const seriesQuery = trpc.dre.series.useQuery(
    { ...period, regime, span: view === "ano" ? 12 : 6 },
    { enabled: view !== "mes" }
  );
  const utils = trpc.useUtils();
  const podeEscrever = !useSomenteLeitura();
  const closeMonth = trpc.balanceSheet.captureSnapshot.useMutation({
    onSuccess: () => {
      utils.dre.statement.invalidate();
      utils.balanceSheet.overview.invalidate();
      toast.success(`${MONTH_LABELS[period.month - 1]} fechado: a posição do último dia foi salva no balanço.`);
    },
    onError: error => toast.error(error.message),
  });

  const statement = statementQuery.data;
  const series = seriesQuery.data;
  const monthLabel = `${MONTH_LABELS[period.month - 1]} de ${period.year}`;
  const lastDay = useMemo(
    () => new Date(Date.UTC(period.year, period.month, 0)).toISOString().slice(0, 10),
    [period.year, period.month]
  );
  const isFuture = lastDay > new Date().toISOString().slice(0, 10);

  const exportCsv = () => {
    const separator = ";";
    const quote = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    let name = "";
    let csv = "";

    if (view === "mes") {
      if (!statement) return toast.info("Aguarde o carregamento da demonstração.");
      const header = ["Conta", "Nível", "Valor", "% receita", `vs. ${statement.previousLabel}`];
      const rows = statement.lines.map(line => [
        line.label,
        line.kind,
        line.value.toFixed(2),
        formatShare(line.value, statement.totals.receitaBruta),
        line.variation === null ? "" : line.variation.toFixed(1),
      ]);
      csv = [header, ...rows].map(row => row.map(quote).join(separator)).join("\n");
      name = `dre-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    } else {
      if (!series) return toast.info("Aguarde o carregamento do comparativo.");
      const rows = buildSeriesRows(series);
      const header = ["Conta", ...series.columns.map(column => `${column.label}/${String(column.year).slice(2)}`), "Período"];
      const body = rows.map(row => [
        row.label,
        ...row.values.map(value => value.toFixed(2)),
        row.values.reduce((sum, value) => sum + value, 0).toFixed(2),
      ]);
      csv = [header, ...body].map(row => row.map(quote).join(separator)).join("\n");
      name = `dre-comparativo-${period.year}-${String(period.month).padStart(2, "0")}.csv`;
    }

    const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";
  const loading = view === "mes" ? statementQuery.isPending : seriesQuery.isPending;
  const error = view === "mes" ? statementQuery.error : seriesQuery.error;
  const [, setLocation] = useLocation();
  /* O mês sem nenhum lançamento na demonstração — no regime escolhido. */
  const semContas = useSemContas();
  const mesVazio = semContas || (view === "mes" && Boolean(statement) && statement!.transactionCount === 0);

  const margin = statement ? marginOf(statement.totals.lucroLiquido, statement.totals.receitaLiquida) : null;
  const previousMargin = statement ? marginOf(statement.previousTotals.lucroLiquido, statement.previousTotals.receitaLiquida) : null;
  const marginChange = margin === null || previousMargin === null ? null : Math.round((margin - previousMargin) * 10) / 10;
  const receitaVariation = statement?.lines.find(line => line.key === "receita_liquida")?.variation ?? null;
  const lucroVariation = statement?.lines.find(line => line.key === "lucro_liquido")?.variation ?? null;

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={statement ? (
            <SidebarStatCard
              tone={statement.totals.lucroLiquido < 0 ? "negative" : "positive"}
              kicker={`Lucro de ${statement.label.split(" ")[0]}`}
              value={`${statement.totals.lucroLiquido < 0 ? "−" : "+"} ${formatMoney(Math.abs(statement.totals.lucroLiquido))}`}
              hint={margin === null
                ? "sem receita no período"
                : `margem líquida de ${margin.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
            />
          ) : undefined}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={DocumentIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">DRE</h1>
              <p className="mt-0.5 text-[12.5px] text-[#8A968D]">
                {regime === "competencia" ? "Regime de competência" : "Regime de caixa"} · {view === "mes" ? monthLabel : series ? `${series.from} a ${series.to}` : monthLabel}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-10 min-w-[174px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <div className={`flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1] ${mesVazio ? "pointer-events-none opacity-50" : ""}`}>
              {([["mes", "Mês"], ["semestre", "Semestre"], ["ano", "Ano"]] as const).map(([value, label]) => (
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

            <Hint label="Exportar CSV"><button type="button" aria-label="Exportar DRE" onClick={exportCsv} disabled={mesVazio} className={`${toolButton} disabled:pointer-events-none disabled:opacity-50`}><DownloadIcon size={17} /></button></Hint>
            {podeEscrever && (
            <button
              type="button"
              disabled={closeMonth.isPending || isFuture}
              title={isFuture ? "O mês ainda não terminou" : "Salva a posição do último dia do mês no balanço"}
              onClick={() => closeMonth.mutate({ referenceDate: lastDay })}
              className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold sm:px-4 text-white transition hover:bg-[#0F9E4E] active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <DocumentIcon size={15} />
              {closeMonth.isPending ? "Fechando…" : "Fechar o mês"}
            </button>
            )}
            <ProfileMenu />
          </header>

          {error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              Não foi possível carregar a DRE: {error.message}
            </div>
          )}

          {!mesVazio && loading && !error && (
            <>
              <KpiRowSkeleton />
              <ChartSkeleton minHeight={300} />
            </>
          )}

          {mesVazio && (
            <>
              <KpisDoMesVazio />
              <DreVazia
                regime={regime}
                onNovoLancamento={() => setLocation("/lancamentos?novo=lancamento")}
                onImportar={() => setLocation("/lancamentos?importar=extrato")}
                onVerCompetencia={() => setRegime("competencia")}
              />
            </>
          )}

          {view === "mes" && statement && !mesVazio && (
            <>
              <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                <KpiCard
                  highlight
                  label="Lucro líquido"
                  value={signedMoney(statement.totals.lucroLiquido)}
                  hint={`${formatPercent(lucroVariation)} vs. ${statement.previousLabel.split(" de ")[0]}`}
                  /* Sobre o fundo escuro o vermelho da tabela não se lê; o modelo usa este salmão. */
                  hintClass={lucroVariation !== null && lucroVariation < 0 ? "text-[#F4A497]" : undefined}
                />
                <KpiCard
                  label="Receita líquida"
                  value={formatMoney(statement.totals.receitaLiquida)}
                  hint={formatPercent(receitaVariation)}
                  hintClass={toneOf(receitaVariation)}
                />
                <KpiCard
                  label="Margem líquida"
                  value={margin === null ? "—" : `${margin.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
                  hint={marginChange === null ? "sem base de comparação" : `${formatPercent(marginChange)} p.p.`}
                  hintClass={toneOf(marginChange)}
                />
                <KpiCard
                  label="Ponto de equilíbrio"
                  value={statement.breakEven === null ? "—" : formatMoney(statement.breakEven)}
                  hint={
                    statement.breakEven === null
                      ? "cadastre despesas fixas para calcular"
                      : statement.breakEvenDay
                        ? `atingido em ${formatDate(statement.breakEvenDay)}`
                        : "não atingido no mês"
                  }
                  hintClass="text-[#4C6355]"
                />
              </section>

              <section className="flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                <div className="flex flex-wrap items-center gap-3 pb-3.5">
                  <span className="text-[15px] font-bold">Demonstração do resultado</span>
                  <div className="ml-auto flex items-stretch rounded-[10px] bg-[#F1F4F2] p-[3px]">
                    {([["competencia", "Competência"], ["caixa", "Caixa"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRegime(value)}
                        className={`rounded-lg px-3.5 py-[7px] text-[12.5px] transition ${regime === value ? "bg-white font-bold text-[#0A7A42]" : "text-[#4C6355]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="rounded-[10px] border border-[#E3EBE6] px-3 py-[9px] text-[12.5px] font-semibold text-[#28382E]">
                    Comparado com {statement.previousLabel}
                  </span>
                </div>

                {statement.transactionCount === 0 ? (
                  <p className="py-8 text-center text-[13.5px] text-[#8A968D]">
                    Nenhum lançamento em {monthLabel}{regime === "caixa" ? " com status pago" : ""}.
                  </p>
                ) : (
                  <MonthStatement data={statement} />
                )}

                <p className="mt-4 text-[12px] text-[#8A968D]">
                  {statement.transactionCount.toLocaleString("pt-BR")} lançamentos no mês.
                  {" "}Transferências entre contas nunca entram no resultado.
                  {statement.totals.foraDoResultado !== 0 && (
                    <> Compra de ativo e distribuição de lucro somam {signedMoney(statement.totals.foraDoResultado)} e saem do caixa sem passar pelo lucro.</>
                  )}
                  {statement.closedAt && <> Mês fechado no balanço em {formatDate(new Date(statement.closedAt).toISOString().slice(0, 10))}.</>}
                </p>
              </section>
            </>
          )}

          {!mesVazio && view !== "mes" && series && (
            <>
              <section className="flex flex-col gap-0.5 rounded-[20px] bg-white px-5 pb-6 pt-5 ring-1 ring-[#E1E8E3] sm:px-6">
                <div className="flex flex-wrap items-center gap-3 pb-3.5">
                  <span className="text-[15px] font-bold">Resultado por mês</span>
                  <span className="text-[12.5px] text-[#8A968D]">{series.from} a {series.to}</span>
                  <div className="ml-auto flex items-stretch rounded-[10px] bg-[#F1F4F2] p-[3px]">
                    {([["competencia", "Competência"], ["caixa", "Caixa"]] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRegime(value)}
                        className={`rounded-lg px-3.5 py-[7px] text-[12.5px] transition ${regime === value ? "bg-white font-bold text-[#0A7A42]" : "text-[#4C6355]"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <SeriesTable data={series} />
              </section>

              <section className="flex flex-col gap-5 lg:flex-row">
                <ProfitChart data={series} />
                <MarginsCard data={series} />
              </section>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
