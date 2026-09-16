import { useAuth } from "@/_core/hooks/useAuth";
import { BuildingIcon, CheckIcon, LockIcon, UsersIcon } from "@/components/IconlyIcons";
import { GranafyLoader } from "@/components/GranafyLoader";
import { GranafyLogo } from "@/components/GranafyLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { trpc } from "@/lib/trpc";
import { isPasswordValid, PASSWORD_REQUIREMENT_MESSAGE } from "@shared/password";
import { useQueryClient } from "@tanstack/react-query";
import { FormEvent, type ReactElement, useState } from "react";
import { Link, useLocation, useParams } from "wouter";

/*
 * /convite/<token> — onde o contador aceita.
 *
 * Três situações, decididas pelo servidor em `acessos.convite`:
 *   - já está logado com o e-mail convidado → um botão: Aceitar.
 *   - está logado com OUTRO e-mail → explica, e oferece sair.
 *   - não está logado → entra com a senha que tem, ou cria a senha ali se o
 *     e-mail ainda não tem conta. O e-mail não é editável: é o do convite.
 *
 * Depois do aceite, a pessoa vai escolher a empresa: as liberadas já aparecem
 * no seletor, porque `ctx.companies` passou a incluí-las na Fase A.
 */

const inputClass =
  "h-12 w-full rounded-[12px] border border-[#DCE5DF] bg-[#F4F8F6] px-3.5 text-[13px] text-[#0B1F14] outline-none transition placeholder:text-[#9AA69E] focus:border-[#12B85C] focus:bg-white focus:ring-4 focus:ring-[#12B85C]/10 disabled:text-[#718077]";
const botaoClass =
  "flex h-12 w-full items-center justify-center gap-2 rounded-[12px] bg-[#12B85C] px-5 text-[14px] font-bold text-white transition hover:bg-[#0F9E4E] disabled:opacity-60";

const MOTIVO: Record<string, { titulo: string; texto: string }> = {
  aceito: { titulo: "Este convite já foi aceito", texto: "Você já tem acesso. Entre na sua conta e escolha a empresa no seletor." },
  revogado: { titulo: "Este convite foi cancelado", texto: "Quem convidou cancelou ou reenviou. Peça um convite novo." },
  vencido: { titulo: "Este convite venceu", texto: "Convites valem por 7 dias. Peça um novo a quem convidou." },
  inexistente: { titulo: "Convite não encontrado", texto: "Confira se o link veio inteiro do e-mail. Se veio, peça um convite novo." },
};

