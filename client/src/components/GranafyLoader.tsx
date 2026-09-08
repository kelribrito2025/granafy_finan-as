/*
 * A espera do GranaFy, em três peças.
 *
 * `GranafyRing` é o anel da marca girando; `GranafyBars`, o gráfico que se
 * levanta. Os dois juntos, com um rótulo, formam o `GranafyLoader` das telas
 * que ainda não têm nada para mostrar.
 *
 * Separados porque a espera de um cartão não é a de uma página: onde falta só
 * o número, o anel entra no lugar dele e a moldura do cartão continua na
 * tela; onde falta o gráfico, entram as barras. Trocar a página inteira por
 * um loader a cada consulta faz o layout piscar.
 *
 * As barras crescem defasadas em 130ms — é o atraso que faz a onda; juntas,
 * as quatro só piscam. A animação é `scaleY`, nunca `height`: escala roda na
 * GPU, altura recalcula layout 60 vezes por segundo numa tela já ocupada.
 */

/** O anel sozinho. Bom no lugar de um valor, dentro de um cartão. */
export function GranafyRing({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={`gf-spin inline-block shrink-0 ${className}`}
      /*
       * Largura e altura explícitas: como item de uma coluna flex o anel
       * esticaria até a largura do cartão, e girar uma caixa de 230px varre
       * meia tela.
       */
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
        <circle className="gf-loader-trilha" cx="32" cy="32" r="23" strokeWidth="11" />
        <path d="M55 32a23 23 0 01-36 19" stroke="#12B85C" strokeWidth="11" strokeLinecap="round" />
        <path className="gf-loader-arco" d="M32 9a23 23 0 0120 12" strokeWidth="11" strokeLinecap="round" />
      </svg>
    </span>
  );
}

/** As barras sozinhas. Ficam onde vai aparecer um gráfico. */
export function GranafyBars({ height = 56, barWidth = 11, className = "" }: {
  height?: number;
  barWidth?: number;
  className?: string;
}) {
  return (
    <span role="status" aria-label="Carregando" className={`inline-flex items-end gap-1.5 ${className}`} style={{ height }}>
      {[1, 2, 3, 4].map(indice => (
        <span
          key={indice}
          aria-hidden="true"
          className={`gf-barrinha-${indice} block h-full rounded ${indice % 2 === 1 ? "gf-loader-barra-clara" : "bg-[#12B85C]"}`}
          style={{ width: barWidth }}
        />
      ))}
    </span>
  );
}

/**
 * A espera de uma tela inteira: os dois desenhos e o que está sendo esperado.
 *
 * O bloco é decorativo; quem anuncia o estado é o texto do `label`.
 */
export function GranafyLoader({ label, size = "md", className = "" }: {
  /** O que está sendo esperado. Aparece na tela e é o que o leitor de tela lê. */
  label: string;
  /** `sm` para dentro de listas e cartões pequenos. */
  size?: "sm" | "md";
  className?: string;
}) {
  const pequeno = size === "sm";

  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div aria-hidden="true" className="flex items-end gap-[14px]">
        <GranafyRing size={pequeno ? 20 : 30} className="mb-0.5" />
        <GranafyBars height={pequeno ? 36 : 56} barWidth={pequeno ? 8 : 11} />
      </div>
      <span className={`font-medium text-[#718077] ${pequeno ? "text-[11.5px]" : "text-[12.5px]"}`}>{label}</span>
    </div>
  );
}
