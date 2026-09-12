import { Hint } from "@/components/Hint";
import { usePrivacy } from "@/contexts/PrivacyContext";

/**
 * O olhinho: esconde e mostra os valores de TODAS as telas.
 *
 * Morava no cabeçalho de cada página, ao lado de "Novo lançamento" — dez
 * cópias de um botão que muda um estado global. Agora mora num lugar só: o
 * cartão "Caixa disponível" da Visão geral, que é o número mais sensível do
 * produto e o primeiro que alguém quer esconder quando abre a tela na frente
 * de outra pessoa. O estado é o mesmo `usePrivacy`, então esconder ali
 * esconde em toda parte.
 *
 * `onDark` é o tom para dentro desse cartão, que é escuro.
 */
export function HideValuesButton({ className = "", tone = "light" }: { className?: string; tone?: "light" | "onDark" }) {
  const { hidden, toggle } = usePrivacy();
  const label = hidden ? "Mostrar valores" : "Ocultar valores";
  const escuro = tone === "onDark";

  return (
    <Hint label={label} className={className}>
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={hidden}
      className={escuro
        ? "flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-[#C5DACE] transition hover:bg-white/20 hover:text-white active:scale-95"
        : "flex h-11 w-11 items-center justify-center rounded-[12px] bg-white text-[#4C6355] ring-1 ring-[#DFE6E1] transition hover:bg-[#F1FBF6] hover:text-[#0A7A42] active:scale-95"}
    >
      <svg width={escuro ? 15 : 18} height={escuro ? 15 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        {hidden ? (
          <>
            <path d="M9.9 4.24A9.1 9.1 0 0112 4c7 0 10 8 10 8a18.5 18.5 0 01-2.16 3.19" />
            <path d="M6.61 6.61A18.2 18.2 0 002 12s3 8 10 8a9.7 9.7 0 005.39-1.61" />
            <path d="M14.12 14.12a3 3 0 11-4.24-4.24" />
            <path d="M2 2l20 20" />
          </>
        ) : (
          <>
            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8z" />
            <circle cx="12" cy="12" r="3" />
          </>
        )}
      </svg>
    </button>
    </Hint>
  );
}
