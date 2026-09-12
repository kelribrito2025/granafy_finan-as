import { useAuth } from "@/_core/hooks/useAuth";
import { FormularioDeEmpresa } from "@/components/FormularioDeEmpresa";
import { GranafyLoader } from "@/components/GranafyLoader";
import { GranafyLogo } from "@/components/GranafyLogo";
import { PlusIcon } from "@/components/IconlyIcons";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { companyInitials } from "@shared/companies";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

/*
 * Em qual empresa entrar.
 *
 * Só aparece para quem tem mais de uma empresa ATIVA e ainda não pediu para
 * ser lembrado neste navegador — quem tem uma só entra direto, porque
 * perguntar entre uma opção não é escolher, é um clique a mais. Quem decide é
 * o servidor, em `companies.portao`; esta tela só desenha a escolha.
 *
 * Duas coisas do desenho não foram feitas, e as duas pela mesma razão: não
 * têm fonte. Papel por empresa ("Administradora", "Somente leitura") não
 * existe — um login tem acesso total às empresas dele e não há convite nem
 * compartilhamento, então todas as linhas diriam a mesma coisa. E "último
 * acesso" com data exigiria uma coluna que ninguém escreve hoje; o que existe
 * de verdade é a última escolha guardada no cookie, e é ela que a etiqueta
 * mostra.
 *
 * Entrar RECARREGA a página a partir da raiz, como a troca pelo menu do
 * perfil. Não é preguiça de invalidar consulta por consulta: cada tela guarda
 * o recorte dela, e uma que ficasse para trás mostraria o número de uma
 * empresa embaixo do nome de outra.
 */
export default function EscolherEmpresaPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const lista = trpc.companies.list.useQuery();
  const [escolhida, setEscolhida] = useState<number | null>(null);
  const [lembrar, setLembrar] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const empresas = (lista.data ?? []).filter(empresa => empresa.isActive);

  /*
   * A pré-seleção é a última que a pessoa abriu neste navegador. Sem cookie
   * ainda — primeiro login — cai na primeira da lista, que é a ordem que ela
   * mesma definiu.
   */
  useEffect(() => {
    if (escolhida !== null || empresas.length === 0) return;
    setEscolhida(empresas.find(empresa => empresa.ultimaEscolhida)?.id ?? empresas[0]!.id);
  }, [empresas, escolhida]);

  /* Recarrega da raiz: o cache inteiro sai de cena junto com a página. */
  const recomecar = () => { window.location.assign("/"); };
  const aoFalhar = (e: { message: string }) => setErro(e.message);

  const abrir = trpc.companies.open.useMutation({ onSuccess: recomecar, onError: aoFalhar });
  const criar = trpc.companies.create.useMutation({ onSuccess: recomecar, onError: aoFalhar });

  /*
   * Uma empresa ativa só: não há escolha a fazer, e mostrar a tela seria
   * inventar um passo. Acontece quando alguém chega aqui pelo endereço direto,
   * ou arquiva a segunda empresa com esta página aberta.
   */
  useEffect(() => {
    if (lista.isSuccess && empresas.length <= 1) setLocation("/", { replace: true });
  }, [empresas.length, lista.isSuccess, setLocation]);

  const alvo = empresas.find(empresa => empresa.id === escolhida) ?? null;
  const ocupado = abrir.isPending || criar.isPending;

  return (
    <main className="relative min-h-screen bg-white text-[#0B1F14] lg:grid lg:grid-cols-[minmax(0,1.3fr)_minmax(460px,.92fr)]">
      <PainelDaMarca />

      <section className="relative flex min-h-screen flex-col px-5 py-6 sm:px-10 sm:py-9 lg:px-12 xl:px-14">
        <ThemeToggle showLabel={false} className="absolute right-5 top-6 z-20 sm:right-10 sm:top-9 lg:right-12 xl:right-14" />

        <div className="mb-8 lg:hidden">
          <GranafyLogo size={38} nameSize={20} subtitle="Powered by Bigteck" />
        </div>

        <div className="my-auto w-full max-w-[520px] py-8">
          <h1 className="text-[30px] font-bold leading-[1.1] tracking-[-0.04em] sm:text-[34px]">Em qual empresa entrar?</h1>
          <p className="mt-2 text-[14px] text-[#4C6355]">
            {lista.isPending
              ? "Carregando suas empresas…"
              : `Você tem acesso a ${empresas.length} empresas com este login.`}
          </p>

          <QuemEstaEntrando nome={user?.name ?? null} email={user?.email ?? null} />

          {lista.isPending && (
            <div className="mt-8 flex justify-center"><GranafyLoader label="Carregando suas empresas" /></div>
          )}

          {lista.error && (
            <p className="mt-6 rounded-xl bg-[#FBEBE9] px-3.5 py-2.5 text-[12.5px] text-[#A5231A]">{lista.error.message}</p>
          )}

          {!criando && empresas.length > 0 && (
            <>
              <span className="mt-7 block text-[11px] font-semibold uppercase tracking-[.1em] text-[#8A968D]">Suas empresas</span>
              <div className="mt-2.5 flex flex-col gap-2">
                {empresas.map(empresa => (
                  <LinhaDeEmpresa
                    key={empresa.id}
                    nome={empresa.displayName}
                    documento={empresa.taxId}
                    ultima={empresa.ultimaEscolhida}
                    marcada={empresa.id === escolhida}
                    onEscolher={() => { setErro(null); setEscolhida(empresa.id); }}
                  />
                ))}
              </div>

              {erro && <p className="mt-4 rounded-xl bg-[#FBEBE9] px-3.5 py-2.5 text-[12.5px] text-[#A5231A]">{erro}</p>}

              <button
                type="button"
                disabled={!alvo || ocupado}
                onClick={() => alvo && abrir.mutate({ companyId: alvo.id, lembrar })}
                className="mt-5 h-13 w-full rounded-[12px] bg-[#12B85C] py-4 text-[14.5px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:pointer-events-none disabled:opacity-50"
              >
                {abrir.isPending ? "Entrando…" : alvo ? `Entrar na ${alvo.displayName}` : "Entrar"}
              </button>

              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => { setErro(null); setCriando(true); }}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0A7A42] transition hover:text-[#0B1F14]"
                >
                  <PlusIcon size={15} />
                  Adicionar empresa
                </button>
                <label className="flex cursor-pointer items-center gap-2 text-[13px] text-[#4C6355]">
                  <input
                    type="checkbox"
                    checked={lembrar}
                    onChange={e => setLembrar(e.target.checked)}
                    className="h-4 w-4 accent-[#12B85C]"
                  />
                  Lembrar minha escolha neste dispositivo
                </label>
              </div>
            </>
          )}

          {criando && (
            <>
              <span className="mt-7 block text-[11px] font-semibold uppercase tracking-[.1em] text-[#8A968D]">Nova empresa</span>
              <p className="mt-1.5 text-[13px] leading-relaxed text-[#4C6355]">
                Ela já nasce aberta, com o catálogo de categorias, e você cai direto nas boas-vindas dela.
              </p>
              <FormularioDeEmpresa
                inicial={null}
                salvando={criar.isPending}
                erro={erro}
                onCancelar={() => { setErro(null); setCriando(false); }}
                onSalvar={valores => criar.mutate(valores)}
              />
            </>
          )}
        </div>

        <footer className="mt-auto pt-6 text-[11.5px] text-[#8A968D]">© {new Date().getFullYear()} GranaFy</footer>
      </section>
    </main>
  );
}

