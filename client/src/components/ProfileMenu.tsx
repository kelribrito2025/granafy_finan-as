import { useAuth } from "@/_core/hooks/useAuth";
import { useSomenteLeitura } from "@/hooks/useSomenteLeitura";
import {
  ArchiveIcon,
  BuildingIcon,
  CardIcon,
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
  SwapIcon,
} from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CaixaDeSelecao } from "@/components/SelectionCheckbox";
import { GranafyRing } from "@/components/GranafyLoader";
import { useAssinaturasLiberadas } from "@/lib/sistema";
import { companyInitials } from "@shared/companies";
import { trpc } from "@/lib/trpc";
import { useCallback, useRef, useState } from "react";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { useLocation } from "wouter";

/** Lucide `plus`: o "adicionar empresa" do modelo. */
function PlusIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className={className}>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

/** Lucide `user`: uma pessoa, como o modelo do avatar pede. */
function PersonIcon({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true" className={className}>
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

/** Chevron fino do modelo do avatar — o ChevronRightIcon do conjunto é uma seta. */
function ChevronDownIcon({ size = 15, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className={className}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/**
 * O seletor de empresas.
 *
 * A lista vem de `companies.list`, a tabela de empresas de verdade — não mais
 * de um perfil único. Hoje ela tem uma linha e a tela diz isso, porque trocar
 * ainda não existe; o que mudou é o caminho do dado, que é o que as próximas
 * fases vão usar.
 */
type Empresa = {
  id: number;
  displayName: string;
  /** Só o dono renomeia e arquiva; o contador vê a linha sem o menu. */
  podeGerir: boolean;
  legalName: string;
  tradeName: string;
  taxId: string;
  isActive: boolean;
  isCurrent: boolean;
  saldo: number;
  criadaEm: Date;
  papel: string;
};

/** Os três pontinhos. `currentColor` para herdar o tom da linha em que está. */
function MaisIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

/**
 * As ações da empresa, escondidas atrás dos três pontinhos.
 *
 * Estavam na cara da linha — "Editar" e "Arquivar" embaixo de cada empresa — e
 * isso punha duas ações de gestão no caminho de quem só queria TROCAR. O modal
 * é de troca; gestão é o desvio, não o destino.
 *
 * Fecha ao escolher, ao apertar Esc e ao clicar fora — pelo mesmo
 * `useDismissOnOutside` que o menu do perfil usa, e não por um efeito próprio:
 * dois popovers com regras diferentes de fechamento na mesma tela é como se
 * ganha o bug de dois menus abertos ao mesmo tempo.
 */
function MenuDaEmpresa({ rotulos, desabilitado, onEscolher }: {
  rotulos: Array<{ chave: string; texto: string; tom?: "normal" | "perigo" }>;
  desabilitado: boolean;
  onEscolher: (chave: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement | null>(null);
  useDismissOnOutside(aberto, caixa, useCallback(() => setAberto(false), []));

  return (
    <div ref={caixa} className="relative shrink-0">
      <button
        type="button"
        aria-label="Ações da empresa"
        aria-expanded={aberto}
        aria-haspopup="menu"
        disabled={desabilitado}
        onClick={() => setAberto(atual => !atual)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8A968D] hover:bg-[#EDF2EE] disabled:opacity-40"
      >
        <MaisIcon />
      </button>
      {aberto && (
        <div
          role="menu"
          className="absolute right-0 top-9 z-10 w-[168px] overflow-hidden rounded-[12px] border border-[#E3EAE5] bg-white py-1 shadow-[0_12px_32px_rgba(11,31,20,.16)]"
        >
          {rotulos.map(item => (
            <button
              key={item.chave}
              type="button"
              role="menuitem"
              onClick={() => { setAberto(false); onEscolher(item.chave); }}
              className={`block w-full px-3.5 py-2 text-left text-[13px] font-medium hover:bg-[#F1F4F2] ${
                item.tom === "perigo" ? "text-[#A5231A]" : "text-[#28382E]"
              }`}
            >
              {item.texto}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** "R$ 42.907,10" — o mesmo formato do resto do produto. */
function dinheiro(valor: number) {
  return `R$ ${valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "criada em 10/09" — dia e mês bastam numa linha de apoio. */
function criadaEmLegivel(data: Date) {
  const d = new Date(data);
  return `criada em ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Arquivar, com escolha em vez de clique único.
 *
 * O `⋮ › Arquivar` arquivava direto. Numa lista de uma empresa isso era óbvio;
 * com três, "arquivar" no menu da linha errada tira do ar a empresa errada, e
 * quem descobre é a tela seguinte, vazia.
 *
 * Então o menu abre ESTA lista, com a empresa clicada já marcada — quem clicou
 * na linha da Padaria quis a Padaria, e obrigar a marcar de novo seria teatro.
 * O que a lista acrescenta é poder conferir antes, ver as outras e marcar mais
 * de uma numa passada.
 *
 * A empresa ATUAL não pode ser marcada. Não é regra nova: o servidor recusa
 * arquivar a última ativa, e a atual é sempre uma ativa. Desabilitar aqui é
 * para a recusa não chegar depois do clique.
 */
function PainelDeArquivar({ empresas, selecionadas, salvando, onAlternar, onCancelar, onConfirmar }: {
  empresas: Empresa[];
  selecionadas: Set<number>;
  salvando: boolean;
  onAlternar: (id: number) => void;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const quantas = selecionadas.size;
  return (
    <div className="mt-5 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {empresas.map(empresa => {
          const bloqueada = empresa.isCurrent;
          const marcada = selecionadas.has(empresa.id);
          return (
            <button
              key={empresa.id}
              type="button"
              disabled={bloqueada || salvando}
              aria-pressed={marcada}
              onClick={() => onAlternar(empresa.id)}
              className={`flex items-center gap-3 rounded-[14px] border p-3 text-left transition ${
                marcada ? "border-[#12B85C] bg-[#F1FBF6]" : "border-[#E3EAE5]"
              } ${bloqueada ? "opacity-55" : "hover:bg-[#F8FAF9]"}`}
            >
              <CaixaDeSelecao marcada={marcada} tamanho={20} />
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#DFF6EA] text-[12px] font-bold text-[#0A7A42]">
                {companyInitials(empresa.displayName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold">{empresa.displayName}</span>
                <span className="block truncate text-[11.5px] text-[#8A968D]">
                  {bloqueada
                    ? "Empresa atual · troque antes de arquivar"
                    : `${empresa.taxId || "CNPJ não informado"} · ${criadaEmLegivel(empresa.criadaEm)}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-[14px] bg-[#F8FAF9] p-3.5">
        <strong className="block text-[12.5px] font-bold">Ao arquivar</strong>
        <p className="mt-1 text-[11.5px] leading-relaxed text-[#4C6355]">
          Lançamentos, contas e relatórios ficam guardados. As empresas saem da lista de troca
          e você pode reativar quando quiser — nada é apagado.
        </p>
      </div>

      <div className="flex gap-2.5">
        <button
          type="button"
          disabled={salvando}
          onClick={onCancelar}
          className="h-12 flex-1 rounded-[12px] bg-[#F1F4F2] text-[13.5px] font-semibold text-[#4C6355] hover:bg-[#E3EBE6] disabled:opacity-50"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={quantas === 0 || salvando}
          onClick={onConfirmar}
          className="flex h-12 flex-[1.4] items-center justify-center gap-2 rounded-[12px] bg-[#12B85C] text-[13.5px] font-bold text-white hover:bg-[#0F9E4E] disabled:bg-[#C9D4CD] disabled:text-[#F8FAF9]"
        >
          <ArchiveIcon size={15} />
          {quantas === 0
            ? "Selecione ao menos uma"
            : salvando
              ? "Arquivando…"
              : `Arquivar ${quantas} ${quantas === 1 ? "empresa" : "empresas"}`}
        </button>
      </div>
    </div>
  );
}

/** O formulário de criar e o de renomear são o mesmo — muda o que ele já traz. */
function FormularioDeEmpresa({ inicial, salvando, erro, onCancelar, onSalvar }: {
  inicial: Pick<Empresa, "legalName" | "tradeName" | "taxId"> | null;
  salvando: boolean;
  erro: string | null;
  onCancelar: () => void;
  onSalvar: (valores: { legalName: string; tradeName: string; taxId: string }) => void;
}) {
  const [legalName, setLegalName] = useState(inicial?.legalName ?? "");
  const [tradeName, setTradeName] = useState(inicial?.tradeName ?? "");
  const [taxId, setTaxId] = useState(inicial?.taxId ?? "");
  const vazio = !legalName.trim() && !tradeName.trim();

  const campo = "h-11 w-full rounded-xl border border-[#E3EAE5] bg-white px-3.5 text-[14px] outline-none focus:border-[#12B85C]";
  const rotulo = "mb-1 block text-[12px] font-semibold text-[#4C6355]";

  return (
    <form
      className="mt-5 flex flex-col gap-3"
      onSubmit={event => { event.preventDefault(); if (!vazio) onSalvar({ legalName: legalName.trim(), tradeName: tradeName.trim(), taxId: taxId.trim() }); }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={rotulo} htmlFor="empresa-razao">Razão social</label>
          <input id="empresa-razao" className={campo} value={legalName} onChange={e => setLegalName(e.target.value)} maxLength={180} autoFocus />
        </div>
        <div>
          <label className={rotulo} htmlFor="empresa-fantasia">Nome fantasia</label>
          <input id="empresa-fantasia" className={campo} value={tradeName} onChange={e => setTradeName(e.target.value)} maxLength={180} />
        </div>
      </div>
      <div>
        <label className={rotulo} htmlFor="empresa-cnpj">CNPJ <span className="font-normal text-[#8A968D]">(opcional)</span></label>
        <input id="empresa-cnpj" className={campo} value={taxId} onChange={e => setTaxId(e.target.value)} maxLength={20} />
      </div>

      {/* Um dos dois nomes basta: quem ainda não tem razão social usa o fantasia,
          e a lista sabe resolver o rótulo a partir do que existir. */}
      {vazio && <p className="text-[12px] text-[#8A968D]">Informe a razão social ou o nome fantasia.</p>}
      {erro && <p className="rounded-xl bg-[#FBEBE9] px-3.5 py-2.5 text-[12.5px] text-[#A5231A]">{erro}</p>}

      <div className="mt-1 flex gap-2.5">
        <button type="button" onClick={onCancelar} className="h-12 flex-1 rounded-xl border border-[#E3EAE5] text-[14px] font-semibold text-[#28382E] hover:bg-[#F8FAF9]">Cancelar</button>
        <button type="submit" disabled={vazio || salvando} className="h-12 flex-[1.4] rounded-xl bg-[#12B85C] text-[14px] font-bold text-white hover:bg-[#0F9E4E] disabled:opacity-50">
          {salvando ? "Salvando…" : inicial ? "Salvar" : "Criar empresa"}
        </button>
      </div>
    </form>
  );
}

/**
 * A lista de empresas do login.
 *
 * Trocar, criar, editar e arquivar. A troca grava um cookie no servidor e o
 * cliente LIMPA O CACHE e recarrega — não é preguiça de invalidar consulta por
 * consulta: cada tela guarda o seu recorte, e uma que ficasse para trás
 * mostraria o número de uma empresa embaixo do nome de outra. Foi o que já
 * aconteceu entre contas no `f8a808f`, e a lição de lá vale igual aqui.
 *
 * Criar leva ao mesmo lugar: a empresa nova já nasce aberta pelo servidor, e
 * recarregar cai nas boas-vindas dela — que é onde a primeira conta e o
 * primeiro extrato precisam ser cadastrados.
 */
function CompanySwitcher({ empresas, carregando, onClose, onMudou }: {
  empresas: Empresa[];
  carregando: boolean;
  onClose: () => void;
  onMudou: () => void;
}) {
  const somenteLeitura = useSomenteLeitura();
  const [form, setForm] = useState<
    { modo: "criar" } | { modo: "renomear"; empresa: Empresa } | { modo: "arquivar" } | null
  >(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<number | null>(null);
  const [paraArquivar, setParaArquivar] = useState<Set<number>>(new Set());
  /* As arquivadas começam escondidas: quem abre o modal quer trocar, não revisar o arquivo. */
  const [verArquivadas, setVerArquivadas] = useState(false);

  const aoFalhar = (e: { message: string }) => { setTrocando(null); setErro(e.message); };
  /* Recarrega da raiz: o cache inteiro sai de cena junto com a página. */
  const recomecar = () => { window.location.assign("/"); };

  const criar = trpc.companies.create.useMutation({ onSuccess: recomecar, onError: aoFalhar });
  const abrir = trpc.companies.open.useMutation({ onSuccess: recomecar, onError: aoFalhar });
  const renomear = trpc.companies.rename.useMutation({ onSuccess: () => { setErro(null); setForm(null); onMudou(); }, onError: aoFalhar });
  const arquivar = trpc.companies.setArchived.useMutation({ onSuccess: () => { setErro(null); onMudou(); }, onError: aoFalhar });

  /*
   * A lista principal mostra só as ATIVAS. Arquivada não é opção de troca, e
   * misturada na lista ela competia por atenção com as que servem.
   */
  const listaAtiva = empresas.filter(e => e.isActive);
  const arquivadas = empresas.filter(e => !e.isActive);
  const ativas = listaAtiva.length;
  const ocupado = criar.isPending || abrir.isPending || arquivar.isPending;

  /* Arquivar várias é uma chamada por empresa: o servidor recusa uma por uma e é ele quem sabe. */
  const arquivarSelecionadas = async () => {
    setErro(null);
    for (const companyId of paraArquivar) {
      await arquivar.mutateAsync({ companyId, archived: true }).catch(() => undefined);
    }
    setForm(null);
    setParaArquivar(new Set());
  };

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="company-switcher-title" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#0B1F14]/42 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={event => event.target === event.currentTarget && !ocupado && onClose()}>
      <div className="modal-enter w-full max-w-[452px] rounded-[20px] bg-white p-6 text-[#0B1F14]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={SwapIcon} />
          <div className="min-w-0 flex-1">
            <h2 id="company-switcher-title" className="text-[18px] font-bold tracking-[-.01em]">
              {form?.modo === "criar"
                ? "Nova empresa"
                : form?.modo === "renomear"
                  ? "Editar empresa"
                  : form?.modo === "arquivar"
                    ? "Arquivar empresas"
                    : "Trocar de empresa"}
            </h2>
            {/*
              O anel no lugar da palavra "carregando", que era o último texto de
              espera do modal — e ficava no subtítulo, onde depois entra a
              contagem de empresas: o mesmo lugar, dizendo a mesma coisa com o
              desenho que o resto do produto usa para esperar.
            */}
            <p className="mt-1 flex min-h-[18px] items-center gap-2 text-[12.5px] text-[#8A968D]">
              {carregando && !form && <GranafyRing size={13} />}
              {form?.modo === "criar"
                ? "Ela nasce vazia, e você cai nas boas-vindas dela"
                : form?.modo === "arquivar"
                  ? "saem da lista, mas nada é apagado · dá para reativar depois"
                  /* Esperando, quem fala é o anel logo acima. */
                  : carregando
                    ? null
                    /*
                     * A contagem, em duas formas. "Saldo em caixa hoje" saiu
                     * daqui: era o rótulo do mockup e anunciava o número de
                     * apoio da lista em vez do que a lista é, embaixo de um
                     * título que já diz "Trocar de empresa".
                     *
                     * Havendo arquivada, a contagem se divide — e mostra a
                     * QUANTIDADE sem o nome: o cabeçalho responde "existe algo
                     * guardado?" sem gastar a lista com empresa que ninguém vai
                     * abrir agora.
                     */
                    : arquivadas.length > 0
                      ? `${ativas} ${ativas === 1 ? "ativa" : "ativas"} · ${arquivadas.length} ${arquivadas.length === 1 ? "arquivada" : "arquivadas"}`
                      : `${ativas} ${ativas === 1 ? "empresa cadastrada" : "empresas cadastradas"}`}
            </p>
          </div>
          <button type="button" aria-label="Fechar" disabled={ocupado} onClick={onClose} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9] disabled:opacity-50"><CloseIcon size={16} /></button>
        </div>

        {form?.modo === "arquivar" ? (
          <PainelDeArquivar
            empresas={listaAtiva}
            selecionadas={paraArquivar}
            salvando={arquivar.isPending}
            onAlternar={id => setParaArquivar(atual => {
              const proxima = new Set(atual);
              if (proxima.has(id)) proxima.delete(id); else proxima.add(id);
              return proxima;
            })}
            onCancelar={() => { setErro(null); setForm(null); setParaArquivar(new Set()); }}
            onConfirmar={arquivarSelecionadas}
          />
        ) : form ? (
          <FormularioDeEmpresa
            inicial={form.modo === "renomear" ? form.empresa : null}
            salvando={criar.isPending || renomear.isPending}
            erro={erro}
            onCancelar={() => { setErro(null); setForm(null); }}
            onSalvar={valores => {
              if (form.modo === "criar") criar.mutate(valores);
              else renomear.mutate({ companyId: form.empresa.id, ...valores });
            }}
          />
        ) : (
          <>
            <div className="mt-5 flex flex-col gap-2.5">
              {/*
                Enquanto a lista não chega, uma linha vazia no lugar dela.
                
                Sem isto o modal abria com o título, o subtítulo e o "Adicionar
                empresa" — nada mais. Quem abriu para TROCAR via um modal que
                parecia só saber criar, e a lista empurrava o botão para baixo ao
                aparecer.
              */}
              {carregando && (
                <div className="flex items-center gap-3 rounded-[14px] border border-[#E3EAE5] p-3.5" aria-hidden="true">
                  <span className="h-[38px] w-[38px] shrink-0 rounded-[11px] bg-[#F1F4F2]" />
                  <span className="flex min-w-0 flex-1 flex-col gap-2">
                    <span className="block h-2.5 w-32 rounded-full bg-[#EDF2EE]" />
                    <span className="block h-2 w-24 rounded-full bg-[#F1F4F2]" />
                  </span>
                  <GranafyRing size={16} />
                </div>
              )}
              {listaAtiva.length === 0 && arquivadas.length === 0 && !carregando && (
                <p className="rounded-[14px] bg-[#F8FAF9] px-3.5 py-4 text-center text-[12.5px] text-[#8A968D]">
                  Nenhuma empresa cadastrada ainda.
                </p>
              )}
              {listaAtiva.map(empresa => {
                const abrindo = trocando === empresa.id && abrir.isPending;
                return (
                  <div
                    key={empresa.id}
                    /* Só ativas chegam aqui: as arquivadas têm seção própria embaixo. */
                    /*
                      O CARD inteiro abre a empresa — o padding, a linha do saldo,
                      o espaço entre o nome e o check. Antes só o miolo (avatar e
                      nome) era o botão, e clicar no saldo, que é a parte mais
                      olhada, não fazia nada. Como o ⋮ mora dentro do card e
                      botão não aninha botão, o card é `role="button"` e o menu
                      segura o clique para não subir.
                    */
                    role={empresa.isCurrent ? undefined : "button"}
                    tabIndex={empresa.isCurrent ? undefined : 0}
                    aria-disabled={ocupado || undefined}
                    onClick={() => { if (empresa.isCurrent || ocupado) return; setErro(null); setTrocando(empresa.id); abrir.mutate({ companyId: empresa.id }); }}
                    onKeyDown={event => {
                      if (empresa.isCurrent || ocupado) return;
                      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setErro(null); setTrocando(empresa.id); abrir.mutate({ companyId: empresa.id }); }
                    }}
                    className={`rounded-[14px] p-3.5 transition ${
                      empresa.isCurrent
                        ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]"
                        : "cursor-pointer border border-[#E3EAE5] hover:border-[#B9C7BE] hover:bg-[#F8FAF9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C]/40"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${
                          empresa.isCurrent ? "bg-[#12B85C] text-white" : "bg-[#DFF6EA] text-[#0A7A42]"
                        }`}>
                          {companyInitials(empresa.displayName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[14px] ${empresa.isCurrent ? "font-bold text-[#0A7A42]" : "font-semibold"}`}>
                            {empresa.displayName}
                          </span>
                          {/*
                            O anel da marca, o mesmo que o cartão de "A receber"
                            usa no lugar do número: a espera aparece ONDE o dado
                            vai aparecer, e a linha não muda de altura por causa
                            de um texto entrando e saindo.
                          */}
                          <span className="flex items-center gap-2 text-[12px] text-[#8A968D]">
                            {abrindo && <GranafyRing size={13} />}
                            <span className="min-w-0 truncate">
                              {abrindo ? "abrindo" : `${empresa.papel} · ${criadaEmLegivel(empresa.criadaEm)}`}
                            </span>
                          </span>
                        </span>
                      </span>

                      {/*
                        O check e o menu ficam juntos, à direita: um diz onde você
                        está, o outro é a porta da gestão. O menu segura o clique
                        (mousedown e click), senão abrir o ⋮ trocaria de empresa.
                      */}
                      {/*
                        A mesma caixa de seleção do aceite dos termos no login, e
                        não um desenho próprio: seleção é seleção em todo o
                        produto. A seta que ficava aqui dizia "vai para lá", que é
                        verdade mas não responde a pergunta da tela.
                      */}
                      <CaixaDeSelecao marcada={empresa.isCurrent} tamanho={20} />
                      {empresa.podeGerir && (
                      <span onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
                      <MenuDaEmpresa
                        desabilitado={ocupado}
                        rotulos={[
                          { chave: "editar", texto: "Editar" },
                          /*
                            A última ativa não entra no menu: sem nenhuma ativa, o
                            login não abriria tela nenhuma. O servidor recusa de
                            todo jeito; esconder aqui é para a recusa não ser
                            surpresa depois do clique.
                          */
                          ...(ativas > 1 ? [{ chave: "arquivar", texto: "Arquivar" }] : []),
                        ]}
                        onEscolher={chave => {
                          setErro(null);
                          if (chave === "editar") setForm({ modo: "renomear", empresa });
                          if (chave === "arquivar") {
                            /* Já marcada: quem clicou nesta linha quis esta empresa. */
                            setParaArquivar(new Set([empresa.id]));
                            setForm({ modo: "arquivar" });
                          }
                        }}
                      />
                      </span>
                      )}
                    </div>

                    {/*
                      O saldo embaixo, separado por uma linha: é o número que
                      decide a escolha, e é o MESMO "Caixa disponível" do painel —
                      o servidor calcula com o critério de lá.
                    */}
                    <div className={`mt-2.5 flex items-baseline gap-2 border-t pt-2.5 ${empresa.isCurrent ? "border-[#DFF6EA]" : "border-[#F1F4F2]"}`}>
                      <span className="text-[11.5px] text-[#8A968D]">Saldo</span>
                      <strong className={`text-[17px] font-bold tabular-nums ${empresa.isCurrent ? "text-[#0A7A42]" : ""}`}>
                        {dinheiro(empresa.saldo)}
                      </strong>
                    </div>
                  </div>
                );
              })}

              {/* Criar empresa fica fora da v1 do contador: quem está como contador não vê o botão. */}
              {!somenteLeitura && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => { setErro(null); setForm({ modo: "criar" }); }}
                className="flex h-[46px] items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-[#B9C7BE] text-[13.5px] font-semibold text-[#4C6355] hover:bg-[#F8FAF9] disabled:opacity-50"
              >
                <PlusIcon size={16} />
                Adicionar empresa
              </button>
              )}

              {/*
                As arquivadas, atrás de um clique.
                
                Fechada, a seção mostra só a CONTAGEM — é a resposta que o
                cabeçalho já dá e que basta na maioria das vezes. O nome aparece
                quando alguém abre, porque reativar exige saber qual é: contagem
                não dá para clicar em "Reativar".
              */}
              {arquivadas.length > 0 && (
                <div className="mt-1 flex flex-col gap-2">
                  <button
                    type="button"
                    aria-expanded={verArquivadas}
                    onClick={() => setVerArquivadas(atual => !atual)}
                    className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D] hover:text-[#4C6355]"
                  >
                    <ChevronDownIcon size={14} className={verArquivadas ? "" : "-rotate-90"} />
                    Arquivadas · {arquivadas.length}
                    <span className="ml-auto text-[11.5px] font-semibold normal-case tracking-normal text-[#0A7A42]">
                      {verArquivadas ? "Ocultar" : "Mostrar"}
                    </span>
                  </button>

                  {verArquivadas && arquivadas.map(empresa => (
                    <div key={empresa.id} className="flex items-center gap-3 rounded-[14px] bg-[#F8FAF9] p-3">
                      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-[#EDF2EE] text-[#4C6355]">
                        <ArchiveIcon size={16} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-[#4C6355]">{empresa.displayName}</span>
                        <span className="block truncate text-[11.5px] text-[#8A968D]">dados guardados</span>
                      </span>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => { setErro(null); arquivar.mutate({ companyId: empresa.id, archived: false }); }}
                        className="shrink-0 rounded-[10px] bg-white px-3 py-2 text-[12px] font-bold text-[#0A7A42] ring-1 ring-[#C7E8D6] hover:bg-[#F1FBF6] disabled:opacity-50"
                      >
                        Reativar
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {erro && <p className="mt-3 rounded-[14px] bg-[#FBEBE9] px-3.5 py-2.5 text-[12.5px] text-[#A5231A]">{erro}</p>}
          </>
        )}
      </div>
    </div>
  );
}

/** O avatar da topbar e o menu que ele abre. */
export function ProfileMenu() {
  const { user, logout, somenteLeitura } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  // O nome da empresa só aparece depois que o menu abre. Buscá-lo junto com a
  // página punha mais uma consulta no lote que o conteúdo espera.
  const companyQuery = trpc.settings.company.useQuery(undefined, { enabled: open || switcher, staleTime: 60_000 });
  /* A lista só é buscada quando o seletor abre — o menu do perfil não precisa dela. */
  const companiesQuery = trpc.companies.list.useQuery(undefined, { enabled: switcher, staleTime: 60_000 });
  /* Sem o interruptor ligado, "Assinatura" nem entra no menu — ver `@/lib/sistema`. */
  const assinaturasLiberadas = useAssinaturasLiberadas();

  const company = companyQuery.data;
  /*
   * "Empresa sem nome" é a resposta para uma empresa que EXISTE e não tem nome
   * preenchido — e era o que aparecia enquanto a consulta estava no ar, porque
   * `company` indefinido cai no mesmo fallback. Quem abria o menu lia que a
   * empresa dele não tinha nome, e um instante depois o nome aparecia.
   *
   * A consulta só sai quando o menu abre (`enabled`), então essa espera é
   * visível todas as primeiras vezes, não uma corrida rara.
   */
  const carregandoEmpresa = companyQuery.isPending;
  const companyName = carregandoEmpresa
    ? "Carregando…"
    : company?.tradeName || company?.legalName || "Empresa sem nome";

  useDismissOnOutside(open, anchor, useCallback(() => setOpen(false), []));

  return (
    <>
      <div ref={anchor} className="relative">
        <button
          type="button"
          aria-label="Abrir menu do perfil"
          aria-expanded={open}
          onClick={() => setOpen(value => !value)}
          title={user?.name || user?.email || "Sua conta"}
          className={`flex h-11 shrink-0 items-center gap-[9px] rounded-[14px] py-0 pl-1.5 pr-1.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#12B85C] ${
            open ? "bg-[#F1FBF6]" : "bg-white hover:bg-[#F8FAF9]"
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]">
            <PersonIcon size={20} />
          </span>
          <ChevronDownIcon size={15} className="mr-1.5 text-[#8A968D]" />
        </button>

        {open && (
          <div className="popover-enter absolute right-0 top-[52px] z-40 w-[280px] rounded-[18px] bg-white p-2 shadow-[0_18px_44px_rgba(11,31,20,.16)] ring-1 ring-[#E1E8E3]">
            <div className="flex items-center gap-3 p-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#DFF6EA] text-[#0A7A42]">
                <PersonIcon size={20} />
              </span>
              <div className="min-w-0">
                <strong className="block truncate text-[15px]">{user?.name || "Sua conta"}</strong>
                <span className="block truncate text-[12.5px] text-[#8A968D]">{user?.email}</span>
              </div>
            </div>

            <div className="my-1.5 h-px bg-[#F1F4F2]" />

            <button
              type="button"
              onClick={() => { setOpen(false); setSwitcher(true); }}
              className="flex w-full items-center gap-3 rounded-[12px] bg-[#F1FBF6] p-2.5 text-left hover:bg-[#DFF6EA]"
            >
              {/*
                Um ícone de empresa, não a sigla: o nome já está ao lado, e a
                sigla repetia a informação com menos clareza. Enquanto carrega,
                o anel — ícone fixo daria a impressão de que já resolveu.
              */}
              <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] ${
                carregandoEmpresa ? "bg-[#EDF2EE]" : "bg-[#12B85C] text-white"
              }`}>
                {carregandoEmpresa ? <GranafyRing size={16} /> : <BuildingIcon size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`block truncate text-[14px] font-semibold ${carregandoEmpresa ? "text-[#8A968D]" : "text-[#0A7A42]"}`}>{companyName}</span>
                <span className="block text-[12px] text-[#4C6355]">{somenteLeitura ? "empresa atual · somente leitura" : "empresa atual"}</span>
              </span>
              {/* Troca, não avanço: a seta única dizia "próxima tela". */}
              <SwapIcon size={17} className="shrink-0 text-[#0A7A42]" />
            </button>

            {/* Configurações e Assinatura são da empresa, e a empresa não é do contador. */}
            {!somenteLeitura && (
              <button
                type="button"
                onClick={() => { setOpen(false); setLocation("/configuracoes"); }}
                className="mt-1.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] text-[#28382E] hover:bg-[#F1FBF6]"
              >
                <SettingsIcon size={16} className="text-[#4C6355]" />
                <span className="flex-1">Configurações</span>
                <ChevronRightIcon size={15} className="text-[#8A968D]" />
              </button>
            )}

            {assinaturasLiberadas && !somenteLeitura && (
              <button
                type="button"
                onClick={() => { setOpen(false); setLocation("/configuracoes?aba=assinatura"); }}
                className="mt-0.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] text-[#28382E] hover:bg-[#F1FBF6]"
              >
                <CardIcon size={16} className="text-[#4C6355]" />
                <span className="flex-1">Assinatura</span>
                <ChevronRightIcon size={15} className="text-[#8A968D]" />
              </button>
            )}

            {user?.role === "admin" && (
              <button
                type="button"
                onClick={() => { setOpen(false); setLocation("/admin"); }}
                className="mt-0.5 flex w-full items-center gap-3 rounded-[12px] bg-[#0B1F14] px-3 py-2.5 text-left text-[14px] text-white hover:bg-[#153021]"
              >
                <SettingsIcon size={16} className="text-[#7EE2A8]" />
                <span className="flex-1">Admin do sistema</span>
                <ChevronRightIcon size={15} className="text-[#7EE2A8]" />
              </button>
            )}

            <div className="my-1.5 h-px bg-[#F1F4F2]" />

            <div className="flex items-center gap-3 px-3 py-1.5">
              <span className="text-[12.5px] font-semibold text-[#4C6355]">Aparência</span>
              <ThemeToggle showLabel={false} className="ml-auto rounded-[10px] bg-[#F1F4F2] p-1" />
            </div>

            <button
              type="button"
              onClick={async () => { setOpen(false); await logout(); setLocation("/login", { replace: true }); }}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] font-semibold text-[#B3261E] hover:bg-[#FDECEA]"
            >
              <ChevronRightIcon size={16} />
              Sair da conta
            </button>
          </div>
        )}
      </div>

      {switcher && (
        <CompanySwitcher
          empresas={companiesQuery.data ?? []}
          carregando={companiesQuery.isPending}
          onClose={() => setSwitcher(false)}
          onMudou={() => { void companiesQuery.refetch(); void companyQuery.refetch(); }}
        />
      )}
    </>
  );
}
