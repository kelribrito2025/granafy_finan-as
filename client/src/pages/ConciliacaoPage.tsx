import { Hint } from "@/components/Hint";
import { AppSidebar } from "@/components/AppSidebar";
import { AuroraSurface } from "@/components/AuroraSurface";
import { PageIcon } from "@/components/PageIcon";
import { GranafyLoader } from "@/components/GranafyLoader";
import { KpiRowSkeleton } from "@/components/PageSkeleton";
import {
  CardIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  PlusIcon,
  SearchIcon,
  SidebarMenuIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { SidebarStatCard } from "@/components/SidebarStatCard";
import { ProfileMenu } from "@/components/ProfileMenu";
import { formatDate, formatMoney } from "@/lib/appFormat";
import { currencyInputToNumber, formatCurrencyInput, formatCurrencyValue } from "@/lib/currency";
import { trpc } from "@/lib/trpc";
import { useSemContas } from "@/hooks/useSemContas";
import { summarizeBatch } from "@shared/reconciliation";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePrivacy } from "@/contexts/PrivacyContext";
import { useLocation } from "wouter";

/*
 * O `overview` virou união: ou o pacote da conciliação, ou "não há conta". O
 * `Extract` pega o primeiro, que é o que esta tela inteira usa — sem ele, todo
 * `Overview["items"]` do arquivo passaria a não compilar, e a resposta certa
 * não é afrouxar o tipo aqui, é dizer de qual dos dois se está falando.
 */
type Overview = Extract<inferRouterOutputs<AppRouter>["reconciliation"]["overview"], { semContas: false }>;
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


type Classification = "transferencia" | "pessoal" | "duplicidade" | "estorno" | "fora_dos_relatorios";

/**
 * As cinco saídas para uma movimentação sem lançamento. Cada uma declara o
 * efeito no saldo, porque "ignorar" escondia justamente isso.
 */
const CLASSIFICATIONS: Array<{ value: Classification; label: string; effect: string }> = [
  { value: "transferencia", label: "Transferência entre contas", effect: "some no consolidado e fica fora do DRE" },
  { value: "pessoal", label: "Movimento pessoal do sócio", effect: "sai do resultado da empresa, continua no extrato" },
  { value: "duplicidade", label: "Duplicidade importada", effect: "arquiva a linha repetida, mantendo a original" },
  { value: "estorno", label: "Estorno", effect: "os dois itens se cancelam no período" },
  { value: "fora_dos_relatorios", label: "Não contabilizar nos relatórios", effect: "fica no extrato, sai do DRE e do fluxo · exige justificativa" },
];

const CLASSIFICATION_LABELS: Record<Classification, string> =
  Object.fromEntries(CLASSIFICATIONS.map(item => [item.value, item.label])) as Record<Classification, string>;

