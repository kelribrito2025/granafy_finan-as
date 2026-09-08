import { AuroraSurface } from "@/components/AuroraSurface";
import { CheckIcon, CloseIcon, DownloadIcon } from "@/components/IconlyIcons";
import { useState } from "react";
import { toast } from "sonner";

/*
 * Plano e cobrança — a tela, ainda sem a cobrança por trás.
 *
 * Os números daqui são fixos, de mockup: não existe assinatura, fatura nem
 * cartão no banco de dados. A integração vem depois, e enquanto ela não vem
 * toda ação que mexeria em dinheiro avisa em vez de fingir que fez —
 * um botão que não faz nada é pior do que um botão que explica.
 *
 * Quando a cobrança existir, o que muda é a origem de `ASSINATURA`,
 * `FATURAS` e `PAGAMENTO`, e as três funções de `avisar` viram mutations.
 */

const NAO_INTEGRADO = "A cobrança ainda não está conectada. Esta tela é a do desenho.";

function avisar() {
  toast.info(NAO_INTEGRADO);
}

type Plano = {
  id: "essencial" | "controle" | "grupo";
  nome: string;
  chamada: string;
  precoMensal: number;
  destaques: string[];
};

const PLANOS: Plano[] = [
  {
    id: "essencial",
    nome: "Essencial",
    chamada: "para quem está saindo da planilha",
    precoMensal: 89,
    destaques: ["1 empresa e 2 contas", "Fluxo de caixa e lançamentos", "A pagar e receber", "2 usuários"],
  },
  {
    id: "controle",
    nome: "Controle",
    chamada: "o plano de quem fecha o mês",
    precoMensal: 189,
    destaques: [
      "Conciliação com sugestões e regras",
      "DRE, balanço e patrimônio",
      "Contas ilimitadas · 5 usuários",
      "Acesso de leitura para o contador",
    ],
  },
  {
    id: "grupo",
    nome: "Grupo",
    chamada: "para holdings e múltiplos CNPJ",
    precoMensal: 389,
    destaques: [
      "Até 5 empresas no mesmo login",
      "Relatórios consolidados do grupo",
      "Usuários ilimitados e API",
      "Onboarding assistido",
    ],
  },
];

/** O anual dá dois meses: doze pelo preço de dez, que são os 17% do seletor. */
const DESCONTO_ANUAL = 10 / 12;

const ASSINATURA = {
  plano: "Controle",
  ciclo: "mensal",
  descricao: "Conciliação com sugestões, DRE, balanço e patrimônio. Contas ilimitadas e até 5 usuários.",
  proximaCobranca: "05/10/2026",
  valor: "R$ 189,00",
  assinanteDesde: "março de 2026",
  cicloAtual: "05/09 a 05/10",
};

const USO = [
  { rotulo: "Empresas", usado: 1, limite: "de 1", proporcao: 1, estourado: true },
  { rotulo: "Usuários", usado: 4, limite: "de 5", proporcao: 0.8, estourado: false },
  { rotulo: "Contas cadastradas", usado: 5, limite: "de ilimitadas", proporcao: 0.35, estourado: false },
  { rotulo: "Lançamentos no mês", usado: 318, limite: "de ilimitados", proporcao: 0.55, estourado: false },
];

const FATURAS = [
  { data: "05/09/2026", descricao: "Controle · mensal", situacao: "Paga", valor: "R$ 189,00" },
  { data: "05/08/2026", descricao: "Controle · mensal", situacao: "Paga", valor: "R$ 189,00" },
  { data: "05/07/2026", descricao: "Controle · mensal", situacao: "Paga", valor: "R$ 189,00" },
  { data: "05/06/2026", descricao: "Essencial · mensal", situacao: "Paga", valor: "R$ 89,00" },
  { data: "05/05/2026", descricao: "Essencial · mensal", situacao: "Paga", valor: "R$ 89,00" },
];

const PAGAMENTO = { bandeira: "VISA", final: "•••• 4471", validade: "vence em 09/2029", notaFiscal: "financeiro@bigteck.com.br" };

