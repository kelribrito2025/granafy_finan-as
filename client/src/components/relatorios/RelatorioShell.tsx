import { AppSidebar } from "@/components/AppSidebar";
import { ChevronRightIcon, DownloadIcon, SidebarMenuIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { PageIcon } from "@/components/PageIcon";
import { ProfileMenu } from "@/components/ProfileMenu";
import { toast } from "@/lib/toast";
import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";

/*
 * A casca comum das telas de Relatórios: barra lateral, título,
 * seletor de janela (6 meses · 12 meses · Ano), navegador de mês e Exportar.
 *
 * Enquanto os dados são de amostra, a exportação só avisa. A janela e o mês
 * ficam em estado local para a tela responder ao clique; quando o back entrar,
 * eles viram os parâmetros da consulta.
 */

export type Janela = "6m" | "12m" | "ano";
export const JANELAS: Array<[Janela, string]> = [["6m", "6 meses"], ["12m", "12 meses"], ["ano", "Ano"]];

export const toolButton = "flex h-10 w-10 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40";

export function RelatorioShell({ icone, titulo, subtitulo, vazio, janela, onJanela, mes, onMes, rodape, children }: {
  icone: IconlyIcon;
  titulo: string;
  subtitulo: string;
  /** Sem dados: controles ficam esmaecidos e sem clique, como no protótipo. */
  vazio: boolean;
  janela?: Janela;
  onJanela?: (janela: Janela) => void;
  mes?: string;
  onMes?: (passo: -1 | 1) => void;
  rodape: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const desligado = vazio ? "pointer-events-none opacity-50" : "";

  return (
    <main className="min-h-screen w-full bg-[#EFF4F1] text-[#0B1F14]">
      <div className="flex min-h-screen w-full gap-5 p-3 sm:p-5">
        <AppSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

        <section className="flex min-w-0 flex-1 flex-col gap-5">

          <header className="flex flex-wrap items-center gap-2.5">
            <button type="button" aria-label="Abrir menu" onClick={() => setMobileOpen(true)} className={`${toolButton} xl:hidden`}><SidebarMenuIcon size={18} /></button>
            <PageIcon icon={icone} />
            <div className="mr-auto">
              <h1 className="text-[24px] font-bold tracking-[-.02em]">{titulo}</h1>
              <p className={`mt-0.5 text-[12.5px] ${vazio ? "text-[#8A968D]" : "text-[#4C6355]"}`}>{subtitulo}</p>
            </div>

            {janela && onJanela && (
              <div className={`flex h-10 items-stretch overflow-hidden rounded-[12px] bg-white ring-1 ring-[#DFE6E1] ${desligado}`}>
                {JANELAS.map(([valor, rotulo]) => (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => onJanela(valor)}
                    aria-pressed={janela === valor}
                    className={`px-4 text-[13px] transition ${janela === valor ? "bg-[#12B85C] font-bold text-white" : "text-[#4C6355] hover:bg-[#F1F4F2]"}`}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>
            )}

            {mes && onMes && (
              <div className={`flex items-center gap-1.5 ${desligado}`}>
                <button type="button" aria-label="Mês anterior" onClick={() => onMes(-1)} className={toolButton}><ChevronRightIcon size={15} className="rotate-180" /></button>
                <div className="flex h-10 min-w-[120px] items-center justify-center rounded-[12px] bg-white px-4 text-[13px] font-bold ring-1 ring-[#DFE6E1]">{mes}</div>
                <button type="button" aria-label="Próximo mês" onClick={() => onMes(1)} className={toolButton}><ChevronRightIcon size={15} /></button>
              </div>
            )}

            <button
              type="button"
              aria-label="Exportar"
              title="Exportar"
              disabled={vazio}
              onClick={() => toast.info("A exportação entra junto com os dados reais.")}
              className={toolButton}
            >
              <DownloadIcon size={17} />
            </button>
            <ProfileMenu />
          </header>

          {children}

          <p className="text-[12.5px] leading-relaxed text-[#8A968D]">{rodape}</p>
        </section>
      </div>
    </main>
  );
}

/** Um cartão de indicador: rótulo em caixa alta, número grande, linha de apoio. */
export function Kpi({ rotulo, valor, apoio, tom = "neutro", vazio = false }: {
  rotulo: string;
  valor: string;
  apoio?: string;
  tom?: "neutro" | "positivo" | "negativo";
  vazio?: boolean;
}) {
  const cor = vazio ? "text-[#B3BFB7]" : tom === "positivo" ? "text-[#0A7A42]" : tom === "negativo" ? "text-[#B3261E]" : "text-[#0B1F14]";
  return (
    <article className="flex flex-col gap-2 rounded-[20px] bg-white p-[22px] ring-1 ring-[#E1E8E3]">
      <span className={`text-[11px] font-semibold uppercase tracking-[.08em] ${vazio ? "text-[#8A968D]" : "text-[#4C6355]"}`}>{rotulo}</span>
      <span className={`text-[24px] font-bold tracking-[-.02em] ${cor}`}>{vazio ? "—" : valor}</span>
      {vazio ? <span className="h-2 w-[58%] rounded-full bg-[#F1F4F2]" /> : apoio && <span className="text-[12.5px] text-[#4C6355]">{apoio}</span>}
    </article>
  );
}

/** Os três passos do estado vazio, iguais em todas as telas de relatório. */
export function EstadoVazioRelatorio({ ilustracao, titulo, texto, acaoPrincipal, onAcaoPrincipal, mostrarAcoes }: {
  ilustracao: ReactNode;
  titulo: string;
  texto: string;
  acaoPrincipal: string;
  onAcaoPrincipal: () => void;
  /** O contador não cadastra nem importa: sem botões para ele. */
  mostrarAcoes: boolean;
}) {
  const [, setLocation] = useLocation();
  return (
    <section className="flex flex-1 flex-col items-center gap-7 rounded-[20px] bg-white px-6 py-14 text-center ring-1 ring-[#E1E8E3] sm:px-10">
      <div className="relative flex h-28 w-28 items-center justify-center">
        <span className="absolute inset-0 rounded-[36px] bg-[#F1FBF6]" />
        {ilustracao}
      </div>
      <div className="flex max-w-[540px] flex-col gap-2">
        <h2 className="text-[22px] font-bold tracking-[-.02em]">{titulo}</h2>
        <p className="text-[14px] leading-relaxed text-[#4C6355]">{texto}</p>
      </div>
      {mostrarAcoes && (
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={onAcaoPrincipal} className="flex h-12 items-center gap-2 rounded-[12px] bg-[#12B85C] px-[22px] text-[14px] font-bold text-white transition hover:bg-[#0F9E4E]">
            <span className="text-[18px] leading-none">+</span>{acaoPrincipal}
          </button>
          <button type="button" onClick={() => setLocation("/lancamentos?importar=extrato")} className="flex h-12 items-center gap-2 rounded-[12px] border border-[#E3EBE6] bg-white px-[22px] text-[14px] font-semibold text-[#28382E] transition hover:bg-[#F8FAF9]">
            Importar extrato OFX ou CSV
          </button>
        </div>
      )}
      <div className="grid w-full max-w-[820px] gap-3.5 border-t border-[#F1F4F2] pt-4 sm:grid-cols-3">
        {[
          ["Passo 1", "Cadastre suas contas", "Cada conta bancária vira uma linha nos relatórios por conta."],
          ["Passo 2", "Registre as movimentações", "Entradas e saídas classificadas alimentam todos os gráficos."],
          ["Passo 3", "Acompanhe o consolidado", "Compare meses, exporte em PDF e veja o peso de cada conta."],
        ].map(([passo, titulo, texto]) => (
          <div key={passo} className="flex flex-col items-start gap-2 rounded-[16px] bg-[#F8FAF9] p-[18px] text-left">
            <span className="text-[11px] font-bold uppercase tracking-[.08em] text-[#8A968D]">{passo}</span>
            <span className="text-[14px] font-bold">{titulo}</span>
            <span className="text-[12.5px] leading-relaxed text-[#4C6355]">{texto}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** As barrinhas subindo, do protótipo, para o meio do estado vazio. */
export function IlustracaoBarras() {
  return (
    <>
      <span className="absolute bottom-[30px] left-5 flex h-[52px] items-end gap-1.5">
        <span className="h-[22px] w-[13px] rounded-t bg-[#DCE5DF]" /><span className="h-[34px] w-[13px] rounded-t bg-[#B9C7BE]" /><span className="h-[44px] w-[13px] rounded-t bg-[#7EE2A8]" /><span className="h-[52px] w-[13px] rounded-t bg-[#12B85C]" />
      </span>
      <span className="absolute bottom-3 left-1/2 flex h-[34px] w-[34px] -translate-x-1/2 items-center justify-center rounded-full bg-[#12B85C] shadow-[0_6px_16px_rgba(18,184,92,.35)]">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6"><path d="M22 7l-8.5 8.5-5-5L2 17" /><polyline points="16 7 22 7 22 13" /></svg>
      </span>
    </>
  );
}

export const dinheiro = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
export const numero = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(v);
export const mil = (v: number) => `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v / 1000)} mil`;