function ModalShell({ title, subtitle, icon = CheckIcon, children, onClose }: {
  title: string;
  subtitle?: string;
  /** O selo à esquerda do título. Cada modal manda o seu; conciliar é o padrão. */
  icon?: IconlyIcon;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-[#0B1F14]/[.42] p-4 sm:p-10">
      <div className="flex w-full max-w-[520px] flex-col gap-5 rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.24)]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={icon} />
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold">{title}</h2>
            {subtitle && <p className="mt-1 truncate text-[13px] text-[#4C6355]" title={subtitle}>{subtitle}</p>}
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#4C6355] transition hover:bg-[#E3EBE6]"
          >
            <CloseIcon size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Menu de ações da linha. */
/**
 * A conciliação de quem ainda não tem conta bancária.
 *
 * Antes isto era uma barra vermelha com uma frase — a mesma moldura de uma
 * falha de servidor, porque o servidor de fato respondia com erro. Conta nova
 * que está começando não errou nada.
 *
 * O botão leva para Contas e categorias com o modal de Nova conta JÁ ABERTO. É
 * a diferença entre "vá cadastrar" e cadastrar: sem isso a pessoa cai numa
 * página nova e precisa achar o botão outra vez.
 *
 * Os três passos NÃO prometem Open Finance. O desenho pedia "sincronize via
 * Open Finance ou envie o extrato", e sincronização bancária não existe no
 * produto — só a importação de OFX e CSV. Prometer conexão automática na tela
 * de boas-vindas seria a decepção mais cara que esta tela pode causar.
 */
function SemContasBancarias({ onCadastrar }: { onCadastrar: () => void }) {
  const [explicando, setExplicando] = useState(false);

  /*
   * Os ícones são os do desenho, em traço — os do catálogo Iconly vêm em caixa
   * (o check dentro de um quadrado arredondado) e não são os mesmos.
   */
  const passos = [
    {
      titulo: "Cadastre a conta",
      texto: "Escolha o banco, o tipo de conta e informe o saldo inicial.",
      icone: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
    },
    {
      titulo: "Importe o extrato",
      texto: "Envie o arquivo OFX ou CSV que o seu banco exporta.",
      icone: <><path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" /><path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.5-1.5" /></>,
    },
    {
      titulo: "Confirme os pares",
      texto: "O GranaFy sugere as combinações; você só revisa e confirma em lote.",
      icone: <path d="M20 6L9 17l-5-5" />,
    },
  ];

  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-7 rounded-[20px] bg-white px-6 py-14 text-center ring-1 ring-[#E1E8E3] sm:px-10">
      {/* Dois extratos e o sinal de somar: o desenho do que falta acontecer. */}
      <div aria-hidden="true" className="relative flex h-[112px] w-[112px] items-center justify-center">
        <span className="absolute inset-0 rounded-[36px] bg-[#F1FBF6]" />
        <span className="absolute left-[14px] top-[22px] h-[38px] w-[56px] -rotate-[8deg] rounded-[10px] border-[1.5px] border-dashed border-[#B9C7BE] bg-white" />
        <span className="absolute right-[14px] top-[30px] flex h-[38px] w-[56px] rotate-[6deg] items-center justify-center rounded-[10px] border-[1.5px] border-[#12B85C] bg-[#DFF6EA] text-[#0A7A42]">
          <CheckIcon size={18} />
        </span>
        <span className="absolute bottom-[14px] left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] text-white shadow-[0_6px_16px_rgba(18,184,92,.35)]">
          <PlusIcon size={16} />
        </span>
      </div>

      <div className="flex max-w-[520px] flex-col gap-2">
        <h2 className="text-[22px] font-bold tracking-[-.02em]">Nenhuma conta bancária para conciliar</h2>
        <p className="text-[14px] leading-relaxed text-[#4C6355]">
          A conciliação compara o extrato do banco com os lançamentos do GranaFy. Cadastre a
          primeira conta para começar — leva menos de um minuto.
        </p>
      </div>

      <button
        type="button"
        onClick={onCadastrar}
        className="flex h-12 items-center gap-2.5 rounded-[12px] bg-[#12B85C] px-6 text-[14px] font-bold text-white transition hover:bg-[#0F9E4E]"
      >
        <PlusIcon size={16} />
        Cadastrar conta bancária
      </button>

      <div className="grid w-full max-w-[820px] gap-3.5 border-t border-[#F1F4F2] pt-6 sm:grid-cols-3">
        {passos.map((passo, indice) => (
          <div key={passo.titulo} className="flex flex-col items-start gap-2.5 rounded-[16px] bg-[#F8FAF9] p-[18px] text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#DFF6EA] text-[#0A7A42]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {passo.icone}
              </svg>
            </span>
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
        Como funciona a conciliação bancária {explicando ? "↑" : "→"}
      </button>
      {explicando && (
        <div className="flex w-full max-w-[640px] flex-col gap-3 rounded-[16px] bg-[#F8FAF9] p-5 text-left text-[13px] leading-relaxed text-[#28382E]">
          <p>
            O extrato do banco diz o que <strong>entrou e saiu de verdade</strong>. Os lançamentos do
            GranaFy dizem o que <strong>você registrou</strong>. Conciliar é casar um com o outro,
            linha a linha, até que os dois contem a mesma história.
          </p>
          <p>
            Para cada movimentação do extrato, o GranaFy procura um lançamento em aberto com o mesmo
            valor, na mesma conta, em até três dias — e sugere o par. Você confirma os que estão certos,
            corrige os que não estão, e cria na hora o lançamento de quem entrou no banco sem passar
            por aqui.
          </p>
          <p>
            No fim, o saldo da conta no GranaFy bate com o do banco, e o que ficou sem par é
            exatamente a lista do que falta explicar.
          </p>
        </div>
      )}
    </section>
  );
}

function RowMenu({ item, onAction, onClose }: {
  item: Item;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const conciliada = item.status === "conciliado";
  const classificada = item.status === "classificado";
  const acoes: Array<{ key: string; label: string; danger?: boolean }> = conciliada || classificada
    ? [
        { key: "undo", label: conciliada ? "Desfazer conciliação" : "Desfazer classificação", danger: true },
        { key: "history", label: "Ver histórico" },
      ]
    : [
        ...(item.suggestion ? [{ key: "confirm", label: "Confirmar sugestão" }] : []),
        { key: "link", label: "Vincular a um lançamento" },
        { key: "create", label: "Criar lançamento" },
        { key: "split", label: "Dividir entre lançamentos" },
        { key: "classify", label: "Classificar sem lançamento" },
        { key: "history", label: "Ver histórico" },
      ];

  return (
    <>
      <button type="button" aria-label="Fechar menu" className="fixed inset-0 z-40 cursor-default" onClick={onClose} />
      <div className="absolute right-0 top-9 z-50 w-[236px] overflow-hidden rounded-[9px] bg-white py-1.5 shadow-[0_14px_34px_rgba(11,31,20,.16)] ring-1 ring-[#E3EBE6]">
        {acoes.map(acao => (
          <button
            key={acao.key}
            type="button"
            onClick={() => { onClose(); onAction(acao.key); }}
            className={`flex w-full items-center px-3.5 py-2.5 text-left text-[13px] transition hover:bg-[#F1FBF6] ${
              acao.danger ? "text-[#B3261E]" : "text-[#28382E]"
            }`}
          >
            {acao.label}
          </button>
        ))}
      </div>
    </>
  );
}

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
function BatchBar({ items, onConfirm, onGroup, pending }: {
  items: Item[];
  onConfirm: () => void;
  onGroup: () => void;
  pending: boolean;
}) {
  const comSugestao = items.filter(item => item.suggestion).length;
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
      <span className="ml-auto flex items-center gap-2">
        <button
          type="button"
          disabled={pending || comSugestao === 0}
          title={comSugestao === 0 ? "Nenhuma das selecionadas tem sugestão" : undefined}
          onClick={onConfirm}
          className="flex h-[38px] items-center gap-2 rounded-[11px] bg-[#12B85C] px-3.5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <CheckIcon size={14} />
          {pending ? "Conciliando…" : `Conciliar ${comSugestao > 0 ? comSugestao : ""}`.trim()}
        </button>
        <button
          type="button"
          disabled={pending || items.length < 2}
          title={items.length < 2 ? "Selecione ao menos duas movimentações" : "Várias movimentações para um lançamento só"}
          onClick={onGroup}
          className="flex h-[38px] items-center gap-2 rounded-[11px] border border-[#1F3D2B] px-3.5 text-[13px] font-semibold text-[#EAF4EE] transition hover:bg-[#153021] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Agrupar
        </button>
      </span>
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
        <div className="flex items-start gap-3">
          <ModalIcon icon={CheckIcon} />
          <div className="min-w-0">
            <h2 className="text-[18px] font-bold">
              Conciliar {resumo.count} {resumo.count === 1 ? "movimentação" : "movimentações"}?
            </h2>
            <p className="mt-1 text-[13px] text-[#4C6355]">os lançamentos ficam marcados como conferidos</p>
          </div>
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


/** Classificar sem lançamento: as cinco saídas do modelo. */
function ClassifyModal({ item, onClose, onConfirm, pending }: {
  item: Item;
  onClose: () => void;
  onConfirm: (values: { classification: Classification; note: string }) => void;
  pending: boolean;
}) {
  const [classification, setClassification] = useState<Classification>("transferencia");
  const [note, setNote] = useState("");
  const exigeNota = classification === "fora_dos_relatorios";

  return (
    <ModalShell title="Classificar movimentação" subtitle={item.description} onClose={onClose}>
      <div className="flex flex-col gap-2">
        {CLASSIFICATIONS.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => setClassification(option.value)}
            className={`flex items-start gap-3 rounded-[14px] p-3.5 text-left transition ${
              classification === option.value
                ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                : "border border-[#E3EBE6] hover:bg-[#F8FAF9]"
            }`}
          >
            <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
              classification === option.value ? "bg-[#12B85C]" : "border-[1.5px] border-[#C9D4CD]"
            }`}>
              {classification === option.value && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className={`block text-[14px] font-semibold ${classification === option.value ? "text-[#0A7A42]" : ""}`}>
                {option.label}
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[#4C6355]">{option.effect}</span>
            </span>
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-semibold text-[#4C6355]">
          Justificativa {exigeNota ? "(obrigatória)" : "(opcional)"}
        </span>
        <textarea
          value={note}
          onChange={event => setNote(event.target.value)}
          rows={2}
          placeholder="Por que esta movimentação recebe essa classificação?"
          className="w-full resize-none rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[#12B85C]"
        />
      </label>

      <p className="rounded-xl bg-[#FFF3E6] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#8A4B00]">
        Classificar não apaga a movimentação nem zera a diferença de saldo sozinho. A linha
        continua no extrato, com a explicação registrada no histórico.
      </p>

      <div className="flex gap-2.5">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || (exigeNota && note.trim().length < 3)}
          onClick={() => onConfirm({ classification, note: note.trim() })}
          className="h-11 flex-1 rounded-xl bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
        >
          {pending ? "Salvando…" : "Classificar"}
        </button>
      </div>
    </ModalShell>
  );
}

type Part = { description: string; categoryId: number | null; amount: string };

/**
 * Criar o lançamento que faltava — ou dividir a movimentação em vários.
 *
 * A soma tem que fechar ao centavo: o botão só libera quando o que sobra é
 * zero, porque dividir errado deixaria dinheiro fora do razão sem avisar.
 */
function CreateModal({ item, categories, split, onClose, onConfirm, pending }: {
  item: Item;
  categories: Array<{ id: number; name: string; type: string }>;
  split: boolean;
  onClose: () => void;
  onConfirm: (parts: Array<{ description: string; categoryId: number; amount: number }>) => void;
  pending: boolean;
}) {
  const tipo = item.amount < 0 ? "saida" : "entrada";
  const compativeis = categories.filter(category => category.type === "ambos" || category.type === tipo);
  const [parts, setParts] = useState<Part[]>(() =>
    split
      ? [
          { description: item.description, categoryId: compativeis[0]?.id ?? null, amount: "" },
          { description: item.description, categoryId: compativeis[0]?.id ?? null, amount: "" },
        ]
      : [{ description: item.description, categoryId: compativeis[0]?.id ?? null, amount: Math.abs(item.amount).toFixed(2) }]
  );

  const valores = parts.map(part => Number(part.amount.replace(",", ".")) || 0);
  const somado = Math.round(valores.reduce((total, value) => total + value, 0) * 100) / 100;
  const alvo = Math.abs(item.amount);
  const resta = Math.round((alvo - somado) * 100) / 100;
  const completo = resta === 0 && parts.every(part => part.categoryId && part.description.trim().length >= 2);

  const atualizar = (index: number, campo: keyof Part, valor: string | number | null) =>
    setParts(current => current.map((part, i) => (i === index ? { ...part, [campo]: valor } : part)));

  return (
    <ModalShell
      title={split ? "Dividir entre lançamentos" : "Criar lançamento"}
      subtitle={`${item.description} · ${signedMoney(item.amount)}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-3">
        {parts.map((part, index) => (
          <div key={index} className="flex flex-col gap-2 rounded-[14px] border border-[#E3EBE6] p-3.5">
            <input
              value={part.description}
              onChange={event => atualizar(index, "description", event.target.value)}
              placeholder="Descrição do lançamento"
              className="h-10 w-full rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3 text-[13.5px] outline-none focus:border-[#12B85C]"
            />
            <div className="flex gap-2">
              <select
                value={part.categoryId ?? ""}
                onChange={event => atualizar(index, "categoryId", Number(event.target.value))}
                className="h-10 min-w-0 flex-1 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3 text-[13.5px] outline-none focus:border-[#12B85C]"
              >
                {compativeis.map(category => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
              <input
                value={part.amount}
                onChange={event => atualizar(index, "amount", event.target.value.replace(/[^\d.,]/g, ""))}
                placeholder="0,00"
                inputMode="decimal"
                className="h-10 w-[110px] shrink-0 rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3 text-right text-[13.5px] outline-none focus:border-[#12B85C]"
              />
              {parts.length > 1 && (
                <button
                  type="button"
                  aria-label="Remover parte"
                  onClick={() => setParts(current => current.filter((_, i) => i !== index))}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#8A968D] transition hover:bg-[#FDECEA] hover:text-[#B3261E]"
                >
                  <CloseIcon size={15} />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setParts(current => [...current, { description: item.description, categoryId: compativeis[0]?.id ?? null, amount: "" }])}
          className="h-10 rounded-xl border border-dashed border-[#B9C7BE] px-3.5 text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
        >
          + Outra parte
        </button>
        <span className={`ml-auto text-[13px] font-semibold ${resta === 0 ? "text-[#0A7A42]" : "text-[#B3261E]"}`}>
          {resta === 0 ? "fecha com a movimentação" : `faltam ${formatMoney(resta)}`}
        </span>
      </div>

      <div className="flex gap-2.5">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || !completo}
          onClick={() => onConfirm(parts.map((part, index) => ({
            description: part.description.trim(),
            categoryId: part.categoryId!,
            amount: item.amount < 0 ? -valores[index] : valores[index],
          })))}
          className="h-11 flex-1 rounded-xl bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
        >
          {pending ? "Salvando…" : split ? `Criar ${parts.length} lançamentos` : "Criar lançamento"}
        </button>
      </div>
    </ModalShell>
  );
}

/** Vincular a um lançamento que já existe. Só entram os de valor idêntico. */
function LinkModal({ item, candidates, onClose, onConfirm, pending }: {
  item: Item;
  candidates: Array<{ id: number; description: string; transactionDate: string; amount: number; category: string }>;
  onClose: () => void;
  onConfirm: (transactionId: number) => void;
  pending: boolean;
}) {
  const [escolhido, setEscolhido] = useState<number | null>(candidates[0]?.id ?? null);
  return (
    <ModalShell title="Vincular a um lançamento" subtitle={`${item.description} · ${signedMoney(item.amount)}`} onClose={onClose}>
      {candidates.length === 0 ? (
        <p className="rounded-xl bg-[#F8FAF9] px-4 py-6 text-center text-[13px] leading-relaxed text-[#4C6355]">
          Nenhum lançamento em aberto com este valor, nesta conta, em até três dias.
          Use “Criar lançamento” para registrar um novo.
        </p>
      ) : (
        <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {candidates.map(candidate => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setEscolhido(candidate.id)}
              className={`flex items-center gap-3 rounded-[14px] p-3.5 text-left transition ${
                escolhido === candidate.id
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                  : "border border-[#E3EBE6] hover:bg-[#F8FAF9]"
              }`}
            >
              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                escolhido === candidate.id ? "bg-[#12B85C]" : "border-[1.5px] border-[#C9D4CD]"
              }`}>
                {escolhido === candidate.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{candidate.description}</span>
                <span className="block truncate text-[12px] text-[#4C6355]">
                  {formatDate(candidate.transactionDate)} · {candidate.category}
                </span>
              </span>
              <span className={`shrink-0 text-[13.5px] font-bold ${candidate.amount < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                {signedMoney(candidate.amount)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2.5">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || escolhido === null}
          onClick={() => escolhido !== null && onConfirm(escolhido)}
          className="h-11 flex-1 rounded-xl bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
        >
          {pending ? "Vinculando…" : "Vincular"}
        </button>
      </div>
    </ModalShell>
  );
}


/**
 * O formulário que destrava a conciliação de quem importou sem saldo.
 *
 * Sem saldo declarado a diferença é `null` e a tela só escreve "—". Aqui a
 * pessoa abre o app do banco, lê o saldo do último dia do mês e digita. Fica
 * marcado como informado, e a alteração entra no histórico.
 */
function StatementBalanceForm({ accountId, monthStart, monthEnd, current, currentDate, origin, onSaved }: {
  accountId: number | null;
  monthStart: string;
  monthEnd: string;
  current: number | null;
  currentDate: string | null;
  origin: "arquivo" | "manual" | null;
  onSaved: () => void;
}) {
  const [aberto, setAberto] = useState(current === null);
  const [valor, setValor] = useState(current === null ? "" : formatCurrencyValue(current));
  /*
   * A data é do saldo, e ela importa: o cálculo compara o saldo do banco
   * naquele dia com o do sistema no mesmo dia. Informar um saldo do dia 7
   * carimbado como dia 30 compara duas fotos de momentos diferentes e a
   * diferença sai errada.
   */
  const [data, setData] = useState(currentDate ?? monthEnd);
  const salvar = trpc.reconciliation.setStatementBalance.useMutation();

  if (accountId === null) return null;

  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="self-start text-[12.5px] font-semibold text-[#0A7A42] transition hover:underline"
      >
        {origin === "manual" ? "Corrigir o saldo informado" : "Informar outro saldo"}
      </button>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5 rounded-[14px] bg-[#F1FBF6] p-4"
      onSubmit={async event => {
        event.preventDefault();
        const numero = currencyInputToNumber(valor);
        if (!Number.isFinite(numero)) return toast.info("Informe o saldo do extrato.");
        try {
          await salvar.mutateAsync({ accountId, asOf: data, balance: numero });
          toast.success("Saldo do extrato informado");
          setAberto(false);
          onSaved();
        } catch (error) {
          toast.error(error instanceof Error ? error.message : "Não foi possível salvar o saldo");
        }
      }}
    >
      <span className="text-[12.5px] font-semibold text-[#0A7A42]">
        {current === null ? "Este extrato não declara saldo" : "Corrigir o saldo do extrato"}
      </span>
      <p className="text-[11.5px] leading-relaxed text-[#28382E]">
        Sem o saldo do banco, a conciliação não consegue apontar diferença — ela fica cega. Abra o app do banco,
        escolha o dia e informe o saldo daquele dia.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="flex h-11 items-center gap-2 rounded-xl border border-[#C7E8D6] bg-white px-3.5">
          <span className="text-[11.5px] font-semibold text-[#8A968D]">Saldo em</span>
          <input
            type="date"
            required
            value={data}
            min={monthStart}
            max={monthEnd}
            onChange={event => setData(event.target.value)}
            aria-label="Data do saldo do extrato"
            className="bg-transparent text-[13px] font-semibold outline-none"
          />
        </label>
        <span className="flex h-11 min-w-[150px] flex-1 items-center gap-2 rounded-xl border border-[#C7E8D6] bg-white px-3.5">
          <span className="text-[12.5px] font-semibold text-[#8A968D]">R$</span>
          <input
            autoFocus
            inputMode="decimal"
            value={valor}
            onChange={event => setValor(formatCurrencyInput(event.target.value))}
            placeholder="0,00"
            aria-label="Saldo do extrato"
            className="min-w-0 flex-1 bg-transparent text-[14px] font-bold outline-none"
          />
        </span>
        <button
          type="submit"
          disabled={salvar.isPending}
          className="h-11 rounded-xl bg-[#12B85C] px-4 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-60"
        >
          {salvar.isPending ? "Salvando…" : "Informar saldo"}
        </button>
        {current !== null && (
          <button
            type="button"
            onClick={() => setAberto(false)}
            className="h-11 rounded-xl bg-[#F1F4F2] px-4 text-[13px] font-semibold text-[#4C6355]"
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  );
}

/** A composição da diferença: quais movimentações o razão não tem. */
function DifferenceModal({ data, accountId, firstDayOfMonth, lastDayOfMonth, onClose, onResolve, onBalanceSaved }: {
  data: inferRouterOutputs<AppRouter>["reconciliation"]["difference"];
  accountId: number | null;
  firstDayOfMonth: string;
  lastDayOfMonth: string;
  onClose: () => void;
  onResolve: (movementId: number) => void;
  onBalanceSaved: () => void;
}) {
  return (
    <ModalShell
      title="Composição da diferença"
      subtitle={data.difference === null ? undefined : `${formatMoney(Math.abs(data.difference))} entre o extrato do banco e o GranaFy`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-[14px] bg-[#F8FAF9] px-4 py-3 text-[13px]">
          <span className="flex flex-wrap items-center gap-2 text-[#4C6355]">
            Saldo no extrato · {data.accountName}
            {/* A origem fica à vista: "o banco disse" e "alguém digitou" não
                valem a mesma coisa numa conferência. */}
            {data.statementOrigin && (
              <span className={`rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[.06em] ${
                data.statementOrigin === "arquivo" ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#FFF3E6] text-[#8A4B00]"
              }`}>
                {data.statementOrigin === "arquivo" ? "do extrato" : "informado"}
              </span>
            )}
          </span>
          <span className="font-bold">{data.statement === null ? "—" : formatMoney(data.statement)}</span>
        </div>
        <div className="flex justify-between rounded-[14px] bg-[#F8FAF9] px-4 py-3 text-[13px]">
          <span className="text-[#4C6355]">Saldo conciliado no GranaFy</span>
          <span className="font-bold">{formatMoney(data.system)}</span>
        </div>
        {/* Diferença zero é a coisa certa acontecendo. Pintar de vermelho o mês
            que fechou faz a tela gritar erro justamente quando não há nenhum. */}
        <div className={`flex justify-between rounded-[14px] px-4 py-3 text-[13px] ${data.difference === 0 ? "bg-[#DFF6EA]" : "bg-[#FDECEA]"}`}>
          <span className={data.difference === 0 ? "text-[#0A7A42]" : "text-[#8E1F16]"}>Diferença</span>
          <span className={`font-bold ${data.difference === 0 ? "text-[#0A7A42]" : "text-[#8E1F16]"}`}>
            {data.difference === null ? "—" : formatMoney(Math.abs(data.difference))}
          </span>
        </div>
      </div>

      <StatementBalanceForm
        accountId={accountId}
        monthStart={firstDayOfMonth}
        monthEnd={lastDayOfMonth}
        current={data.statement}
        currentDate={data.statementDate}
        origin={data.statementOrigin}
        onSaved={onBalanceSaved}
      />

      <div className="flex flex-col gap-2">
        <span className="text-[12.5px] font-semibold text-[#4C6355]">
          {data.items.length} {data.items.length === 1 ? "movimentação responsável" : "movimentações responsáveis"}
        </span>
        {data.items.length === 0 ? (
          <p className="rounded-xl bg-[#F1FBF6] px-4 py-4 text-center text-[13px] text-[#0A7A42]">
            Todas as movimentações do mês têm lançamento. A diferença que sobrar vem de fora deste período.
          </p>
        ) : (
          <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
            {data.items.map(movement => (
              <div key={movement.id} className="flex items-center gap-3 rounded-[14px] border border-[#E3EBE6] px-3.5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-semibold">{movement.description}</span>
                  <span className="block text-[12px] text-[#4C6355]">
                    {formatDate(movement.movementDate)} ·{" "}
                    {movement.classification
                      ? CLASSIFICATION_LABELS[movement.classification as Classification]
                      : "no banco, sem lançamento no sistema"}
                  </span>
                </span>
                <span className={`shrink-0 text-[13.5px] font-bold ${movement.amount < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                  {signedMoney(movement.amount)}
                </span>
                <button
                  type="button"
                  onClick={() => onResolve(movement.id)}
                  className="shrink-0 rounded-[10px] bg-[#F1FBF6] px-3 py-1.5 text-[12px] font-semibold text-[#0A7A42] transition hover:bg-[#DFF6EA]"
                >
                  Resolver
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="text-[11.5px] leading-relaxed text-[#4C6355]">
        A diferença só zera quando cada uma dessas movimentações virar lançamento.
        Classificar explica o dinheiro, mas não o coloca no saldo do sistema.
      </p>
    </ModalShell>
  );
}

/** O histórico de uma movimentação. */
function HistoryModal({ item, entries, loading, onClose }: {
  item: Item;
  entries: Array<{ id: number; action: string; previousStatus: string; newStatus: string; detail: string; createdAt: Date | string }>;
  loading: boolean;
  onClose: () => void;
}) {
  const ACTION_LABELS: Record<string, string> = {
    conciliar: "Conciliou",
    desfazer: "Desfez a conciliação",
    classificar: "Classificou",
    criar_lancamento: "Criou o lançamento",
    dividir: "Dividiu entre lançamentos",
    agrupar: "Agrupou movimentações",
  };
  return (
    <ModalShell title="Histórico" subtitle={item.description} onClose={onClose}>
      {loading ? (
        <div className="flex justify-center py-6"><GranafyLoader size="sm" label="Carregando…" /></div>
      ) : entries.length === 0 ? (
        <p className="rounded-xl bg-[#F8FAF9] px-4 py-6 text-center text-[13px] text-[#4C6355]">
          Nada registrado ainda para esta movimentação.
        </p>
      ) : (
        <div className="flex max-h-[360px] flex-col gap-2 overflow-y-auto">
          {entries.map(entry => (
            <div key={entry.id} className="flex flex-col gap-1 rounded-[14px] border border-[#E3EBE6] px-3.5 py-3">
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold">{ACTION_LABELS[entry.action] ?? entry.action}</span>
                <span className="ml-auto shrink-0 text-[11.5px] text-[#4C6355]">
                  {new Date(entry.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
              <span className="text-[12px] text-[#4C6355]">
                {entry.previousStatus} → {entry.newStatus}
              </span>
              {entry.detail && <span className="truncate text-[12px] text-[#4C6355]" title={entry.detail}>{entry.detail}</span>}
            </div>
          ))}
        </div>
      )}
    </ModalShell>
  );
}


/** Escolhe o lançamento que recebe o grupo de movimentações. */
function GroupModal({ items, total, candidates, loading, onClose, onConfirm, pending }: {
  items: Item[];
  total: number;
  candidates: Array<{ id: number; description: string; transactionDate: string; amount: number; category: string }>;
  loading: boolean;
  onClose: () => void;
  onConfirm: (transactionId: number) => void;
  pending: boolean;
}) {
  const [escolhido, setEscolhido] = useState<number | null>(null);
  return (
    <ModalShell
      title={`Agrupar ${items.length} movimentações`}
      subtitle={`somam ${signedMoney(total)}`}
      onClose={onClose}
    >
      <div className="flex flex-col gap-1.5 rounded-[14px] bg-[#F8FAF9] p-3.5">
        {items.map(item => (
          <div key={item.id} className="flex items-baseline gap-3 text-[12.5px]">
            <span className="shrink-0 text-[#4C6355]">{formatDate(item.movementDate)}</span>
            <span className="min-w-0 flex-1 truncate">{item.description}</span>
            <span className={`shrink-0 font-semibold ${item.amount < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
              {signedMoney(item.amount)}
            </span>
          </div>
        ))}
      </div>

      <span className="text-[12.5px] font-semibold text-[#4C6355]">
        Lançamentos com esse total exato
      </span>

      {loading ? (
        <p className="py-6 text-center text-[13px] text-[#4C6355]">Procurando…</p>
      ) : candidates.length === 0 ? (
        <p className="rounded-xl bg-[#FFF3E6] px-4 py-5 text-center text-[13px] leading-relaxed text-[#8A4B00]">
          Nenhum lançamento em aberto soma {formatMoney(Math.abs(total))} nesta conta.
          Agrupar exige que o total das movimentações feche com o valor do lançamento.
        </p>
      ) : (
        <div className="flex max-h-[260px] flex-col gap-2 overflow-y-auto">
          {candidates.map(candidate => (
            <button
              key={candidate.id}
              type="button"
              onClick={() => setEscolhido(candidate.id)}
              className={`flex items-center gap-3 rounded-[14px] p-3.5 text-left transition ${
                escolhido === candidate.id
                  ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                  : "border border-[#E3EBE6] hover:bg-[#F8FAF9]"
              }`}
            >
              <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                escolhido === candidate.id ? "bg-[#12B85C]" : "border-[1.5px] border-[#C9D4CD]"
              }`}>
                {escolhido === candidate.id && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{candidate.description}</span>
                <span className="block truncate text-[12px] text-[#4C6355]">
                  {formatDate(candidate.transactionDate)} · {candidate.category}
                </span>
              </span>
              <span className={`shrink-0 text-[13.5px] font-bold ${candidate.amount < 0 ? "text-[#B3261E]" : "text-[#0A7A42]"}`}>
                {signedMoney(candidate.amount)}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2.5">
        <button type="button" onClick={onClose} className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]">
          Cancelar
        </button>
        <button
          type="button"
          disabled={pending || escolhido === null}
          onClick={() => escolhido !== null && onConfirm(escolhido)}
          className="h-11 flex-1 rounded-xl bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-50"
        >
          {pending ? "Agrupando…" : "Agrupar"}
        </button>
      </div>
    </ModalShell>
  );
}

export default function ConciliacaoPage() {
  // Assina o modo discreto: o valor mascarado sai de um módulo, e sem esta
  // assinatura a página não redesenha quando o olhinho é ligado.
  usePrivacy();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [cursor, setCursor] = useState(() => new Date());
  const [accountId, setAccountId] = useState<number | null>(null);
  const [tab, setTab] = useState<Tab>("pendentes");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [batchModal, setBatchModal] = useState(false);
  const [menuFor, setMenuFor] = useState<number | null>(null);
  const [modal, setModal] = useState<{ kind: "classify" | "create" | "split" | "link" | "history"; item: Item } | null>(null);
  const [differenceOpen, setDifferenceOpen] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");

  const period = { year: cursor.getFullYear(), month: cursor.getMonth() + 1 };
  const query = trpc.reconciliation.overview.useQuery({ ...period, accountId });
  const utils = trpc.useUtils();
  // O saldo informado tem que cair dentro do mês em conferência.
  const firstDayOfMonth = new Date(Date.UTC(period.year, period.month - 1, 1)).toISOString().slice(0, 10);
  const lastDayOfMonth = new Date(Date.UTC(period.year, period.month, 0)).toISOString().slice(0, 10);

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

  const undo = trpc.reconciliation.undo.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Conciliação desfeita."); },
    onError: error => toast.error(error.message),
  });
  const classify = trpc.reconciliation.classify.useMutation({
    onSuccess: async () => { setModal(null); await refresh(); toast.success("Movimentação classificada."); },
    onError: error => toast.error(error.message),
  });
  const createFromMovement = trpc.reconciliation.createFromMovement.useMutation({
    onSuccess: async result => {
      setModal(null);
      await refresh();
      toast.success(result.criados > 1 ? `${result.criados} lançamentos criados.` : "Lançamento criado e conciliado.");
    },
    onError: error => toast.error(error.message),
  });
  const closePeriod = trpc.reconciliation.closePeriod.useMutation({
    onSuccess: async () => { await refresh(); toast.success("Mês fechado."); },
    onError: error => toast.error(error.message),
  });
  const group = trpc.reconciliation.group.useMutation({
    onSuccess: async () => { setGroupOpen(false); await refresh(); toast.success("Movimentações agrupadas."); },
    onError: error => toast.error(error.message),
  });
  const applyAutoRules = trpc.reconciliation.applyAutoRules.useMutation({
    onSuccess: async result => {
      await refresh();
      toast.success(result.aplicadas > 0
        ? `${result.aplicadas} ${result.aplicadas === 1 ? "movimentação conciliada" : "movimentações conciliadas"} por regra`
        : "Nenhuma movimentação foi coberta pelas regras automáticas");
    },
    onError: error => toast.error(error.message),
  });
  const reopenPeriod = trpc.reconciliation.reopenPeriod.useMutation({
    onSuccess: async () => { setReopenOpen(false); setReopenReason(""); await refresh(); toast.success("Mês reaberto."); },
    onError: error => toast.error(error.message),
  });

  // As opções e a composição da diferença só carregam quando o modal precisa.
  const options = trpc.organization.options.useQuery(undefined, {
    enabled: modal?.kind === "create" || modal?.kind === "split",
  });
  const differenceQuery = trpc.reconciliation.difference.useQuery(
    { ...period, accountId },
    { enabled: differenceOpen }
  );
  const groupQuery = trpc.reconciliation.groupCandidates.useQuery(
    { movementIds: Array.from(selected) },
    { enabled: groupOpen && selected.size >= 2 }
  );
  const historyQuery = trpc.reconciliation.history.useQuery(
    { movementId: modal?.item.id ?? 0 },
    { enabled: modal?.kind === "history" }
  );

  /*
   * O estreitamento mora aqui, e não no JSX: `data` é o pacote da conciliação,
   * e o retorno "sem contas" não tem nenhum dos campos dele. Separando na
   * origem, as 51 leituras de `data.` no arquivo continuam válidas sem uma
   * linha de mudança, e é impossível desenhar a tela cheia sem conta.
   */
  const [, setLocation] = useLocation();
  const semContasRapido = useSemContas();
  const semContas = semContasRapido || query.data?.semContas === true;
  const data = query.data && query.data.semContas === false ? query.data : undefined;
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

  /*
   * Sugerida e sem par entram na seleção: a primeira para conciliar em lote, a
   * segunda porque agrupar existe justamente para as que não têm par sozinhas.
   * Conciliada e classificada ficam de fora — já foram decididas.
   */
  const selectableIds = visible
    .filter(item => item.status === "sugerido" || item.status === "sem_par")
    .map(item => item.id);
  const selectedItems = (data?.items ?? []).filter(item => selected.has(item.id));
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  /*
   * Para "vincular a um lançamento" só entram os que a engine já considerou
   * possíveis: mesmo valor, mesma conta, até três dias. Mostrar o razão inteiro
   * seria oferecer o erro de vincular valores diferentes.
   */
  const linkCandidates = useMemo(() => {
    if (!data || modal?.kind !== "link") return [];
    const alvo = Math.round(modal.item.amount * 100);
    const vistos = new Set<number>();
    return data.items
      .map(other => other.suggestion)
      .filter((suggestion): suggestion is NonNullable<typeof suggestion> => suggestion !== null)
      .filter(suggestion => {
        if (vistos.has(suggestion.transactionId)) return false;
        vistos.add(suggestion.transactionId);
        return true;
      })
      .filter(suggestion => Math.round(modal.item.amount * 100) === alvo)
      .map(suggestion => ({
        id: suggestion.transactionId,
        description: suggestion.description,
        transactionDate: modal.item.movementDate,
        amount: modal.item.amount,
        category: suggestion.category,
      }));
  }, [data, modal]);

  const abrirAcao = (action: string, item: Item) => {
    if (action === "confirm" && item.suggestion) {
      confirm.mutate({ movementId: item.id, transactionId: item.suggestion.transactionId, origin: "sugestao" });
      return;
    }
    if (action === "undo") {
      undo.mutate({ movementId: item.id });
      return;
    }
    if (action === "classify" || action === "create" || action === "split" || action === "link" || action === "history") {
      setModal({ kind: action, item });
    }
  };

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

  const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95";

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
        <AppSidebar
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          footer={data ? (
            <SidebarStatCard
              kicker="Conciliado no mês"
              value={`${data.progress}%`}
              hint={`${data.counts.pendentes} ${data.counts.pendentes === 1 ? "item pendente" : "itens pendentes"}`}
            />
          ) : undefined}
        />

        <section className="flex min-w-0 flex-1 flex-col gap-5">
          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={CheckIcon} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">Conciliação bancária</h1>
              <p className="mt-0.5 text-[12.5px] text-[#4C6355]">
                {data ? `fila de revisão · ${data.counts.pendentes} ${data.counts.pendentes === 1 ? "item pendente" : "itens pendentes"}` : monthLabel}
              </p>
            </div>

            {data && data.accounts.length > 0 && (
              <label className="flex h-10 items-center gap-2 rounded-[12px] bg-white px-3.5 text-[13px] font-bold ring-1 ring-[#DFE6E1]">
                <span className="sr-only">Conta bancária</span>
                <select
                  value={data.account.id}
                  onChange={event => { setAccountId(Number(event.target.value)); setSelected(new Set()); }}
                  className="max-w-[180px] bg-transparent text-[13px] font-bold outline-none"
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
              <div className="flex h-10 min-w-[174px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{monthLabel}</div>
              <button type="button" aria-label="Próximo mês" onClick={() => { setCursor(current => new Date(current.getFullYear(), current.getMonth() + 1, 1)); setSelected(new Set()); }} className={toolButton}>
                <ChevronRightIcon size={15} />
              </button>
            </div>

            <Hint label="Exportar CSV"><button type="button" aria-label="Exportar conciliação" onClick={exportCsv} className={toolButton}><DownloadIcon size={17} /></button></Hint>
            {data && (
              data.period.closed ? (
                <button
                  type="button"
                  onClick={() => setReopenOpen(true)}
                  title={data.period.closedAt ? `Fechado em ${formatDate(new Date(data.period.closedAt).toISOString().slice(0, 10))}` : undefined}
                  className="flex h-10 items-center gap-2 rounded-[12px] bg-[#F1F4F2] px-3.5 text-[13px] font-bold sm:px-4 text-[#4C6355] transition hover:bg-[#E3EBE6]"
                >
                  Mês fechado
                </button>
              ) : (
                <button
                  type="button"
                  disabled={closePeriod.isPending || data.balance.difference !== 0}
                  title={data.balance.difference === 0 ? "Fecha o mês com a diferença zerada" : "O mês só fecha com a diferença de saldo zerada"}
                  onClick={() => closePeriod.mutate({ ...period, accountId })}
                  className="flex h-10 items-center gap-2 rounded-[12px] bg-[#12B85C] px-3.5 text-[13px] font-bold sm:px-4 text-white transition hover:bg-[#0F9E4E] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CheckIcon size={15} />
                  {closePeriod.isPending ? "Fechando…" : "Fechar o mês"}
                </button>
              )
            )}
            <ProfileMenu />
          </header>

          {query.error && (
            <div className="rounded-[20px] bg-white p-6 text-[13.5px] text-[#B3261E] ring-1 ring-[#E1E8E3]">
              {query.error.message}
            </div>
          )}
          {semContas && <SemContasBancarias onCadastrar={() => setLocation("/organizacao?nova=conta")} />}
          {/*
            Os três cartões nascem vazios no lugar certo, como em A pagar e
            receber. Antes a tela inteira era um bloco centralizado: a linha de
            cartões não existia durante a espera e aparecia de uma vez, empurrando
            o extrato para baixo no instante em que o dado chegava.
          */}
          {!semContas && query.isPending && !query.error && (
            <>
              <KpiRowSkeleton cards={4} />
              <div className="flex min-h-[320px] items-center justify-center rounded-[20px] bg-white ring-1 ring-[#E1E8E3]">
                <GranafyLoader label="Carregando o extrato…" />
              </div>
            </>
          )}

          {data && !semContas && (
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
                <AuroraSurface className="rounded-[20px] p-0">
                  <button
                    type="button"
                    onClick={() => setDifferenceOpen(true)}
                    className="flex flex-1 flex-col gap-2.5 p-6 text-left transition hover:opacity-90"
                  >
                    <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#8FB39E]">Diferença de saldo</span>
                    <strong className="text-[26px] font-bold tracking-[-.02em] text-[#7EE2A8]">
                      {data.balance.difference === null ? "—" : formatMoney(Math.abs(data.balance.difference))}
                    </strong>
                    <span className="text-[12.5px] text-[#C5DACE]">
                      {data.balance.statement === null
                        ? "o extrato importado não declara saldo"
                        : `banco ${formatMoney(data.balance.statement)} · sistema ${formatMoney(data.balance.system)}`}
                    </span>
                  </button>
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
                      pending={confirmBatch.isPending || group.isPending}
                      onConfirm={() => setBatchModal(true)}
                      onGroup={() => setGroupOpen(true)}
                    />
                  )}

                  <div className={`${ROW_GRID} border-b border-[#E3EBE6] px-1 pb-2 text-[11px] font-semibold uppercase tracking-[.08em] text-[#4C6355]`}>
                    <span>
                      {selectableIds.length > 0 && (
                        <Check
                          checked={allSelected}
                          label="Selecionar todas as pendentes"
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
                            disabled={item.status === "conciliado" || item.status === "classificado"}
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
                          <span className="relative hidden items-center justify-end gap-1 justify-self-end lg:flex">
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
                            <button
                              type="button"
                              aria-label={`Ações de ${item.description}`}
                              onClick={() => setMenuFor(current => (current === item.id ? null : item.id))}
                              className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[9px] text-[#8A968D] transition hover:bg-[#F1F4F2]"
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
                              </svg>
                            </button>
                            {menuFor === item.id && (
                              <RowMenu item={item} onClose={() => setMenuFor(null)} onAction={action => abrirAcao(action, item)} />
                            )}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <aside className="flex w-full shrink-0 flex-col gap-5 xl:w-[340px]">
                  <div className="flex flex-col gap-3 rounded-[20px] bg-white p-6 ring-1 ring-[#E1E8E3]">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[15px] font-bold">Regras de conciliação</span>
                      {data.rules.some(rule => rule.autoReconcile) && (
                        <button
                          type="button"
                          disabled={applyAutoRules.isPending}
                          onClick={() => applyAutoRules.mutate({ ...period, accountId })}
                          className="ml-auto rounded-[10px] bg-[#F1FBF6] px-2.5 py-1.5 text-[12px] font-semibold text-[#0A7A42] transition hover:bg-[#DFF6EA] disabled:opacity-50"
                        >
                          {applyAutoRules.isPending ? "Aplicando…" : "Aplicar automáticas"}
                        </button>
                      )}
                    </div>
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
                          <span className="flex items-center gap-2">
                            <span className="truncate text-[12.5px] font-semibold text-[#0A7A42]">{rule.category}</span>
                            {rule.autoReconcile && (
                              <span className="shrink-0 rounded-[5px] bg-[#DFF6EA] px-[7px] py-[2px] text-[10.5px] font-semibold text-[#0A7A42]">
                                automática
                              </span>
                            )}
                          </span>
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

      {batchModal && selectedItems.some(item => item.suggestion) && (
        <ConfirmBatchModal
          items={selectedItems.filter(item => item.suggestion)}
          pending={confirmBatch.isPending}
          onClose={() => setBatchModal(false)}
          onConfirm={() => confirmBatch.mutate({
            movementIds: selectedItems.filter(item => item.suggestion).map(item => item.id),
          })}
        />
      )}

      {modal?.kind === "classify" && (
        <ClassifyModal
          item={modal.item}
          pending={classify.isPending}
          onClose={() => setModal(null)}
          onConfirm={values => classify.mutate({ movementId: modal.item.id, ...values, relatedMovementId: null })}
        />
      )}

      {(modal?.kind === "create" || modal?.kind === "split") && (
        <CreateModal
          item={modal.item}
          split={modal.kind === "split"}
          categories={options.data?.categories ?? []}
          pending={createFromMovement.isPending}
          onClose={() => setModal(null)}
          onConfirm={parts => createFromMovement.mutate({
            movementId: modal.item.id,
            parts: parts.map(part => ({ ...part, costCenterId: null })),
          })}
        />
      )}

      {modal?.kind === "link" && (
        <LinkModal
          item={modal.item}
          candidates={linkCandidates}
          pending={confirm.isPending}
          onClose={() => setModal(null)}
          onConfirm={transactionId => {
            confirm.mutate({ movementId: modal.item.id, transactionId, origin: "manual" });
            setModal(null);
          }}
        />
      )}

      {modal?.kind === "history" && (
        <HistoryModal
          item={modal.item}
          entries={historyQuery.data ?? []}
          loading={historyQuery.isPending}
          onClose={() => setModal(null)}
        />
      )}

      {differenceOpen && differenceQuery.data && (
        <DifferenceModal
          data={differenceQuery.data}
          accountId={accountId}
          firstDayOfMonth={firstDayOfMonth}
          lastDayOfMonth={lastDayOfMonth}
          /*
           * `refetch` e não só `invalidate`: o modal está montado com o dado
           * antigo e o invalidate sozinho o deixava mostrando "—" até alguém
           * recarregar a página.
           */
          onBalanceSaved={async () => {
            await Promise.all([
              differenceQuery.refetch(),
              utils.reconciliation.overview.invalidate(),
            ]);
          }}
          onClose={() => setDifferenceOpen(false)}
          onResolve={movementId => {
            const item = data?.items.find(candidate => candidate.id === movementId);
            setDifferenceOpen(false);
            if (item) setModal({ kind: "create", item });
          }}
        />
      )}

      {groupOpen && selectedItems.length >= 2 && (
        <GroupModal
          items={selectedItems}
          total={groupQuery.data?.total ?? selectedItems.reduce((sum, item) => sum + item.amount, 0)}
          candidates={groupQuery.data?.candidates ?? []}
          loading={groupQuery.isPending}
          pending={group.isPending}
          onClose={() => setGroupOpen(false)}
          onConfirm={transactionId => group.mutate({ movementIds: selectedItems.map(item => item.id), transactionId })}
        />
      )}

      {reopenOpen && (
        <ModalShell title="Reabrir o mês" subtitle={monthLabel} onClose={() => setReopenOpen(false)}>
          <p className="text-[13px] leading-relaxed text-[#4C6355]">
            Reabrir volta a permitir alterações na conciliação deste mês. O motivo fica registrado
            no histórico junto de quem reabriu.
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-[#4C6355]">Motivo</span>
            <textarea
              value={reopenReason}
              onChange={event => setReopenReason(event.target.value)}
              rows={2}
              placeholder="Ex.: lançamento de tarifa esquecido"
              className="w-full resize-none rounded-xl border border-[#E3EAE5] bg-[#F8FAF9] px-3.5 py-2.5 text-[13.5px] outline-none focus:border-[#12B85C]"
            />
          </label>
          <div className="flex gap-2.5">
            <button type="button" onClick={() => setReopenOpen(false)} className="h-11 flex-1 rounded-xl bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]">
              Cancelar
            </button>
            <button
              type="button"
              disabled={reopenPeriod.isPending || reopenReason.trim().length < 3}
              onClick={() => reopenPeriod.mutate({ ...period, accountId, reason: reopenReason.trim() })}
              className="h-11 flex-1 rounded-xl bg-[#B3261E] text-[13.5px] font-bold text-white transition hover:bg-[#8E1F16] disabled:opacity-50"
            >
              {reopenPeriod.isPending ? "Reabrindo…" : "Reabrir"}
            </button>
          </div>
        </ModalShell>
      )}
    </main>
  );
}