/** Quem está entrando, e a saída — o login pode não ser o que a pessoa queria. */
function QuemEstaEntrando({ nome, email }: { nome: string | null; email: string | null }) {
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  return (
    <div className="mt-6 flex items-center gap-3 rounded-[14px] bg-[#F4F8F6] p-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0B1F14] text-[12px] font-bold text-[#7EE2A8]">
        {companyInitials(nome ?? email ?? "?")}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-[13.5px]">{nome ?? "sem nome"}</strong>
        <span className="truncate text-[12px] text-[#8A968D]">{email}</span>
      </span>
      <button
        type="button"
        onClick={async () => { await logout(); setLocation("/login", { replace: true }); }}
        className="shrink-0 text-[13px] font-semibold text-[#4C6355] transition hover:text-[#B3261E]"
      >
        Sair
      </button>
    </div>
  );
}

function LinhaDeEmpresa({ nome, documento, ultima, marcada, onEscolher }: {
  nome: string;
  documento: string;
  ultima: boolean;
  marcada: boolean;
  onEscolher: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEscolher}
      aria-pressed={marcada}
      className={`flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition ${
        marcada ? "bg-[#F1FBF6] ring-1 ring-[#12B85C]" : "bg-[#F8FAF9] hover:bg-[#F1F4F2]"
      }`}
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-[12px] font-bold ${
        marcada ? "bg-[#12B85C] text-white" : "bg-[#DFF6EA] text-[#0A7A42]"
      }`}>
        {companyInitials(nome)}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <strong className="truncate text-[14px]">{nome}</strong>
        <span className="truncate text-[12px] text-[#8A968D]">{documento || "CNPJ não informado"}</span>
      </span>
      {ultima && (
        <span className="shrink-0 rounded-[7px] bg-[#DFF6EA] px-2 py-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#0A7A42]">
          Última aberta
        </span>
      )}
      <span className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${
        marcada ? "border-[#12B85C] bg-[#12B85C] text-white" : "border-[#C9D4CD]"
      }`}>
        {marcada && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
        )}
      </span>
    </button>
  );
}

function PainelDaMarca() {
  return (
    <section className="relative hidden min-h-full overflow-hidden bg-[#0B1F14] p-8 text-white lg:flex lg:flex-col xl:p-11">
      <div className="pointer-events-none absolute -right-32 -top-32 h-[420px] w-[420px] rounded-full bg-[#12B85C]/12 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-44 -left-32 h-[380px] w-[380px] rounded-full bg-[#7EE2A8]/10 blur-3xl" />

      <div className="relative z-10">
        <GranafyLogo size={46} nameSize={25} tone="onDark" subtitle="Powered by Bigteck" />
      </div>

      <div className="relative z-10 my-auto max-w-[540px] py-12">
        <span className="inline-flex items-center gap-2 rounded-full bg-[#12B85C]/14 px-3 py-1.5 text-[11px] font-semibold text-[#7EE2A8] ring-1 ring-[#12B85C]/20">
          <span className="h-1.5 w-1.5 rounded-full bg-[#12B85C]" />
          Um login, várias empresas
        </span>
        <h1 className="mt-6 max-w-[500px] text-[40px] font-semibold leading-[1.08] tracking-[-0.045em] xl:text-[48px]">
          Escolha onde você quer trabalhar agora.
        </h1>
        <p className="mt-5 max-w-[460px] text-[15px] leading-7 text-[#A9C1B2]">
          Cada empresa tem caixa, categorias e relatórios próprios. Você troca quando quiser, pelo menu do perfil.
        </p>
      </div>

      <p className="relative z-10 text-[12px] text-[#8FB39E]">
        Seus dados financeiros continuam privados e vinculados à sua conta.
      </p>
    </section>
  );
}
