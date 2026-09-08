import type { ReactNode } from "react";

/**
 * O fundo do cartão de destaque: camadas de verde e água sobre base escura.
 *
 * Mora aqui, num lugar só, porque a mesma superfície aparece no primeiro
 * cartão de cada página. Copiada em quatro arquivos, uma alteração de tom
 * acabaria aplicada em três.
 */
export const AURORA_BACKGROUND = [
  "radial-gradient(135% 115% at 88% -12%, rgba(18,184,92,.58) 0%, rgba(18,184,92,.18) 44%, rgba(18,184,92,0) 70%)",
  "radial-gradient(120% 100% at 4% 106%, rgba(13,148,136,.34) 0%, rgba(13,148,136,0) 62%)",
  "radial-gradient(85% 60% at 66% 34%, rgba(126,226,168,.16) 0%, rgba(126,226,168,0) 62%)",
  "linear-gradient(158deg, #0D2A1B 0%, #08190F 58%, #06120B 100%)",
].join(", ");

/**
 * Superfície escura com o gradiente aurora; o conteúdo vai por cima.
 *
 * O `data-theme-origin` é o ponto de onde o modo escuro se abre em círculo: é
 * o único bloco que já é escuro no tema claro, então a troca parece nascer
 * dele em vez de piscar a tela inteira.
 */
export function AuroraSurface({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <div data-theme-origin="" className={`relative isolate overflow-hidden bg-[#06120B] text-white ${className}`}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ background: AURORA_BACKGROUND }} />
      <div className="relative z-10 flex h-full flex-col">{children}</div>
    </div>
  );
}
