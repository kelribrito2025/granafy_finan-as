type LogoTone = "auto" | "onDark";

/**
 * O anel de saldo. O traço é 9/64 do diâmetro e os arcos têm proporção fixa —
 * o manual da marca pede para nunca afinar nem trocar a ordem deles.
 *
 * `tone="auto"` segue o tema da página; `tone="onDark"` força a versão negativa
 * para os blocos que são escuros nos dois temas.
 */
export function GranafySymbol({ size = 36, tone = "auto", className = "" }: {
  size?: number;
  tone?: LogoTone;
  className?: string;
}) {
  const track = tone === "onDark" ? "stroke-[#1F3D2B]" : "stroke-[#D8E2DB] dark:stroke-[#1F3D2B]";
  const ink = tone === "onDark" ? "stroke-white" : "stroke-[#0B1F14] dark:stroke-white";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <circle cx="32" cy="32" r="23" strokeWidth="9" className={track} />
      <path d="M55 32a23 23 0 01-36 19" strokeWidth="9" strokeLinecap="round" className="stroke-[#12B85C]" />
      <path d="M32 9a23 23 0 0120 12" strokeWidth="9" strokeLinecap="round" className={ink} />
    </svg>
  );
}

/** "GranaFy" com o "Fy" no verde da marca, como no arquivo oficial. */
export function GranafyWordmark({ tone = "auto", className = "", style }: {
  tone?: LogoTone;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span style={style} className={`font-bold tracking-[-0.035em] ${tone === "onDark" ? "text-white" : "text-[#0B1F14]"} ${className}`}>
      Grana<span className={tone === "onDark" ? "text-[#7EE2A8]" : "text-[#12B85C]"}>Fy</span>
    </span>
  );
}

/** Assinatura completa: símbolo, nome e, opcionalmente, a empresa embaixo. */
export function GranafyLogo({ size = 36, tone = "auto", subtitle, nameSize, className = "" }: {
  size?: number;
  tone?: LogoTone;
  subtitle?: string;
  /** Tamanho do nome. Sem isto ele acompanha o símbolo, na proporção do manual. */
  nameSize?: number;
  className?: string;
}) {
  // O nome cresce junto com o símbolo: 17px para o símbolo de 36 é a proporção
  // do arquivo oficial, e travá-lo fazia a assinatura grande parecer desmontada.
  const wordmarkSize = nameSize ?? Math.round((size * 17) / 36);
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <GranafySymbol size={size} tone={tone} className="shrink-0" />
      <div className="min-w-0">
        <GranafyWordmark tone={tone} className="block truncate leading-none" style={{ fontSize: wordmarkSize }} />
        {subtitle && (
          <span className={`mt-1 block truncate text-[11px] ${tone === "onDark" ? "text-[#8FB39E]" : "text-[#8A968D]"}`}>
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