/** `true` incluído, `false` ausente, string quando o plano tem um número próprio. */
const COMPARACAO: Array<{ recurso: string; valores: [boolean | string, boolean | string, boolean | string] }> = [
  { recurso: "Empresas (CNPJ)", valores: ["1", "1", "5"] },
  { recurso: "Usuários", valores: ["2", "5", "ilimitados"] },
  { recurso: "Contas e cartões", valores: ["2", "ilimitados", "ilimitados"] },
  { recurso: "Fluxo de caixa e lançamentos", valores: [true, true, true] },
  { recurso: "A pagar e receber", valores: [true, true, true] },
  { recurso: "Importação de OFX e CSV", valores: [true, true, true] },
  { recurso: "Conciliação com sugestões", valores: [false, true, true] },
  { recurso: "Regras automáticas de categoria", valores: [false, true, true] },
  { recurso: "DRE e balanço patrimonial", valores: [false, true, true] },
  { recurso: "Patrimônio e depreciação", valores: [false, true, true] },
  { recurso: "Relatórios consolidados do grupo", valores: [false, false, true] },
  { recurso: "API e integrações", valores: [false, false, true] },
  { recurso: "Acesso do contador", valores: [true, true, true] },
  { recurso: "Onboarding assistido", valores: [false, false, true] },
];

const PLANO_ATUAL: Plano["id"] = "controle";

function precoDe(plano: Plano, anual: boolean) {
  const valor = anual ? plano.precoMensal * DESCONTO_ANUAL : plano.precoMensal;
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: valor % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}

const CARD = "rounded-[20px] bg-white p-5 ring-1 ring-[#E3EBE6]";

