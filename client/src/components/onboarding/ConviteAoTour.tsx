import { CloseIcon, ShowIcon } from "@/components/IconlyIcons";
import { ModalIcon } from "@/components/ModalIcon";
import { useEffect } from "react";

/**
 * O convite ao tour, já dentro do painel.
 *
 * Ficava na abertura do primeiro acesso, ao lado do "Começar", e ali competia
 * com ele: a pessoa tinha que escolher entre configurar e ser apresentada
 * antes de ter visto qualquer tela. Aqui a pergunta faz sentido — o painel já
 * está atrás do modal, com os dados dela, e o tour passa a mostrar telas que
 * ela pode abrir em seguida.
 *
 * Aparece uma vez, na sentada em que o primeiro acesso termina. Depois disso o
 * tour mora na aba "Tour do produto" das Configurações, que é para onde a
 * linha discreta lá embaixo aponta — se o rótulo daquela aba mudar, o texto
 * daqui muda junto, senão a promessa manda a pessoa para um lugar que não
 * existe.
 */
export function ConviteAoTour({ onTour, onExplorar }: {
  onTour: () => void;
  onExplorar: () => void;
}) {
  /* Esc fecha, como em qualquer outro modal do sistema. */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onExplorar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [onExplorar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="convite-tour-titulo"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#07150d]/55 p-4 backdrop-blur-[3px]"
      onMouseDown={evento => evento.target === evento.currentTarget && onExplorar()}
    >
      <div className="modal-enter w-full max-w-[476px] rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.18)] sm:p-7">
        <div className="flex items-start gap-3">
          <ModalIcon icon={ShowIcon} />
          <div className="min-w-0 flex-1">
            <h2 id="convite-tour-titulo" className="text-[19px] font-bold leading-snug tracking-[-.01em] text-[#0B1F14]">
              Quer conhecer rapidamente os principais recursos?
            </h2>
          </div>
          <button
            type="button"
            onClick={onExplorar}
            aria-label="Fechar"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#8A968D] transition hover:bg-[#F1F4F2] hover:text-[#0B1F14]"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-[#28382E]">
          Em 90 segundos, mostraremos onde acompanhar seu caixa, organizar lançamentos,
          conciliar contas e analisar seus resultados. Você poderá rever este tour quando quiser.
        </p>

        {/* A promessa do "depois", e ela tem que continuar verdadeira: este
            texto e o rótulo da aba em SettingsPage são as mesmas palavras de
            propósito. */}
        <p className="mt-3 text-[12px] text-[#8A968D]">
          Disponível depois em Configurações → Tour do produto.
        </p>

        <div className="mt-6 flex flex-col gap-2.5 sm:flex-row">
          <button
            type="button"
            onClick={onTour}
            className="h-[46px] flex-[1.3] rounded-[12px] bg-[#12B85C] text-[13.5px] font-bold text-white transition hover:bg-[#0F9E4E]"
          >
            Iniciar tour
          </button>
          <button
            type="button"
            onClick={onExplorar}
            className="h-[46px] flex-1 rounded-[12px] border border-[#E3EBE6] text-[13.5px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9]"
          >
            Ir para o painel
          </button>
        </div>
      </div>
    </div>
  );
}
