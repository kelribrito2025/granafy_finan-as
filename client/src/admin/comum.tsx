import { useAuth } from "@/_core/hooks/useAuth";
import { GranafyLoader } from "@/components/GranafyLoader";
import {
  BuildingIcon,
  CardIcon,
  ChartIcon,
  DashboardIcon,
  SettingsIcon,
  TrendUpIcon,
  UsersIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { trpc } from "@/lib/trpc";
import { useMostrarAssinaturas } from "./preferencias";
import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";

/*
 * A casca do admin do sistema.
 *
 * Barra lateral escura, à parte da do painel: quem está aqui não está numa
 * empresa, está olhando todas. O portão é o papel do usuário — sem `admin`,
 * volta para o painel sem ver nada. O servidor recusa do mesmo jeito; a
 * tela só não deixa a pessoa ver uma casca vazia com erros.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { user, loading, isAuthenticated } = useAuth();
  const [local, setLocation] = useLocation();
  const admin = user?.role === "admin";

  useEffect(() => {
    if (loading) return;
    if (!isAuthenticated) setLocation("/login", { replace: true });
    else if (!admin) setLocation("/", { replace: true });
  }, [admin, isAuthenticated, loading, setLocation]);

  if (loading || !admin) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#EFF4F1]">
        <GranafyLoader label="Verificando seu acesso" />
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <BarraDoAdmin local={local} nome={user?.name ?? user?.email ?? "Admin"} />
        <section className="flex min-w-0 flex-1 flex-col gap-5">{children}</section>
      </div>
    </main>
  );
}

const GRUPOS: Array<{ titulo: string; itens: Array<{ rotulo: string; icone: IconlyIcon; caminho: string; contador?: "contas" | "usuarios" }> }> = [
  {
    titulo: "Operação",
    itens: [
      { rotulo: "Visão geral", icone: DashboardIcon, caminho: "/admin" },
      { rotulo: "Contas", icone: BuildingIcon, caminho: "/admin/contas", contador: "contas" },
      { rotulo: "Usuários", icone: UsersIcon, caminho: "/admin/usuarios", contador: "usuarios" },
      { rotulo: "Assinaturas", icone: CardIcon, caminho: "/admin/assinaturas" },
    ],
  },
  {
    titulo: "Análise",
    itens: [
      { rotulo: "Receita", icone: TrendUpIcon, caminho: "/admin/receita" },
      { rotulo: "Retenção", icone: ChartIcon, caminho: "/admin/retencao" },
    ],
  },
  { titulo: "Sistema", itens: [{ rotulo: "Configurações", icone: SettingsIcon, caminho: "/admin/configuracoes" }] },
];

/*
 * A barra fica parada enquanto o conteúdo rola: `sticky` na altura da
 * janela, com a rolagem dentro dela. Sem a altura fixa o flex a estica até o
 * fim do conteúdo e o `sticky` não tem para onde grudar — em página longa
 * (Usuários, Contas) o menu subia junto e sumia.
 */
function BarraDoAdmin({ local, nome }: { local: string; nome: string }) {
  const barra = trpc.admin.barra.useQuery(undefined, { staleTime: 60_000 });
  const ativo = (caminho: string) => (caminho === "/admin" ? local === "/admin" : local.startsWith(caminho));
  /* Assinaturas some do menu enquanto não tiver fonte — ver `preferencias.ts`. */
  const mostrarAssinaturas = useMostrarAssinaturas();
  const grupos = GRUPOS.map(grupo => ({
    ...grupo,
    itens: grupo.itens.filter(item => mostrarAssinaturas || item.caminho !== "/admin/assinaturas"),
  })).filter(grupo => grupo.itens.length > 0);
  return (
    <aside className="hidden w-[232px] shrink-0 flex-col gap-5 self-start overflow-y-auto rounded-[20px] bg-[#0B1F14] px-3 py-5 text-white lg:sticky lg:top-5 lg:flex lg:h-[calc(100vh-40px)] lg:min-h-0">
      <div className="flex items-center gap-2.5 px-1.5">
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[#12B85C]">
          <svg width="20" height="20" viewBox="0 0 64 64" fill="none" aria-hidden="true"><circle cx="32" cy="32" r="23" stroke="#FFFFFF" strokeWidth="10" opacity=".38" /><path d="M55 32a23 23 0 01-36 19" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" /></svg>
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="text-[14px] font-bold tracking-[-.02em]">GranaFy</span>
          <span className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#7EE2A8]">Admin</span>
        </div>
      </div>

      {grupos.map(grupo => (
        <div key={grupo.titulo} className="flex flex-col gap-[3px]">
          <span className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-[.1em] text-[#5E7A6B]">{grupo.titulo}</span>
          {grupo.itens.map(item => {
            const Icone = item.icone;
            const contador = item.contador ? barra.data?.[item.contador] : undefined;
            const atual = ativo(item.caminho);
            return (
              <Link
                key={item.caminho}
                href={item.caminho}
                className={`flex items-center gap-[11px] rounded-[12px] px-3 py-[11px] text-[13.5px] transition ${atual ? "bg-[#12B85C] font-bold text-white" : "text-[#C5DACE] hover:bg-white/[.06]"}`}
              >
                <Icone size={16} className="shrink-0" />
                <span className="flex-1">{item.rotulo}</span>
                {contador !== undefined && (
                  <span className={`rounded-[6px] px-2 py-0.5 text-[11px] font-bold ${atual ? "bg-white/20 text-white" : "bg-[rgba(18,184,92,.24)] text-[#7EE2A8]"}`}>{contador}</span>
                )}
              </Link>
            );
          })}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-2.5">
        <Link href="/" className="px-2 text-[12px] text-[#8FB39E] transition hover:text-white">← Voltar ao painel</Link>
        <div className="flex items-center gap-2.5 rounded-[14px] bg-[#153021] p-3">
          <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-[12px] font-bold text-white">{iniciais(nome)}</span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[12.5px] font-semibold">{nome}</span>
            <span className="text-[11px] text-[#8FB39E]">Superadmin</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ── Peças ──────────────────────────────────────────────────────────────── */

export function AdminHeader({ titulo, subtitulo, children }: { titulo: string; subtitulo?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-center gap-3">
      <div className="mr-auto flex min-w-0 flex-col gap-0.5">
        <h1 className="text-[24px] font-bold tracking-[-.02em]">{titulo}</h1>
        {subtitulo && <p className="truncate text-[13px] text-[#4C6355]">{subtitulo}</p>}
      </div>
      {children}
    </header>
  );
}

export function Busca({ valor, aoMudar, placeholder }: { valor: string; aoMudar: (v: string) => void; placeholder: string }) {
  return (
    <label className="relative w-full sm:w-[280px]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A968D" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" /></svg>
      <input value={valor} onChange={e => aoMudar(e.target.value)} placeholder={placeholder} className="h-10 w-full rounded-[12px] bg-white pl-10 pr-3 text-[13px] outline-none ring-1 ring-[#DFE6E1] focus:ring-2 focus:ring-[#12B85C]" />
    </label>
  );
}

export function Segmentos<T extends string>({ valor, opcoes, aoMudar }: { valor: T; opcoes: Array<[T, string]>; aoMudar: (v: T) => void }) {
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1]">
      {opcoes.map(([v, rotulo]) => (
        <button key={v} type="button" onClick={() => aoMudar(v)} className={`px-3.5 text-[13px] transition ${valor === v ? "bg-[#0B1F14] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1FBF6]"}`}>{rotulo}</button>
      ))}
    </div>
  );
}

/**
 * Um número do sistema. `valor` nulo é o traço com a razão: o que não tem
 * fonte aparece como "—", nunca como número inventado.
 */
export function Kpi({ rotulo, valor, apoio, tom = "neutro", razao }: {
  rotulo: string;
  valor: string | number | null;
  apoio?: ReactNode;
  tom?: "neutro" | "bom" | "ruim" | "escuro";
  /** Por que não há valor — aparece no lugar do apoio. */
  razao?: string;
}) {
  const semFonte = valor === null;
  const cor = semFonte ? "text-[#B9C7BE]" : tom === "bom" ? "text-[#0A7A42]" : tom === "ruim" ? "text-[#B3261E]" : tom === "escuro" ? "text-white" : "";
  const base = tom === "escuro"
    ? "bg-[#0B1F14] text-white"
    : "bg-white ring-1 ring-[#E1E8E3]";
  return (
    <article className={`flex flex-col gap-1.5 rounded-[20px] p-5 ${base}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${tom === "escuro" ? "text-[#8FB39E]" : "text-[#4C6355]"}`}>{rotulo}</span>
      <strong className={`text-[26px] font-bold tracking-[-.02em] ${cor}`} title={semFonte ? razao : undefined}>{semFonte ? "—" : valor}</strong>
      <span className={`text-[12px] ${tom === "escuro" ? "text-[#8FB39E]" : "text-[#8A968D]"}`}>{semFonte ? razao : apoio}</span>
    </article>
  );
}

/** "—" com a razão, para uma célula de tabela. */
export function Traco({ razao }: { razao: string }) {
  return <span className="text-[#B9C7BE]" title={razao}>—</span>;
}

/** A etiqueta das telas de exemplo: visível, para nunca serem lidas como verdade. */
export function EtiquetaDeExemplo({ texto = "Dados de exemplo · esta tela ainda não tem fonte no sistema" }: { texto?: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[12px] border border-dashed border-[#E0C48A] bg-[#FFF9EB] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#8A4B00]">
      <span className="h-2 w-2 rounded-full bg-[#F2A93B]" />
      {texto}
    </div>
  );
}

export function Cartao({ titulo, acao, children, className = "" }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex flex-col gap-3.5 rounded-[20px] bg-white p-5 ring-1 ring-[#E1E8E3] ${className}`}>
      {(titulo || acao) && (
        <div className="flex items-center gap-3">
          {titulo && <h2 className="text-[15px] font-bold">{titulo}</h2>}
          {acao && <div className="ml-auto">{acao}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Avatar({ nome, tom = "claro" }: { nome: string; tom?: "claro" | "escuro" }) {
  return (
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold ${tom === "escuro" ? "bg-[#0B1F14] text-[#7EE2A8]" : "bg-[#DFF6EA] text-[#0A7A42]"}`}>{iniciais(nome)}</span>
  );
}

export function Pilula({ tom, children }: { tom: "bom" | "neutro" | "ruim" | "aviso"; children: ReactNode }) {
  const cor = { bom: "bg-[#DFF6EA] text-[#0A7A42]", neutro: "bg-[#F1F4F2] text-[#4C6355]", ruim: "bg-[#FDECEA] text-[#8E1F16]", aviso: "bg-[#FFF3E6] text-[#8A4B00]" }[tom];
  return <span className={`inline-flex rounded-[7px] px-2 py-[3px] text-[11px] font-bold ${cor}`}>{children}</span>;
}

/**
 * Um interruptor que liga alguma coisa de verdade.
 *
 * As telas de exemplo têm um desenho parecido que não liga nada; este tem
 * `role="switch"`, teclado e foco visível, porque é botão e não enfeite.
 */
export function Interruptor({ ligado, rotulo, onAlternar }: { ligado: boolean; rotulo: string; onAlternar: (valor: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      aria-label={rotulo}
      onClick={() => onAlternar(!ligado)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition outline-none focus-visible:ring-2 focus-visible:ring-[#12B85C] focus-visible:ring-offset-2 ${ligado ? "bg-[#12B85C]" : "bg-[#C9D4CD]"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${ligado ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

/* ── Formatação ─────────────────────────────────────────────────────────── */

export function iniciais(nome: string) {
  return nome.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]?.toUpperCase()).join("") || "?";
}

export function cnpj(valor: string) {
  const d = valor.replace(/\D/g, "");
  if (d.length !== 14) return valor || "—";
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function haQuanto(quando: string | Date | null | undefined) {
  if (!quando) return "—";
  const data = new Date(quando);
  const ms = Date.now() - data.getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && data.getDate() === new Date().getDate()) return h === 1 ? "há 1 hora" : `há ${h} horas`;
  const dias = Math.floor(ms / 86_400_000);
  if (dias <= 1) return "ontem";
  if (dias < 30) return `há ${dias} dias`;
  const meses = Math.floor(dias / 30);
  return meses < 12 ? `há ${meses} ${meses === 1 ? "mês" : "meses"}` : `há ${Math.floor(meses / 12)} ${Math.floor(meses / 12) === 1 ? "ano" : "anos"}`;
}

export function dataCurta(quando: string | Date | null | undefined) {
  if (!quando) return "—";
  return new Date(quando).toLocaleDateString("pt-BR");
}

export function dataHora(quando: string | Date | null | undefined) {
  if (!quando) return "—";
  const d = new Date(quando);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export const SEM_ASSINATURA = "sem fonte: assinaturas chegam na próxima sentada";
