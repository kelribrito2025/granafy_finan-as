import { DeleteIcon, type IconlyIcon } from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { useEffect, useRef, type ReactNode } from "react";

/*
 * A pergunta antes de apagar, no desenho do produto.
 *
 * Eram sete `window.confirm` espalhados por três telas. O popup do navegador
 * não é só feio: ele trava a aba inteira, ignora o tema, escreve o endereço
 * do site em cima da pergunta e não tem como mostrar o que vai acontecer com
 * o dado ao redor — que é justamente o que a pessoa precisa saber antes de
 * dizer sim.
 *
 * O foco começa em CANCELAR, não em confirmar. Um Enter no reflexo tem que
 * cair na saída, não na exclusão.
 */
export function ModalDeConfirmacao({
  titulo,
  texto,
  rotuloConfirmar = "Excluir",
  icone = DeleteIcon,
  pendente = false,
  onCancelar,
  onConfirmar,
}: {
  titulo: string;
  texto: ReactNode;
  rotuloConfirmar?: string;
  icone?: IconlyIcon;
  pendente?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
}) {
  const cancelar = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelar.current?.focus();
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onCancelar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirmacao-titulo"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#07150d]/45 p-4 backdrop-blur-[3px]"
      onMouseDown={evento => evento.target === evento.currentTarget && onCancelar()}
    >
      <div className="modal-enter w-full max-w-[420px] rounded-[20px] bg-white p-6 text-[#0B1F14] shadow-[0_20px_50px_rgba(11,31,20,.16)]">
        <div className="flex items-start gap-3">
          <ModalIcon icon={icone} tom="perigo" />
          <div className="min-w-0">
            <h2 id="confirmacao-titulo" className="text-[18px] font-bold tracking-[-.01em]">{titulo}</h2>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A968D]">{texto}</p>
          </div>
        </div>
        <div className="mt-5 flex gap-2.5">
          <button
            ref={cancelar}
            type="button"
            onClick={onCancelar}
            disabled={pendente}
            className="h-11 flex-1 rounded-[12px] bg-[#F1F4F2] text-[13px] font-bold text-[#4C6355] transition hover:bg-[#E7ECE9] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            disabled={pendente}
            className="h-11 flex-[1.2] rounded-[12px] bg-[#B3261E] text-[13px] font-bold text-white transition hover:bg-[#8E1F16] disabled:opacity-50"
          >
            {pendente ? "Excluindo…" : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}
