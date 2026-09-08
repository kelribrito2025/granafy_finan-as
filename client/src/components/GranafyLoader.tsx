/**
 * A espera do GranaFy: o anel da marca girando ao lado de um gráfico que se
 * levanta.
 *
 * As barras crescem defasadas em 130ms — é o atraso que faz a onda; sem ele as
 * quatro pulsam juntas e o desenho morre. A animação é `scaleY`, nunca
 * `height`: escala roda na GPU, altura força recálculo de layout a 60 vezes
 * por segundo numa tela que já está ocupada carregando.
 *
 * O bloco é decorativo (`aria-hidden`); quem anuncia o estado é o texto do
 * `label`, dentro de um `role="status"`.
 */
export function GranafyLoader({ label, size = "md", className = "" }: {
  /** O que está sendo esperado. Aparece na tela e é o que o leitor de tela lê. */
  label: string;
  /** `sm` para dentro de listas e cartões pequenos. */
  size?: "sm" | "md";
  className?: string;
}) {
  const pequeno = size === "sm";
  const anel = pequeno ? 20 : 30;
  const alturaBarras = pequeno ? 36 : 56;
  const larguraBarra = pequeno ? 8 : 11;

  return (
    <div role="status" aria-live="polite" className={`flex flex-col items-center justify-center gap-4 ${className}`}>
      <div aria-hidden="true" className="flex items-end gap-[14px]">
        <span className="gf-spin mb-0.5 block">
          <svg width={anel} height={anel} viewBox="0 0 64 64" fill="none">
            <circle className="gf-loader-trilha" cx="32" cy="32" r="23" strokeWidth="11" />
            <path d="M55 32a23 23 0 01-36 19" stroke="#12B85C" strokeWidth="11" strokeLinecap="round" />
            <path className="gf-loader-arco" d="M32 9a23 23 0 0120 12" strokeWidth="11" strokeLinecap="round" />
          </svg>
        </span>
        <div className="flex items-end gap-1.5" style={{ height: alturaBarras }}>
          {[1, 2, 3, 4].map(indice => (
            <span
              key={indice}
              className={`gf-barrinha-${indice} block h-full rounded ${indice % 2 === 1 ? "gf-loader-barra-clara" : "bg-[#12B85C]"}`}
              style={{ width: larguraBarra }}
            />
          ))}
        </div>
      </div>
      <span className={`font-medium text-[#718077] ${pequeno ? "text-[11.5px]" : "text-[12.5px]"}`}>{label}</span>
    </div>
  );
}