function Tique() {
  return (
    <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md bg-[#DFF6EA] text-[#0A7A42]">
      <CheckIcon size={12} />
    </span>
  );
}

/** Confirmação da troca, com a conta proporcional feita antes de cobrar. */
function ConfirmarTroca({ destino, onClose }: { destino: Plano; onClose: () => void }) {
  const atual = PLANOS.find(plano => plano.id === PLANO_ATUAL)!;
  /*
   * Faltando 20 dos 30 dias do ciclo, a diferença cobrada hoje é dois terços
   * dela. A conta some quando o servidor passar a devolver o valor: é ele
   * quem sabe a data real da renovação.
   */
  const diasRestantes = 20;
  const diferenca = ((destino.precoMensal - atual.precoMensal) * diasRestantes) / 30;
  const dinheiro = (valor: number) => `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmar-troca-titulo"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#0B1F14]/[.42] p-4 sm:p-10"
      onMouseDown={event => event.target === event.currentTarget && onClose()}
    >
      <div className="modal-enter w-full max-w-[452px] rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.24)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 id="confirmar-troca-titulo" className="text-[18px] font-bold tracking-[-.01em]">
              Mudar para o plano {destino.nome}?
            </h2>
            <p className="mt-1 text-[12.5px] text-[#8A968D]">
              de {atual.nome} (R$ {atual.precoMensal}/mês) para {destino.nome} (R$ {destino.precoMensal}/mês)
            </p>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={onClose}
            className="ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E3EBE6]"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <div className="mt-5 flex flex-col gap-2 rounded-[14px] bg-[#F8FAF9] p-4">
          <div className="flex justify-between text-[13px]">
            <span className="text-[#4C6355]">Diferença proporcional até {ASSINATURA.proximaCobranca.slice(0, 5)}</span>
            <strong className="font-semibold">{dinheiro(diferenca)}</strong>
          </div>
          <div className="flex justify-between text-[13px]">
            <span className="text-[#4C6355]">Crédito do plano atual</span>
            <strong className="font-semibold">− R$ 0,00</strong>
          </div>
          <div className="mt-1 flex justify-between border-t border-[#E3EBE6] pt-2.5 text-[14px]">
            <strong className="font-bold">Cobrança hoje</strong>
            <strong className="font-bold text-[#0A7A42]">{dinheiro(diferenca)}</strong>
          </div>
          <span className="text-[11.5px] text-[#8A968D]">
            A partir de {ASSINATURA.proximaCobranca.slice(0, 5)} a mensalidade passa a {dinheiro(destino.precoMensal)}.
          </span>
        </div>

        <div className="mt-4 flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[.08em] text-[#B3BFB7]">O que você ganha agora</span>
          {destino.destaques.slice(0, 3).map(item => (
            <span key={item} className="flex items-center gap-2.5 text-[13px]">
              <Tique />
              {item}
            </span>
          ))}
        </div>

        <p className="mt-4 rounded-[14px] bg-[#F1FBF6] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#0A7A42]">
          Nada é perdido na mudança: lançamentos, regras e histórico continuam iguais. Você pode voltar ao{" "}
          {atual.nome} a qualquer momento.
        </p>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-[12px] bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#E3EBE6]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { avisar(); onClose(); }}
            className="h-12 flex-[1.4] rounded-[12px] bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]"
          >
            Confirmar mudança
          </button>
        </div>
      </div>
    </div>
  );
}

function MudarDePlano({ onVoltar }: { onVoltar: () => void }) {
  const [anual, setAnual] = useState(false);
  const [confirmando, setConfirmando] = useState<Plano | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <h2 className="text-[18px] font-bold tracking-[-.01em]">Mudar de plano</h2>
          <p className="mt-0.5 text-[12.5px] text-[#8A968D]">
            Você está no {ASSINATURA.plano} {ASSINATURA.ciclo} · a mudança vale no próximo ciclo
          </p>
        </div>
        <div className="flex items-center rounded-[12px] bg-white p-1 ring-1 ring-[#E3EBE6]">
          {[false, true].map(opcao => (
            <button
              key={String(opcao)}
              type="button"
              aria-pressed={anual === opcao}
              onClick={() => setAnual(opcao)}
              className={`flex items-center gap-1.5 rounded-[9px] px-3.5 py-2 text-[12.5px] transition ${
                anual === opcao ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"
              }`}
            >
              {opcao ? "Anual" : "Mensal"}
              {opcao && (
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${anual ? "bg-white/20 text-white" : "bg-[#DFF6EA] text-[#0A7A42]"}`}>
                  −17%
                </span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onVoltar}
          className="h-[38px] rounded-[12px] px-3.5 text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F1F4F2]"
        >
          Voltar
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANOS.map(plano => {
          const atual = plano.id === PLANO_ATUAL;
          const recomendado = plano.id === "grupo";
          return (
            <div
              key={plano.id}
              className={`flex flex-col gap-3.5 rounded-[20px] bg-white p-5 ${
                recomendado
                  ? "shadow-[0_18px_44px_rgba(11,31,20,.10)] ring-[1.5px] ring-[#12B85C]"
                  : "ring-1 ring-[#E3EBE6]"
              }`}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0">
                  <strong className="block text-[16px] font-bold">{plano.nome}</strong>
                  <span className="mt-0.5 block text-[12px] text-[#8A968D]">{plano.chamada}</span>
                </div>
                {atual && (
                  <span className="ml-auto shrink-0 rounded-md bg-[#F1F4F2] px-2 py-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#4C6355]">
                    Atual
                  </span>
                )}
                {recomendado && (
                  <span className="ml-auto shrink-0 rounded-md bg-[#12B85C] px-2 py-1 text-[10px] font-bold uppercase tracking-[.06em] text-white">
                    Recomendado
                  </span>
                )}
              </div>

              <div className="flex items-baseline gap-1">
                <span className="text-[14px] font-semibold text-[#4C6355]">R$</span>
                <strong className="text-[34px] font-bold leading-none tracking-[-.03em]">{precoDe(plano, anual)}</strong>
                <span className="text-[12.5px] text-[#8A968D]">/mês</span>
              </div>
              {anual && (
                <span className="-mt-2 text-[11.5px] text-[#8A968D]">
                  R$ {(plano.precoMensal * 10).toLocaleString("pt-BR")} por ano, cobrado de uma vez
                </span>
              )}

              {atual ? (
                <span className="flex h-[46px] items-center justify-center rounded-[12px] bg-[#F1F4F2] text-[13px] font-semibold text-[#8A968D]">
                  Seu plano atual
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmando(plano)}
                  className={`flex h-[46px] items-center justify-center rounded-[12px] text-[13px] font-bold transition ${
                    recomendado
                      ? "bg-[#12B85C] text-white hover:bg-[#0F9E4E]"
                      : "text-[#0A7A42] ring-1 ring-[#C7E8D6] hover:bg-[#F1FBF6]"
                  }`}
                >
                  {plano.precoMensal > PLANOS.find(item => item.id === PLANO_ATUAL)!.precoMensal
                    ? "Fazer upgrade"
                    : "Mudar para este plano"}
                </button>
              )}

              <div className="flex flex-col gap-2 border-t border-[#EDF2EE] pt-3.5">
                {plano.destaques.map(item => (
                  <span key={item} className="flex items-center gap-2.5 text-[12.5px]">
                    <Tique />
                    {item}
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className={CARD}>
        <div className="flex flex-wrap items-baseline gap-2">
          <strong className="text-[14px] font-bold">Comparação completa</strong>
          <span className="text-[12px] text-[#8A968D]">
            todos os planos incluem exportação de dados e suporte por e-mail
          </span>
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,110px)] gap-2 border-b border-[#E3EBE6] pb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[#B3BFB7]">
              <span>Recurso</span>
              {PLANOS.map(plano => (
                <span key={plano.id} className="text-center">{plano.nome}</span>
              ))}
            </div>
            {COMPARACAO.map(linha => (
              <div
                key={linha.recurso}
                className="grid grid-cols-[minmax(0,1fr)_repeat(3,110px)] items-center gap-2 border-b border-[#F1F4F2] py-2.5 text-[13px] last:border-b-0"
              >
                <span className="min-w-0 text-[#28382E]">{linha.recurso}</span>
                {linha.valores.map((valor, indice) => (
                  <span key={indice} className="flex justify-center">
                    {valor === true ? (
                      <Tique />
                    ) : valor === false ? (
                      <span className="text-[#C9D4CD]">—</span>
                    ) : (
                      <span className="text-[12.5px] font-semibold text-[#28382E]">{valor}</span>
                    )}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {confirmando && <ConfirmarTroca destino={confirmando} onClose={() => setConfirmando(null)} />}
    </div>
  );
}

export function PlanoCobranca() {
  const [mudando, setMudando] = useState(false);

  if (mudando) return <MudarDePlano onVoltar={() => setMudando(false)} />;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="mr-auto min-w-0">
          <h2 className="text-[18px] font-bold tracking-[-.01em]">Plano e cobrança</h2>
          <p className="mt-0.5 text-[12.5px] text-[#8A968D]">
            {ASSINATURA.plano} {ASSINATURA.ciclo} · próxima cobrança em {ASSINATURA.proximaCobranca}
          </p>
        </div>
        {/*
          Vermelho porque cancelar é destrutivo, mas na tinta clara e não no
          vermelho cheio: sólido, ele competiria com o "Mudar de plano" e o
          botão mais perigoso da tela seria o mais chamativo. É o mesmo
          #FDECEA que o resto do produto usa para o negativo.
        */}
        <button
          type="button"
          onClick={avisar}
          className="h-11 rounded-[12px] bg-[#FDECEA] px-4 text-[13px] font-semibold text-[#8E1F16] ring-1 ring-[#F0C8C4] transition hover:bg-[#F9DDD9]"
        >
          Cancelar assinatura
        </button>
        <button
          type="button"
          onClick={() => setMudando(true)}
          className="flex h-11 items-center gap-2 rounded-[12px] bg-[#12B85C] px-4 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
          Mudar de plano
        </button>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AuroraSurface className="rounded-[20px] p-5">
          <div className="flex h-full flex-col gap-3.5">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#8FB39E]">Plano atual</span>
            <span className="ml-auto rounded-md bg-[#12B85C] px-2 py-1 text-[10px] font-bold uppercase tracking-[.06em]">
              Ativo
            </span>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-[26px] font-bold tracking-[-.02em]">{ASSINATURA.plano}</strong>
            <span className="text-[15px] font-semibold text-[#7EE2A8]">R$ 189/mês</span>
          </div>
          <p className="text-[12.5px] leading-relaxed text-[#C5DACE]">{ASSINATURA.descricao}</p>
          <div className="mt-auto grid gap-3 border-t border-[#1F3D2B] pt-4 sm:grid-cols-3">
            <div>
              <span className="block text-[10.5px] text-[#8FB39E]">Próxima cobrança</span>
              <strong className="mt-0.5 block text-[13px] font-semibold">{ASSINATURA.proximaCobranca}</strong>
            </div>
            <div>
              <span className="block text-[10.5px] text-[#8FB39E]">Valor</span>
              <strong className="mt-0.5 block text-[13px] font-semibold">{ASSINATURA.valor}</strong>
            </div>
            <div>
              <span className="block text-[10.5px] text-[#8FB39E]">Assinante desde</span>
              <strong className="mt-0.5 block text-[13px] font-semibold">{ASSINATURA.assinanteDesde}</strong>
            </div>
          </div>
          </div>
        </AuroraSurface>

        <div className={`${CARD} flex flex-col gap-3.5`}>
          <div className="flex items-center gap-2">
            <strong className="text-[14px] font-bold">Uso no ciclo</strong>
            <span className="ml-auto text-[12px] text-[#8A968D]">{ASSINATURA.cicloAtual}</span>
          </div>
          {USO.map(item => (
            <div key={item.rotulo} className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2 text-[12.5px]">
                <span className="flex-1 min-w-0 truncate text-[#4C6355]">{item.rotulo}</span>
                <strong className={`font-bold ${item.estourado ? "text-[#8A4B00]" : ""}`}>
                  {item.usado.toLocaleString("pt-BR")}
                </strong>
                <span className="text-[11.5px] text-[#8A968D]">{item.limite}</span>
              </div>
              <div className="h-[6px] overflow-hidden rounded-full bg-[#EDF2EE]">
                <div
                  className={`h-full rounded-full ${item.estourado ? "bg-[#E0A44A]" : "bg-[#12B85C]"}`}
                  style={{ width: `${Math.round(item.proporcao * 100)}%` }}
                />
              </div>
            </div>
          ))}
          <p className="mt-auto rounded-[14px] bg-[#FFF3E6] px-3.5 py-3 text-[11.5px] leading-relaxed text-[#8A4B00]">
            Você está no limite de 1 empresa. O plano Grupo permite até 5 CNPJ no mesmo login.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_392px]">
        <div className={CARD}>
          <div className="flex items-center gap-2">
            <strong className="text-[14px] font-bold">Faturas</strong>
            <button
              type="button"
              onClick={avisar}
              className="ml-auto text-[12.5px] font-semibold text-[#0A7A42] transition hover:underline"
            >
              Baixar todas
            </button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <div className="min-w-[460px]">
              <div className="grid grid-cols-[110px_minmax(0,1fr)_110px_100px_36px] items-center gap-2 border-b border-[#E3EBE6] pb-2.5 text-[11px] font-semibold uppercase tracking-[.06em] text-[#B3BFB7]">
                <span>Data</span>
                <span>Descrição</span>
                <span>Situação</span>
                <span className="text-right">Valor</span>
                <span />
              </div>
              {FATURAS.map(fatura => (
                <div
                  key={fatura.data}
                  className="grid grid-cols-[110px_minmax(0,1fr)_110px_100px_36px] items-center gap-2 border-b border-[#F1F4F2] py-2.5 text-[13px] last:border-b-0"
                >
                  <span className="text-[#4C6355]">{fatura.data}</span>
                  <span className="min-w-0 truncate">{fatura.descricao}</span>
                  <span>
                    <span className="rounded-md bg-[#DFF6EA] px-2 py-1 text-[10.5px] font-bold text-[#0A7A42]">
                      {fatura.situacao}
                    </span>
                  </span>
                  <strong className="text-right font-semibold">{fatura.valor}</strong>
                  <button
                    type="button"
                    aria-label={`Baixar a fatura de ${fatura.data}`}
                    onClick={avisar}
                    className="flex h-8 w-8 items-center justify-center rounded-[10px] text-[#4C6355] transition hover:bg-[#F1F4F2]"
                  >
                    <DownloadIcon size={15} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className={`${CARD} flex flex-col gap-3.5`}>
            <strong className="text-[14px] font-bold">Forma de pagamento</strong>
            <div className="flex items-center gap-3 rounded-[14px] bg-[#F8FAF9] p-3.5">
              <span className="flex h-8 w-11 shrink-0 items-center justify-center rounded-md bg-[#0B1F14] text-[10px] font-bold tracking-[.04em] text-white">
                {PAGAMENTO.bandeira}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block text-[13px] font-semibold">{PAGAMENTO.final}</strong>
                <span className="block text-[11.5px] text-[#8A968D]">{PAGAMENTO.validade}</span>
              </div>
              <button
                type="button"
                onClick={avisar}
                className="shrink-0 text-[12.5px] font-semibold text-[#0A7A42] transition hover:underline"
              >
                Trocar
              </button>
            </div>
            <div>
              <span className="block text-[11px] font-semibold uppercase tracking-[.08em] text-[#B3BFB7]">
                E-mail para nota fiscal
              </span>
              <span className="mt-1.5 block rounded-[12px] bg-[#F8FAF9] px-3.5 py-2.5 text-[13px]">
                {PAGAMENTO.notaFiscal}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5 rounded-[20px] bg-[#F1FBF6] p-5 ring-1 ring-[#C7E8D6]">
            <strong className="text-[13.5px] font-bold text-[#0A7A42]">Economize 2 meses no anual</strong>
            <p className="text-[12.5px] leading-relaxed text-[#28382E]">
              Mudando para o ciclo anual, o {ASSINATURA.plano} sai por R$ 157,50/mês — R$ 1.890 por ano.
            </p>
            <button
              type="button"
              onClick={() => setMudando(true)}
              className="mt-1 flex h-11 items-center justify-center rounded-[12px] bg-[#12B85C] text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]"
            >
              Mudar para anual
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
