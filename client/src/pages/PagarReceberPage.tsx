import { useAuth } from "@/_core/hooks/useAuth";
import { rotuloCurtoDoMes } from "@shared/relatorios";
import { CartaoVazio } from "@/components/CartaoVazio";
import { Hint } from "@/components/Hint";
import { SeriesScopeDialog } from "@/components/SeriesScopeDialog";
import { TransactionModal } from "@/components/TransactionModal";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { GranafyLoader } from "@/components/GranafyLoader";
import { ChartSkeleton, KpiRowSkeleton } from "@/components/PageSkeleton";
import { AppSidebar } from "@/components/AppSidebar";
// O design system Voltura, com escopo nesta tela (ver DESIGN.md na raiz).
import "@/styles/voltura.css";
import {
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  DeleteIcon,
  DownloadIcon,
  EditIcon,
  FilterIcon,
  PlusIcon,
  SearchIcon,
  SidebarMenuIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ProfileMenu } from "@/components/ProfileMenu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDate, formatMoney, today } from "@/lib/appFormat";
import { trpc } from "@/lib/trpc";
import { useSemContas } from "@/hooks/useSemContas";
import type { SeriesScope, Transaction, TransactionInput, TransactionType } from "@/lib/transactionTypes";
import { STATUS_LABELS, type Title, type TitleStatus } from "@shared/payables";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { toast } from "@/lib/toast";
import { useLocation } from "wouter";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import { useRegistrarExportacao } from "@/hooks/useRegistrarExportacao";

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
/**
 * O cartão fica na barra mesmo sem atraso: "nada vencido" é uma resposta, e
 * ver o cartão sumir dá a impressão de que a conta deixou de ser feita.
 */
function OverdueCard({ count, amount }: { count: number; amount: number }) {
  return (
    <SidebarStatCard
      tone={count > 0 ? "negative" : "positive"}
      kicker="Em atraso"
      value={formatMoney(Math.abs(amount))}
      hint={count === 0 ? "nada vencido" : count === 1 ? "1 conta a pagar" : `${count} contas a pagar`}
    />
  );
}

