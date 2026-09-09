import { CheckIcon } from "@/components/IconlyIcons";

export const PASSOS = ["Empresa", "Conta", "Extrato", "Pronto"] as const;
export type PassoIndice = 0 | 1 | 2 | 3;

/**
 * A faixa de passos do topo.
 *
 * Três estados por passo, como o modelo pede. O rótulo do passo futuro é
 * `#4C6355` e não `#B3BFB7`: em cinza claro ele fica em 1.9:1 de contraste e a
 * informação desaparece justamente para quem mais precisa dela.
 */
export function OnboardingStepper({ atual }: { atual: PassoIndice }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {PASSOS.map((rotulo, indice) => {
        const concluido = indice < atual;
        const ativo = indice === atual;
        return (
          <li key={rotulo} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold ${
                concluido
                  ? "bg-[#12B85C] text-white"
                  : ativo
                    ? "bg-[#0B1F14] text-white"
                    : "border-[1.5px] border-[#E3EBE6] text-[#4C6355]"
              }`}
            >
              {concluido ? <CheckIcon size={13} /> : indice + 1}
            </span>
            <span className={`text-[13px] ${ativo ? "font-bold text-[#0B1F14]" : "text-[#4C6355]"}`}>
              {rotulo}
            </span>
            {indice < PASSOS.length - 1 && (
              <span className={`ml-1 h-[1.5px] w-[22px] ${concluido ? "bg-[#12B85C]" : "bg-[#E3EBE6]"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A moldura de cada passo: faixa em cima, conteúdo no meio, saída embaixo.
 *
 * A saída fica em toda tela de propósito — a promessa da abertura é que dá para
 * configurar depois, e a promessa vale até o último passo.
 */
export function OnboardingShell({ atual, titulo, apoio, children }: {
  atual: PassoIndice;
  titulo: string;
  apoio: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full items-start justify-center bg-[#E9EEEB] p-4 sm:p-8">
      <div className="w-full max-w-[720px] rounded-[24px] bg-white p-6 shadow-[0_18px_44px_rgba(11,31,20,.10)] sm:p-10">
        <OnboardingStepper atual={atual} />

        <h1 className="mt-8 text-[24px] font-bold tracking-[-.02em] text-[#0B1F14] sm:text-[28px]">{titulo}</h1>
        <p className="mt-1.5 max-w-[58ch] text-[13.5px] leading-relaxed text-[#4C6355]">{apoio}</p>

        {/*
          O conteúdo traz o próprio rodapé como último filho: os botões
          dependem do que está acontecendo dentro do passo — se está salvando,
          se falta preencher — e essa informação não sai de lá.
        */}
        <div className="mt-7 flex flex-col gap-5">{children}</div>
      </div>
    </div>
  );
}