export default function ConvitePage() {
  const { token = "" } = useParams<{ token: string }>();
  const { user, loading: carregandoSessao, logout } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const utils = trpc.useUtils();

  const convite = trpc.acessos.convite.useQuery({ token }, { retry: false, enabled: token.length > 0 });
  const aceitar = trpc.acessos.aceitar.useMutation();
  const aceitarCriando = trpc.acessos.aceitarCriandoConta.useMutation();
  const login = trpc.auth.login.useMutation();

  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Depois do vínculo gravado: cache limpo e direto para a escolha de empresa. */
  const concluir = async (companyIds: number[]) => {
    queryClient.clear();
    if (companyIds.length === 1) {
      await utils.client.companies.open.mutate({ companyId: companyIds[0]! }).catch(() => null);
      setLocation("/", { replace: true });
    } else {
      setLocation("/escolher-empresa", { replace: true });
    }
  };

  const aceitarLogado = async () => {
    setErro(null);
    try {
      const { companyIds } = await aceitar.mutateAsync({ token });
      await concluir(companyIds);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aceitar");
    }
  };

  const entrarEAceitar = async (event: FormEvent, email: string) => {
    event.preventDefault();
    setErro(null);
    try {
      await login.mutateAsync({ email, password: senha, remember: true });
      const { companyIds } = await aceitar.mutateAsync({ token });
      await concluir(companyIds);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível entrar");
    }
  };

  const criarEAceitar = async (event: FormEvent) => {
    event.preventDefault();
    setErro(null);
    if (!isPasswordValid(senha)) return setErro(PASSWORD_REQUIREMENT_MESSAGE);
    if (senha !== confirmacao) return setErro("As senhas não coincidem");
    if (!aceitouTermos) return setErro("É preciso aceitar os termos de uso e a política de privacidade");
    try {
      const { companyIds } = await aceitarCriando.mutateAsync({ token, name: nome, password: senha, acceptedTerms: true });
      await concluir(companyIds);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível criar a conta");
    }
  };

  const ocupado = aceitar.isPending || aceitarCriando.isPending || login.isPending;

  let conteudo: ReactElement;
  if (convite.isLoading || carregandoSessao) {
    conteudo = <div className="flex min-h-[220px] items-center justify-center"><GranafyLoader label="Conferindo o convite" /></div>;
  } else if (!convite.data || convite.data.status === "invalido") {
    const motivo = MOTIVO[convite.data?.motivo ?? "inexistente"] ?? MOTIVO.inexistente!;
    conteudo = (
      <>
        <Selo icone={<LockIcon size={22} />} />
        <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.04em]">{motivo.titulo}</h1>
        <p className="mt-3 text-[14.5px] leading-6 text-[#718077]">{motivo.texto}</p>
        <Link href="/login" className={`${botaoClass} mt-8`}>Ir para a entrada</Link>
      </>
    );
  } else {
    const dados = convite.data;
    const listaDeEmpresas = (
      <ul className="mt-5 flex flex-col gap-2">
        {dados.empresas.map(nomeDaEmpresa => (
          <li key={nomeDaEmpresa} className="flex items-center gap-3 rounded-[12px] bg-[#F1FBF6] px-3.5 py-2.5 text-[13.5px] font-semibold text-[#0A7A42]">
            <BuildingIcon size={16} /> {nomeDaEmpresa}
          </li>
        ))}
      </ul>
    );
    const cabecalho = (
      <>
        <Selo icone={<UsersIcon size={22} />} />
        <h1 className="mt-6 text-[28px] font-semibold leading-tight tracking-[-0.04em]">
          {dados.convidadoPor} liberou o acesso para você
        </h1>
        <p className="mt-3 text-[14.5px] leading-6 text-[#718077]">
          Como <strong className="text-[#28382E]">contador</strong>, em modo leitura: você vê tudo e não altera nada.
        </p>
        {listaDeEmpresas}
      </>
    );

    if (user && dados.sessaoConfere) {
      conteudo = (
        <>
          {cabecalho}
          <p className="mt-6 text-[13px] text-[#4C6355]">Você está conectado como <strong>{user.email}</strong>.</p>
          <button type="button" onClick={aceitarLogado} disabled={ocupado} className={`${botaoClass} mt-4`}>
            {ocupado ? "Aceitando..." : <><CheckIcon size={16} /> Aceitar convite</>}
          </button>
        </>
      );
    } else if (user) {
      conteudo = (
        <>
          {cabecalho}
          <div className="mt-6 rounded-[14px] bg-[#FFF7ED] p-4 text-[13px] leading-relaxed text-[#7A4B00]">
            Este convite é para <strong>{dados.email}</strong>, e você está conectado como <strong>{user.email}</strong>. Saia e entre com o e-mail convidado para aceitar.
          </div>
          <button
            type="button"
            disabled={ocupado}
            onClick={async () => { await logout(); window.location.reload(); }}
            className={`${botaoClass} mt-4`}
          >
            Sair e entrar com {dados.email}
          </button>
        </>
      );
    } else if (dados.jaTemConta) {
      conteudo = (
        <>
          {cabecalho}
          <form className="mt-6 space-y-4" onSubmit={e => entrarEAceitar(e, dados.email)}>
            <Campo rotulo="E-mail"><input className={inputClass} type="email" value={dados.email} disabled readOnly /></Campo>
            <Campo rotulo="Senha"><input className={inputClass} type="password" autoComplete="current-password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={8} /></Campo>
            <button type="submit" disabled={ocupado} className={botaoClass}>{ocupado ? "Entrando..." : "Entrar e aceitar"}</button>
          </form>
        </>
      );
    } else {
      conteudo = (
        <>
          {cabecalho}
          <p className="mt-6 text-[13px] text-[#4C6355]">Ainda não existe conta com <strong>{dados.email}</strong>. Crie a sua senha para aceitar.</p>
          <form className="mt-4 space-y-4" onSubmit={criarEAceitar}>
            <Campo rotulo="Seu nome"><input className={inputClass} type="text" autoComplete="name" value={nome} onChange={e => setNome(e.target.value)} required minLength={2} maxLength={80} placeholder="Como você se chama" /></Campo>
            <Campo rotulo="E-mail"><input className={inputClass} type="email" value={dados.email} disabled readOnly /></Campo>
            <Campo rotulo="Senha"><input className={inputClass} type="password" autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} required minLength={8} maxLength={128} /></Campo>
            <Campo rotulo="Confirmar senha"><input className={inputClass} type="password" autoComplete="new-password" value={confirmacao} onChange={e => setConfirmacao(e.target.value)} required minLength={8} maxLength={128} /></Campo>
            <p className="text-[11.5px] leading-relaxed text-[#718077]">{PASSWORD_REQUIREMENT_MESSAGE}</p>
            <label className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#4C6355]">
              <input type="checkbox" checked={aceitouTermos} onChange={e => setAceitouTermos(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#12B85C]" />
              <span>Li e aceito os <Link href="/termos" className="font-semibold text-[#0A7A42] underline">termos de uso</Link> e a <Link href="/privacidade" className="font-semibold text-[#0A7A42] underline">política de privacidade</Link>.</span>
            </label>
            <button type="submit" disabled={ocupado} className={botaoClass}>{ocupado ? "Criando..." : "Criar conta e aceitar"}</button>
          </form>
        </>
      );
    }
  }

  return (
    <main className="relative min-h-screen bg-[#EFF4F1] px-4 py-8 text-[#0B1F14] sm:px-6">
      <ThemeToggle showLabel={false} className="absolute right-4 top-6 sm:right-8" />
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
        <GranafyLogo size={38} nameSize={20} subtitle="Powered by Bigteck" />
        <section className="rounded-[24px] bg-white p-6 ring-1 ring-[#E1E8E3] sm:p-9">
          {conteudo}
          {erro && <p className="mt-4 rounded-[12px] bg-[#FEF3F2] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#B42318]">{erro}</p>}
        </section>
        <p className="text-center text-[11.5px] text-[#8A968D]">Seus dados continuam privados e vinculados à sua conta.</p>
      </div>
    </main>
  );
}

function Selo({ icone }: { icone: ReactElement }) {
  return <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#E5F7ED] text-[#0A7A42]">{icone}</span>;
}

function Campo({ rotulo, children }: { rotulo: string; children: ReactElement }) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold text-[#18271F]">{rotulo}</span>
      {children}
    </label>
  );
}
