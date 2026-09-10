import { useAuth } from "@/_core/hooks/useAuth";
import {
  CardIcon,
  ChevronRightIcon,
  CloseIcon,
  SettingsIcon,
  SwapIcon,
} from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { ThemeToggle } from "@/components/ThemeToggle";
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
  legalName: string;
  tradeName: string;
  taxId: string;
  isActive: boolean;
  isCurrent: boolean;
};

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
  const [form, setForm] = useState<{ modo: "criar" } | { modo: "renomear"; empresa: Empresa } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [trocando, setTrocando] = useState<number | null>(null);

  const aoFalhar = (e: { message: string }) => { setTrocando(null); setErro(e.message); };
  /* Recarrega da raiz: o cache inteiro sai de cena junto com a página. */
  const recomecar = () => { window.location.assign("/"); };

  const criar = trpc.companies.create.useMutation({ onSuccess: recomecar, onError: aoFalhar });
  const abrir = trpc.companies.open.useMutation({ onSuccess: recomecar, onError: aoFalhar });
  const renomear = trpc.companies.rename.useMutation({ onSuccess: () => { setErro(null); setForm(null); onMudou(); }, onError: aoFalhar });
  const arquivar = trpc.companies.setArchived.useMutation({ onSuccess: () => { setErro(null); onMudou(); }, onError: aoFalhar });

  const ativas = empresas.filter(e => e.isActive).length;
  const ocupado = criar.isPending || abrir.isPending;

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="company-switcher-title" className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#0B1F14]/42 p-4 backdrop-blur-[2px] sm:p-10" onMouseDown={event => event.target === event.currentTarget && !ocupado && onClose()}>
      <div className="modal-enter w-full max-w-[452px] rounded-[20px] bg-white p-6 text-[#0B1F14]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={SwapIcon} />
          <div className="min-w-0 flex-1">
            <h2 id="company-switcher-title" className="text-[18px] font-bold tracking-[-.01em]">
              {form?.modo === "criar" ? "Nova empresa" : form?.modo === "renomear" ? "Editar empresa" : "Trocar de empresa"}
            </h2>
            <p className="mt-1 text-[12.5px] text-[#8A968D]">
              {form?.modo === "criar"
                ? "Ela nasce vazia, e você cai nas boas-vindas dela"
                : carregando
                  ? "carregando…"
                  : `${empresas.length} ${empresas.length === 1 ? "empresa" : "empresas"} neste acesso`}
            </p>
          </div>
          <button type="button" aria-label="Fechar" disabled={ocupado} onClick={onClose} className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#F1F4F2] text-[#28382E] hover:bg-[#E7ECE9] disabled:opacity-50"><CloseIcon size={16} /></button>
        </div>

        {form ? (
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
              {empresas.length === 0 && !carregando && (
                <p className="rounded-[14px] bg-[#F8FAF9] px-3.5 py-4 text-center text-[12.5px] text-[#8A968D]">
                  Nenhuma empresa cadastrada ainda.
                </p>
              )}
              {empresas.map(empresa => {
                const abrindo = trocando === empresa.id && abrir.isPending;
                return (
                  <div
                    key={empresa.id}
                    className={`rounded-[14px] p-3.5 ${
                      empresa.isCurrent ? "border-[1.5px] border-[#12B85C] bg-[#F1FBF6]" : "border border-[#E3EAE5]"
                    } ${empresa.isActive ? "" : "opacity-60"}`}
                  >
                    <div className="flex items-center gap-3">
                      {/* A linha inteira abre a empresa, menos a que já está aberta. */}
                      <button
                        type="button"
                        disabled={empresa.isCurrent || !empresa.isActive || ocupado}
                        onClick={() => { setErro(null); setTrocando(empresa.id); abrir.mutate({ companyId: empresa.id }); }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default"
                      >
                        <span className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[11px] text-[13px] font-bold ${
                          empresa.isCurrent ? "bg-[#12B85C] text-white" : empresa.isActive ? "bg-[#DFF6EA] text-[#0A7A42]" : "bg-[#F1F4F2] text-[#4C6355]"
                        }`}>
                          {companyInitials(empresa.displayName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[14px] ${empresa.isCurrent ? "font-bold text-[#0A7A42]" : "font-semibold"}`}>
                            {empresa.displayName}
                          </span>
                          <span className="block truncate text-[12px] text-[#8A968D]">
                            {abrindo ? "abrindo…" : empresa.isActive ? (empresa.taxId || "CNPJ não informado") : "arquivada"}
                          </span>
                        </span>
                        {empresa.isCurrent
                          ? <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-[.06em] text-[#0A7A42]">Atual</span>
                          : empresa.isActive && <ChevronRightIcon size={18} className="shrink-0 text-[#8A968D]" />}
                      </button>
                    </div>

                    <div className="mt-2.5 flex items-center gap-1 border-t border-[#F1F4F2] pt-2.5">
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => { setErro(null); setForm({ modo: "renomear", empresa }); }}
                        className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#0A7A42] hover:bg-[#DFF6EA] disabled:opacity-50"
                      >
                        Editar
                      </button>
                      {/* A última ativa não sai da lista de escolha: sem nenhuma ativa,
                          o login não abriria tela nenhuma. O servidor recusa; aqui o
                          botão nem aparece, para a recusa não ser surpresa. */}
                      {(!empresa.isActive || ativas > 1) && (
                        <button
                          type="button"
                          disabled={arquivar.isPending || ocupado}
                          onClick={() => { setErro(null); arquivar.mutate({ companyId: empresa.id, archived: empresa.isActive }); }}
                          className="rounded-lg px-2 py-1 text-[12px] font-semibold text-[#4C6355] hover:bg-[#F1F4F2] disabled:opacity-50"
                        >
                          {empresa.isActive ? "Arquivar" : "Reativar"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <button
                type="button"
                disabled={ocupado}
                onClick={() => { setErro(null); setForm({ modo: "criar" }); }}
                className="flex h-[46px] items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-[#B9C7BE] text-[13.5px] font-semibold text-[#4C6355] hover:bg-[#F8FAF9] disabled:opacity-50"
              >
                <PlusIcon size={16} />
                Adicionar empresa
              </button>
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
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [switcher, setSwitcher] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  // O nome da empresa só aparece depois que o menu abre. Buscá-lo junto com a
  // página punha mais uma consulta no lote que o conteúdo espera.
  const companyQuery = trpc.settings.company.useQuery(undefined, { enabled: open || switcher, staleTime: 60_000 });
  /* A lista só é buscada quando o seletor abre — o menu do perfil não precisa dela. */
  const companiesQuery = trpc.companies.list.useQuery(undefined, { enabled: switcher, staleTime: 60_000 });

  const company = companyQuery.data;
  const companyName = company?.tradeName || company?.legalName || "Empresa sem nome";

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
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C] text-[13px] font-bold text-white">
                {companyInitials(companyName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#0A7A42]">{companyName}</span>
                <span className="block text-[12px] text-[#4C6355]">empresa atual</span>
              </span>
              {/* Troca, não avanço: a seta única dizia "próxima tela". */}
              <SwapIcon size={17} className="shrink-0 text-[#0A7A42]" />
            </button>

            <button
              type="button"
              onClick={() => { setOpen(false); setLocation("/configuracoes"); }}
              className="mt-1.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] text-[#28382E] hover:bg-[#F1FBF6]"
            >
              <SettingsIcon size={16} className="text-[#4C6355]" />
              <span className="flex-1">Configurações</span>
              <ChevronRightIcon size={15} className="text-[#8A968D]" />
            </button>

            <button
              type="button"
              onClick={() => { setOpen(false); setLocation("/configuracoes?aba=assinatura"); }}
              className="mt-0.5 flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left text-[14px] text-[#28382E] hover:bg-[#F1FBF6]"
            >
              <CardIcon size={16} className="text-[#4C6355]" />
              <span className="flex-1">Assinatura</span>
              <ChevronRightIcon size={15} className="text-[#8A968D]" />
            </button>

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