function KpiCard({ label, value, hint, valueClass, hintClass, icon, highlight = false }: {
  label: string;
  value: string;
  hint: string;
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
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${valueClass ?? (highlight ? "text-white" : "")}`}>{value}</strong>
      <span className={`text-[12.5px] ${hintClass ?? (highlight ? "text-[#7EE2A8]" : "text-[#4C6355]")}`}>{hint}</span>
    </>
  );
  if (highlight) {
    return <AuroraSurface className="rounded-[20px] p-6"><div className="flex flex-1 flex-col gap-2">{content}</div></AuroraSurface>;
  }
  return <article className="flex flex-col gap-2 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">{content}</article>;
}

/*
 * O mês sem nenhum título aberto.
 *
 * Os cartões ficam no lugar, apagados: "—" nos três claros, porque não há
 * valor; "R$ 0,00" apagado no escuro, como no desenho. No lugar das colunas,
 * a mesma família de tela vazia da conciliação: o que é um título, os dois
 * botões que criam um, e os três passos da vida dele.
 */
function KpisDoMesVazio({ projectedCashDate }: { projectedCashDate: string }) {
  const apagado = "text-[#B9C7BE]";
  return (
    <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard highlight label="Caixa projetado" value="R$ 0,00" valueClass="text-[#8FB39E]" hintClass="text-[#8FB39E]" hint={`Projeção para ${formatDate(projectedCashDate)} com base nos títulos em aberto.`} />
      <KpiCard
        label="A receber" value="—" valueClass={apagado} hint="Cobranças emitidas e ainda não recebidas"
        icon={{ className: "bg-[#DFF6EA] text-[#0A7A42]", node: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg> }}
      />
      <KpiCard
        label="A pagar" value="—" valueClass={apagado} hint="Despesas com vencimento futuro"
        icon={{ className: "bg-[#FDECEA] text-[#B3261E]", node: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7" /></svg> }}
      />
      <KpiCard label="Saldo do mês" value="—" valueClass={apagado} hint="Se tudo for liquidado no prazo" />
    </section>
  );
}

function MesVazio({ onNovaCobranca, onNovaDespesa }: { onNovaCobranca: () => void; onNovaDespesa: () => void }) {
  const [explicando, setExplicando] = useState(false);
  const sobe = <path d="M12 19V5M5 12l7-7 7 7" />;
  const desce = <path d="M12 5v14M19 12l-7 7-7-7" />;
  const passos = [
    { titulo: "Cadastre o título", texto: "Valor, vencimento, categoria e cliente ou fornecedor.", icone: sobe },
    { titulo: "Acompanhe o vencimento", texto: "Atrasos e vencimentos do dia aparecem destacados nesta tela.", icone: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></> },
    { titulo: "Marque como liquidado", texto: "Ao receber ou pagar, o título passa para Pagas e recebidas.", icone: <path d="M20 6L9 17l-5-5" /> },
  ];
  const traco = (conteudo: React.ReactNode, tamanho = 20, espessura = 2) => (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={espessura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{conteudo}</svg>
  );

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-7 rounded-[20px] bg-white px-6 py-14 text-center ring-1 ring-[#E1E8E3] sm:px-10">
      {/* Uma despesa ainda em rascunho, uma cobrança viva, e o sinal de somar. */}
      <div aria-hidden="true" className="relative flex h-[112px] w-[112px] items-center justify-center">
        <span className="absolute inset-0 rounded-[36px] bg-[#F1FBF6]" />
        <span className="absolute left-[14px] top-[22px] flex h-[38px] w-[56px] -rotate-[8deg] items-center justify-center rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] bg-white text-[#B9C7BE]">
          {traco(desce, 18)}
        </span>
        <span className="absolute right-[14px] top-[30px] flex h-[38px] w-[56px] rotate-[6deg] items-center justify-center rounded-[10px] border-[1.5px] border-[#12B85C] bg-[#DFF6EA] text-[#0A7A42]">
          {traco(sobe, 18)}
        </span>
        <span className="absolute bottom-[14px] left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">
          <PlusIcon size={16} />
        </span>
      </div>

      <div className="flex max-w-[520px] flex-col gap-2">
        <h2 className="text-[22px] font-bold tracking-[-.02em]">Nenhum título em aberto</h2>
        <p className="text-[14px] leading-relaxed text-[#4C6355]">
          Títulos são os lançamentos com data de vencimento: o que seus clientes ainda vão pagar e o que
          você tem para pagar. Cadastre o primeiro para o GranaFy projetar o caixa.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onNovaCobranca}
          className="flex h-12 items-center gap-2 rounded-[12px] bg-[#12B85C] px-[22px] text-[14px] font-bold text-white transition hover:bg-[#0F9E4E]"
        >
          {traco(sobe, 16, 2.4)}
          Nova cobrança
        </button>
        <button
          type="button"
          onClick={onNovaDespesa}
          className="flex h-12 items-center gap-2 rounded-[12px] border border-[#E3EBE6] bg-white px-[22px] text-[14px] font-semibold text-[#28382E] transition hover:bg-[#F8FAF9]"
        >
          <span className="text-[#B3261E]">{traco(desce, 16, 2.2)}</span>
          Nova despesa
        </button>
      </div>

      <div className="grid w-full max-w-[820px] gap-3.5 border-t border-[#F1F4F2] pt-6 sm:grid-cols-3">
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
      <button
        type="button"
        onClick={() => setExplicando(atual => !atual)}
        aria-expanded={explicando}
        className="text-[13px] font-semibold text-[#0A7A42] hover:underline"
      >
        Como funcionam os títulos no GranaFy {explicando ? "↑" : "→"}
      </button>
      {explicando && (
        <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-[16px] bg-[#F8FAF9] p-5 text-left text-[13px] leading-relaxed text-[#28382E]">
          <p>
            Todo lançamento com situação <strong>pendente</strong> é um título, e a data dele é o
            vencimento. Uma venda a prazo é um título a receber; uma conta de luz que vence dia 20 é um
            título a pagar. Os dois moram aqui até serem liquidados.
          </p>
          <p>
            É com eles que o GranaFy <strong>projeta o caixa</strong>: o saldo de hoje mais tudo o que
            está para entrar, menos tudo o que está para sair, na data em que cada um vence. Vencidos e
            não pagos ficam marcados como atrasados — e continuam nesta tela mesmo quando o mês
            selecionado é outro.
          </p>
          <p>
            Ao marcar como pago ou recebido, o título sai daqui e passa para <strong>Pagas e
            recebidas</strong>, na data em que o dinheiro de fato entrou ou saiu.
          </p>
        </div>
      )}
    </section>
  );
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
  return value < 0 ? `− ${formatMoney(Math.abs(value))}` : `+ ${formatMoney(value)}`;
}

/* A última coluna é o ⋮: sem ele, um título a pagar só tinha um destino, ser pago. */
const LIST_GRID = "grid grid-cols-[26px_minmax(0,1fr)_auto] gap-3 lg:grid-cols-[34px_84px_minmax(0,1fr)_170px_140px_120px_150px_44px_36px]";

function SettleButton({ title, onSettle, pending }: { title: Title; onSettle: (id: number) => void; pending: boolean }) {
  const label = title.side === "receber" ? "Marcar como recebido" : "Marcar como pago";
  // O contador vê o título; liquidar é do dono. O span mantém a coluna da grade.
  if (useSomenteLeitura()) return <span aria-hidden="true" />;
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

/**
 * O ⋮ do título: editar e excluir.
 *
 * Até aqui um título a pagar tinha UM destino nesta tela — ser pago. Errou a
 * data, o valor ou lançou em dobro? Tinha de ir a Lançamentos, achar a linha
 * no meio do mês e resolver lá. O menu traz as duas ações para onde a pessoa
 * está olhando. Fecha ao escolher, no Esc e no clique fora, pelo mesmo hook
 * dos outros menus do produto.
 */
function TitleMenu({ title, onEditar, onExcluir }: { title: Title; onEditar: (title: Title) => void; onExcluir: (title: Title) => void }) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(aberto, caixa, useCallback(() => setAberto(false), []));
  const somenteLeitura = useSomenteLeitura();
  if (somenteLeitura) return <span aria-hidden="true" />;
  return (
    <div ref={caixa} className="relative justify-self-end">
      <button
        type="button"
        aria-label="Ações do título"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => setAberto(atual => !atual)}
        className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#8A968D] transition hover:bg-[#F1F4F2] hover:text-[#0B1F14]"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" />
        </svg>
      </button>
      {aberto && (
        <div role="menu" className="absolute right-0 top-9 z-30 w-[168px] rounded-[12px] bg-white p-1 shadow-[0_12px_30px_rgba(11,31,20,.16)] ring-1 ring-[#E3EBE6]">
          <button type="button" role="menuitem" onClick={() => { setAberto(false); onEditar(title); }} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[12.5px] font-medium hover:bg-[#F1F4F2]">
            <EditIcon size={15} />Editar
          </button>
          <button type="button" role="menuitem" onClick={() => { setAberto(false); onExcluir(title); }} className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[12.5px] font-medium text-[#8E1F16] hover:bg-[#FDECEA]">
            <DeleteIcon size={15} />Excluir
          </button>
        </div>
      )}
    </div>
  );
}

function SingleList({ data, titles, onSettle, pending, onEditar, onExcluir }: {
  data: Overview;
  titles: Title[];
  onSettle: (id: number) => void;
  pending: boolean;
  onEditar: (title: Title) => void;
  onExcluir: (title: Title) => void;
}) {
  const visible = new Set(titles.map(title => title.id));
  const groups = data.groups
    .map(group => ({ ...group, titles: group.titles.filter(title => visible.has(title.id)) }))
    .filter(group => group.titles.length > 0);

  if (groups.length === 0) {
    return (
      <CartaoVazio
        icone={<FilterIcon size={20} />}
        titulo="Nenhum título nesta seleção"
        texto="Troque a aba ou limpe a busca para ver os outros títulos do mês."
        alturaMinima={160}
      />
    );
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
                ? `${formatMoney(group.receivable)} a receber · ${formatMoney(Math.abs(group.payable))} a pagar`
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
              <span className="hidden lg:block"><TitleMenu title={title} onEditar={onEditar} onExcluir={onExcluir} /></span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

// A última coluna precisa caber "+ R$ 17.930,00" sem quebrar o sinal em outra linha.
const COLUMN_GRID = "grid grid-cols-[64px_minmax(0,1fr)_auto_32px] gap-2.5 sm:grid-cols-[74px_minmax(0,1fr)_106px_146px_32px_32px]";

function SideColumn({ side, titles, total, warning, onSettle, pending, onNew, onEditar, onExcluir }: {
  side: "receber" | "pagar";
  titles: Title[];
  total: number;
  warning: { text: string; amount: number } | null;
  onSettle: (id: number) => void;
  pending: boolean;
  onNew: () => void;
  onEditar: (title: Title) => void;
  onExcluir: (title: Title) => void;
}) {
  const podeEscrever = !useSomenteLeitura();
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
            <TitleMenu title={title} onEditar={onEditar} onExcluir={onExcluir} />
          </div>
        ))
      )}

      {podeEscrever && (
      <button
        type="button"
        onClick={onNew}
        className="mt-3 flex h-11 items-center justify-center gap-2 rounded-[12px] border border-dashed border-[#B9C7BE] text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
      >
        <PlusIcon size={14} />
        {receiving ? "Nova cobrança" : "Nova despesa"}
      </button>
      )}
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
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  // Duas colunas por padrão: a pergunta da tela é "o que entra contra o que
  // sai", e lado a lado ela se responde sem rolar.
  const [arrangement, setArrangement] = useState<Arrangement>("colunas");
  const [tab, setTab] = useState<Tab>("tudo");
  const [search, setSearch] = useState("");
  const [, setLocation] = useLocation();

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const query = trpc.payables.overview.useQuery(period);
  /* Nenhum título aberto no mês — nem atrasado de mês anterior. */
  const semContas = useSemContas();
  const mesVazio = semContas || (Boolean(query.data) && query.data!.open.length === 0);
  /* Sem dado ainda, a projeção vazia aponta para o último dia do mês na tela. */
  const fimDoMes = `${period.year}-${String(period.month).padStart(2, "0")}-${String(new Date(period.year, period.month, 0).getDate()).padStart(2, "0")}`;
  const organizationQuery = trpc.organization.options.useQuery();
  const utils = trpc.useUtils();
  const invalidarTitulos = () => Promise.all([
    utils.payables.invalidate(),
    utils.transactions.invalidate(),
    utils.cashflow.invalidate(),
    utils.dre.invalidate(),
  ]);
  /*
   * Liquidar e desfazer são o mesmo toggleStatus, em duas instâncias: a de
   * desfazer não pode disparar o toast de "liquidado" de novo. O título vem
   * do dado que a tela já tinha antes de invalidar — é só para a legenda.
   */
  const reverter = trpc.transactions.toggleStatus.useMutation({
    onSuccess: async () => { await invalidarTitulos(); toast.success("Liquidação desfeita"); },
    onError: error => toast.error(error.message),
  });
  const settle = trpc.transactions.toggleStatus.useMutation({
    onSuccess: async (_registro, variables) => {
      const titulo = query.data?.open.find(item => item.id === variables.id);
      await invalidarTitulos();
      toast.desfazer({
        titulo: "Título liquidado",
        detalhe: titulo ? `${titulo.description} · ${signedMoney(titulo.amount)}` : undefined,
        onDesfazer: () => reverter.mutate({ id: variables.id }),
      });
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

  const registrarExportacao = useRegistrarExportacao();
  const exportCsv = () => {
    registrarExportacao("A pagar e receber");
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

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";
  /*
   * O lançamento nasce aqui, não em outra tela.
   *
   * Antes estes botões navegavam para Lançamentos: a pessoa clicava em "Nova
   * despesa" olhando os títulos de setembro e era levada para outra página,
   * onde ainda precisava clicar de novo. O modal é o mesmo da Visão geral, e
   * abre já na natureza que o botão promete.
   */
  /*
   * `?novo=lancamento` abre o modal já na chegada — o mesmo padrão do
   * `?nova=conta` de Contas e categorias. Quem vem do estado vazio de Pagas e
   * recebidas clicou em "Novo lançamento"; cair aqui e ter de achar o botão de
   * novo é um clique virando dois. `despesa` abre em saída; `lancamento` e
   * `cobranca` abrem em entrada, como o botão do cabeçalho. A URL é limpa com
   * `replace` para recarregar não reabrir o modal.
   */
  const [novoLancamento, setNovoLancamento] = useState<TransactionType | null>(() => {
    const pedido = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("novo") : null;
    if (pedido === "despesa") return "saida";
    if (pedido === "lancamento" || pedido === "cobranca") return "entrada";
    return null;
  });
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("novo")) return;
    window.history.replaceState(null, "", "/a-pagar-e-receber");
  }, []);
  const podeEscrever = !useSomenteLeitura();
  const createMutation = trpc.transactions.create.useMutation();
  const updateMutation = trpc.transactions.update.useMutation();
  const deleteMutation = trpc.transactions.delete.useMutation();
  /* O lançamento inteiro, buscado só quando alguém pede para editar: a lista só tem a projeção. */
  const [editando, setEditando] = useState<Parameters<typeof TransactionModal>[0]["transaction"]>(null);
  const [edicaoRecorrente, setEdicaoRecorrente] = useState<{ transaction: Transaction; input: TransactionInput } | null>(null);
  const [excluindo, setExcluindo] = useState<Title | null>(null);
  const [buscandoEdicao, setBuscandoEdicao] = useState(false);

  /* Tudo que mostra um número muda quando um título muda; é a mesma lista do salvar. */
  const recarregar = () => Promise.all([
    utils.payables.invalidate(),
    utils.transactions.invalidate(),
    utils.cashflow.invalidate(),
    utils.organization.invalidate(),
    utils.dre.invalidate(),
    utils.settled.invalidate(),
  ]);

  const abrirEdicao = async (title: Title) => {
    setBuscandoEdicao(true);
    try {
      setEditando(await utils.transactions.byId.fetch({ id: title.id }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o lançamento");
    } finally {
      setBuscandoEdicao(false);
    }
  };

  const concluirEdicao = async (input: TransactionInput, scope: SeriesScope) => {
    const target = edicaoRecorrente?.transaction ?? editando;
    if (!target) return false;
    try {
      const result = await updateMutation.mutateAsync({ id: target.id, scope, ...input });
      void recarregar().catch(() => toast.info("Lançamento salvo. Atualize a página para recarregar os indicadores."));
      toast.success(result.updatedCount > 1
        ? `${result.updatedCount} parcelas atualizadas`
        : "Lançamento atualizado");
      setEditando(null);
      setEdicaoRecorrente(null);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento");
      return false;
    }
  };

  const salvarEdicao = async (input: TransactionInput) => {
    if (!editando) return false;
    if (editando.recurrenceGroupId) {
      setEdicaoRecorrente({ transaction: editando, input });
      return false;
    }
    return concluirEdicao(input, "single");
  };

  const confirmarExclusao = async () => {
    if (!excluindo) return;
    try {
      await deleteMutation.mutateAsync({ id: excluindo.id, scope: "single" });
      await recarregar();
      toast.success("Título excluído");
      setExcluindo(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o título");
    }
  };
  const organizationOptions = organizationQuery.data ?? { accounts: [], categories: [], costCenters: [] };

  const salvarLancamento = async (input: TransactionInput) => {
    try {
      const resultado = await createMutation.mutateAsync(input);
      void recarregar().catch(() => toast.info("Lançamento salvo. Atualize a página para recarregar os indicadores."));
      toast.success(resultado.monthCount > 1
        ? `${resultado.monthCount} lançamentos criados, de ${formatDate(input.transactionDate)} em diante`
        : "Lançamento salvo");
      setNovoLancamento(null);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o lançamento");
      return false;
    }
  };

  const tabs: Array<{ key: Tab; label: string; count: number; danger?: boolean }> = data
    ? [
        { key: "tudo", label: "Tudo", count: data.open.length },
        { key: "receber", label: "A receber", count: data.receivables.length },
        { key: "pagar", label: "A pagar", count: data.payables.length },
        { key: "atrasados", label: "Atrasados", count: data.overdue.length, danger: true },
      ]
    : [];

  return (
    <main className="voltura vg-pagina">
      <div className="flex w-full">
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={<OverdueCard count={overduePayables.length} amount={data?.totals.overduePayable ?? 0} />}
        />

        <section className="vg-casca vg-conteudo flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={ArrowUpIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">A pagar e receber</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {!data
                  ? monthLabel
                  : mesVazio
                    ? `nenhum título aberto em ${monthLabel.toLowerCase()}`
                    : `${data.open.length} ${data.open.length === 1 ? "título aberto" : "títulos abertos"} em ${monthLabel.toLowerCase()}`}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" aria-label="Mês anterior" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} className="rotate-180" />
              </button>
              <div className="flex h-10 min-w-[120px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{rotuloCurtoDoMes(period, true)}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <div className={`flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1] ${mesVazio ? "pointer-events-none opacity-50" : ""}`}>
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

            <Hint label="Exportar CSV"><button type="button" aria-label="Exportar títulos" onClick={exportCsv} disabled={mesVazio} className={`${toolButton} disabled:pointer-events-none disabled:opacity-50`}><DownloadIcon size={17} /></button></Hint>
            {podeEscrever && (
            <button
              type="button"
              onClick={() => setNovoLancamento("entrada")}
              title="Abre a tela de lançamentos, onde a conta é cadastrada"
              className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold sm:px-4 text-white transition hover:bg-[#0F9E4E] active:scale-[.98]"
            >
              <PlusIcon size={15} />
              Nova conta
            </button>
            )}
            <ProfileMenu />
          </header>

          {query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              Não foi possível carregar os títulos: {query.error.message}
            </div>
          )}
          {!mesVazio && query.isPending && !query.error && (
            <>
              <KpiRowSkeleton />
              <div className="flex min-h-[320px] flex-1 items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]">
                <GranafyLoader label="Carregando títulos…" />
              </div>
            </>
          )}

          {mesVazio && (
            <>
              <KpisDoMesVazio projectedCashDate={data?.projectedCashDate ?? fimDoMes} />
              <MesVazio onNovaCobranca={() => setNovoLancamento("entrada")} onNovaDespesa={() => setNovoLancamento("saida")} />
              <p className="text-[12px] text-[#4C6355]">
                Título é lançamento pendente e o vencimento é a data dele. Atrasados de meses anteriores
                aparecem aqui mesmo quando o mês selecionado é outro.
              </p>
            </>
          )}

          {data && !mesVazio && (
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
                    ? `${overduePayables.length} em atraso · ${formatMoney(Math.abs(data.totals.overduePayable))}`
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

                  <SingleList data={data} titles={filtered} onSettle={id => settle.mutate({ id })} pending={settle.isPending} onEditar={abrirEdicao} onExcluir={setExcluindo} />
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
                      pending={settle.isPending} onEditar={abrirEdicao} onExcluir={setExcluindo}
                      onNew={() => setNovoLancamento("entrada")}
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
                      pending={settle.isPending} onEditar={abrirEdicao} onExcluir={setExcluindo}
                      onNew={() => setNovoLancamento("saida")}
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
      {editando && user?.id && user.activeCompanyId && (
        <TransactionModal
          transaction={editando}
          defaultDate={today()}
          draftScope={{ userId: user.id, companyId: user.activeCompanyId }}
          pending={updateMutation.isPending}
          options={organizationOptions}
          onManageOrganization={() => setLocation("/organizacao")}
          onClose={() => setEditando(null)}
          onSave={salvarEdicao}
        />
      )}
      {edicaoRecorrente && (
        <SeriesScopeDialog
          action="save"
          transaction={edicaoRecorrente.transaction}
          pending={updateMutation.isPending}
          onCancel={() => setEdicaoRecorrente(null)}
          onConfirm={scope => void concluirEdicao(edicaoRecorrente.input, scope)}
        />
      )}
      {buscandoEdicao && (
        <div role="status" aria-live="polite" className="fixed inset-0 z-[85] flex items-center justify-center bg-[#0B1F14]/20">
          <GranafyLoader size="sm" label="Abrindo o lançamento…" />
        </div>
      )}
      {excluindo && (
        <div role="dialog" aria-modal="true" aria-labelledby="excluir-titulo" className="fixed inset-0 z-[80] flex items-center justify-center bg-[#0B1F14]/[.42] p-4" onMouseDown={event => event.target === event.currentTarget && !deleteMutation.isPending && setExcluindo(null)}>
          <div className="modal-enter w-full max-w-[420px] rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.24)]">
            <h2 id="excluir-titulo" className="text-[18px] font-bold tracking-[-.01em]">Excluir este título?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4C6355]">
              <strong className="font-semibold text-[#0B1F14]">{excluindo.description}</strong> · {formatDate(excluindo.transactionDate)} · {signedMoney(excluindo.amount)}
            </p>
            <p className="mt-3 rounded-[14px] bg-[#FDECEA] px-3.5 py-3 text-[12px] leading-relaxed text-[#8E1F16]">
              O lançamento é apagado, não arquivado. Se ele veio de uma série recorrente, só esta parcela sai.
            </p>
            <div className="mt-5 flex gap-2.5">
              <button type="button" disabled={deleteMutation.isPending} onClick={() => setExcluindo(null)} className="h-12 flex-1 rounded-[12px] bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] hover:bg-[#E3EBE6] disabled:opacity-50">Cancelar</button>
              <button type="button" disabled={deleteMutation.isPending} onClick={confirmarExclusao} className="h-12 flex-[1.4] rounded-[12px] bg-[#B3261E] text-[13.5px] font-bold text-white hover:bg-[#9A1F18] disabled:opacity-60">
                {deleteMutation.isPending ? "Excluindo…" : "Excluir título"}
              </button>
            </div>
          </div>
        </div>
      )}
      {novoLancamento && user?.id && user.activeCompanyId && (
        <TransactionModal
          defaultType={novoLancamento}
          defaultDate={today()}
          draftScope={{ userId: user.id, companyId: user.activeCompanyId }}
          pending={createMutation.isPending}
          options={organizationOptions}
          onManageOrganization={() => setLocation("/organizacao")}
          onClose={() => setNovoLancamento(null)}
          onSave={salvarLancamento}
        />
      )}
    </main>
  );
}
