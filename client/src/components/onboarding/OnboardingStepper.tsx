import { GranafyLogo } from "@/components/GranafyLogo";
import { CheckIcon } from "@/components/IconlyIcons";
import { createContext, useContext, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/*
 * O rodapé é uma barra fixa da moldura, mas os botões pertencem ao passo.
 *
 * Quem sabe se está salvando, se falta preencher ou se o rótulo é "Continuar"
 * ou "Importar 142 movimentações" é o passo, não a moldura. Em vez de subir
 * esse estado — que faria a moldura conhecer o miolo de cada um —, o passo
 * desenha o rodapé onde está e o portal o coloca na barra.
 */
const RodapeSlot = createContext<HTMLElement | null>(null);

export function OnboardingRodape({ children }: { children: ReactNode }) {
  const destino = useContext(RodapeSlot);
  if (!destino) return null;
  return createPortal(children, destino);
}

export const PASSOS = ["Empresa", "Conta", "Extrato", "Pronto"] as const;
export type PassoIndice = 0 | 1 | 2 | 3;

/**
 * A faixa de passos, agora na barra do topo.
 *
 * Três estados por passo. O rótulo do passo futuro é `#4C6355` e não
 * `#B3BFB7`: em cinza claro ele fica em 1.9:1 de contraste e a informação
 * desaparece justamente para quem mais precisa dela.
 */
export function OnboardingStepper({ atual }: { atual: PassoIndice }) {
  return (
    <ol className="flex items-center gap-2">
      {PASSOS.map((rotulo, indice) => {
        const concluido = indice < atual;
        const ativo = indice === atual;
        return (
          <li key={rotulo} className="flex items-center gap-2">
            <span
              className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                concluido
                  ? "bg-[#12B85C] text-white"
                  : ativo
                    ? "bg-[#0B1F14] text-white"
                    : "border-[1.5px] border-[#E3EBE6] text-[#4C6355]"
              }`}
            >
              {concluido ? <CheckIcon size={12} /> : indice + 1}
            </span>
            {/* O rótulo some no celular: quatro palavras não cabem ao lado do
                logo, e as bolinhas sozinhas já dizem onde a pessoa está. */}
            <span className={`hidden text-[12.5px] sm:inline ${ativo ? "font-bold text-[#0B1F14]" : "text-[#4C6355]"}`}>
              {rotulo}
            </span>
            {indice < PASSOS.length - 1 && (
              <span className={`ml-1 hidden h-[1.5px] w-[22px] sm:inline-block ${concluido ? "bg-[#12B85C]" : "bg-[#E3EBE6]"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A moldura do primeiro acesso: tela cheia, não caixa no meio.
 *
 * Quem acabou de entrar não tem painel atrás para voltar, e uma caixa
 * flutuando sobre um fundo vazio sugere que existe algo por baixo — sugere
 * errado, e ainda encolhe o espaço de uma tela que precisa de duas colunas.
 *
 * Barra em cima com logo, passos e a saída; conteúdo no meio, com o formulário
 * à esquerda e o apoio à direita; barra embaixo com a dica de um lado e a ação
 * do outro.
 */
export function OnboardingShell({ atual, titulo, apoio, children, lateral, dica, onSair, sairPending }: {
  atual: PassoIndice;
  titulo: string;
  apoio: string;
  children: ReactNode;
  /** A coluna de apoio da direita. Sem ela o conteúdo ocupa a largura toda. */
  lateral?: ReactNode;
  /** O texto pequeno do canto esquerdo do rodapé. */
  dica?: string;
  onSair: () => void;
  sairPending: boolean;
}) {
  const [rodapeNode, setRodapeNode] = useState<HTMLElement | null>(null);

  return (
    <div className="flex min-h-screen w-full flex-col bg-white">
      <header className="flex items-center gap-4 border-b border-[#E3EBE6] px-5 py-4 sm:px-8">
        <GranafyLogo size={30} />
        <div className="ml-auto flex items-center gap-4">
          <OnboardingStepper atual={atual} />
          {/* A saída acompanha todo passo: a promessa da abertura é que dá para
              configurar depois, e ela vale até o último. */}
          <button
            type="button"
            onClick={onSair}
            disabled={sairPending}
            className="text-[13px] text-[#8A968D] transition hover:text-[#0B1F14] disabled:opacity-50"
          >
            {sairPending ? "Abrindo…" : "Sair"}
          </button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-1 flex-col px-5 py-10 sm:px-8 sm:py-14">
        <span className="text-[11px] font-semibold uppercase tracking-[.1em] text-[#0A7A42]">
          Passo {atual + 1} de {PASSOS.length}
        </span>
        <h1 className="mt-2 max-w-[22ch] text-[26px] font-bold leading-tight tracking-[-.025em] text-[#0B1F14] sm:text-[30px]">
          {titulo}
        </h1>
        <p className="mt-2.5 max-w-[62ch] text-[13.5px] leading-relaxed text-[#4C6355]">{apoio}</p>

        {/* Duas colunas a partir do desktop; empilhadas no celular, com o apoio
            depois do formulário — quem preenche no telefone quer o campo
            primeiro. */}
        <RodapeSlot.Provider value={rodapeNode}>
          <div className={`mt-9 grid flex-1 items-start gap-8 ${lateral ? "lg:grid-cols-[minmax(0,1fr)_320px]" : ""}`}>
            <div className="flex min-w-0 flex-col gap-5">{children}</div>
            {lateral && <aside className="flex flex-col gap-4">{lateral}</aside>}
          </div>
        </RodapeSlot.Provider>
      </main>

      <footer className="border-t border-[#E3EBE6] px-5 py-4 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center gap-3">
          {dica && <span className="text-[12.5px] text-[#8A968D]">{dica}</span>}
          <div ref={setRodapeNode} className="ml-auto flex flex-wrap items-center gap-2.5" />
        </div>
      </footer>
    </div>
  );
}
