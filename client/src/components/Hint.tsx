import type { ReactNode } from "react";

/*
 * O balão verde que explica um botão de ícone.
 *
 * Antes existiam três mecanismos ao mesmo tempo: o balão do menu recolhido,
 * escrito à mão; o Tooltip do Radix, de fundo escuro; e o `title` nativo, que é
 * cinza, demora quase um segundo e não parece parte do produto. O resultado é
 * que vários botões pareciam não ter dica nenhuma.
 *
 * Este é o do menu recolhido, extraído para valer em qualquer lugar. Sem
 * biblioteca e sem estado: é `group-hover` puro, como já era no menu, o que
 * mantém o custo em zero numa lista de milhares de linhas.
 */

type Placement = "top" | "bottom" | "left" | "right";

const BALAO: Record<Placement, string> = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
  left: "right-full top-1/2 mr-2 -translate-y-1/2",
  right: "left-full top-1/2 ml-2 -translate-y-1/2",
};

/** A pontinha aponta de volta para o botão. */
const SETA: Record<Placement, string> = {
  top: "left-1/2 top-full -mt-1 -ml-1",
  bottom: "left-1/2 bottom-full -mb-1 -ml-1",
  left: "top-1/2 left-full -ml-1 -mt-1",
  right: "top-1/2 right-full -mr-1 -mt-1",
};

export function Hint({ label, placement = "bottom", children, className = "" }: {
  label: string;
  placement?: Placement;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      {/*
        `focus-within` junto do hover: quem navega por teclado chega ao botão
        pelo Tab e precisa da mesma dica que aparece no mouse.

        O balão não recebe clique — sem isto ele fica entre o cursor e o botão
        no `placement` de cima, e o próprio botão para de responder.
      */}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-[90] whitespace-nowrap rounded-[9px] bg-[#12B85C] px-[11px] py-[7px] text-[12.5px] font-semibold text-white opacity-0 shadow-[0_8px_22px_rgba(11,31,20,.22)] transition-opacity duration-[90ms] group-hover:opacity-100 group-focus-within:opacity-100 ${BALAO[placement]}`}
      >
        {label}
        <span className={`absolute h-2 w-2 rotate-45 bg-[#12B85C] ${SETA[placement]}`} />
      </span>
    </span>
  );
}
