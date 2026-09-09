import {
  ArrowsUpDownIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  DashboardIcon,
  DocumentIcon,
  ReportIcon,
  type IconlyIcon,
} from "@/components/IconlyIcons";
import { useEffect, useState } from "react";

/*
 * O tour de 90 segundos.
 *
 * O modelo prometia vídeo. Cinco lâminas estáticas dizem a mesma coisa, não
 * dependem de hospedagem nem de conexão boa, e envelhecem junto com o produto
 * — um vídeo gravado hoje mostra a tela de hoje para sempre.
 *
 * Cada lâmina nomeia a seção do menu onde a tela mora, porque é assim que a
 * pessoa vai procurá-la depois.
 */
const LAMINAS: Array<{ secao: string; titulo: string; icone: IconlyIcon; frase: string }> = [
  {
    secao: "Painel",
    titulo: "Visão geral",
    icone: DashboardIcon,
    frase: "O resumo do mês: quanto entrou, quanto saiu, o que está em aberto e o caixa que você tem agora.",
  },
  {
    secao: "Movimentações",
    titulo: "Lançamentos",
    icone: DocumentIcon,
    frase: "O extrato completo, para filtrar, corrigir categoria e exportar o que o contador pedir.",
  },
  {
    secao: "Movimentações",
    titulo: "Pagas e recebidas",
    icone: ArrowsUpDownIcon,
    frase: "Só o que já foi liquidado, pelo dia em que o dinheiro andou — um boleto vencido em agosto e pago em setembro aparece em setembro.",
  },
  {
    secao: "Movimentações",
    titulo: "Conciliação",
    icone: CheckIcon,
    frase: "O extrato do banco de um lado, os seus lançamentos do outro. É aqui que uma diferença de saldo aparece.",
  },
  {
    secao: "Análise",
    titulo: "DRE",
    icone: ReportIcon,
    frase: "O resultado do período, linha a linha. Ele só fica correto depois que as movimentações estão classificadas.",
  },
];

export function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [indice, setIndice] = useState(0);
  const lamina = LAMINAS[indice];
  const ultima = indice === LAMINAS.length - 1;

  /* Esc fecha, como em qualquer outro modal do sistema. */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") onClose();
      if (evento.key === "ArrowRight" && !ultima) setIndice(atual => atual + 1);
      if (evento.key === "ArrowLeft" && indice > 0) setIndice(atual => atual - 1);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [indice, onClose, ultima]);

  const Icone = lamina.icone;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-titulo"
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[#07150d]/55 p-4 backdrop-blur-[3px]"
      onMouseDown={evento => evento.target === evento.currentTarget && onClose()}
    >
      <div className="modal-enter w-full max-w-[520px] rounded-[20px] bg-white p-6 shadow-[0_20px_50px_rgba(11,31,20,.18)] sm:p-8">
        <div className="flex items-start gap-3">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-[#DFF6EA] text-[#0A7A42]">
            <Icone size={19} />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10.5px] font-semibold uppercase tracking-[.1em] text-[#8A968D]">
              {lamina.secao}
            </span>
            <h2 id="tour-titulo" className="text-[19px] font-bold tracking-[-.01em] text-[#0B1F14]">
              {lamina.titulo}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar o tour"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[#8A968D] transition hover:bg-[#F1F4F2] hover:text-[#0B1F14]"
          >
            <CloseIcon size={16} />
          </button>
        </div>

        <p className="mt-4 text-[14px] leading-relaxed text-[#28382E]">{lamina.frase}</p>

        <div className="mt-7 flex items-center gap-2.5">
          {/* Bolinhas: a posição no tour, e dá para pular direto. */}
          <div className="flex items-center gap-1.5">
            {LAMINAS.map((item, posicao) => (
              <button
                key={item.titulo}
                type="button"
                onClick={() => setIndice(posicao)}
                aria-label={`Ir para ${item.titulo}`}
                aria-current={posicao === indice}
                className={`h-2 rounded-full transition-all ${posicao === indice ? "w-5 bg-[#12B85C]" : "w-2 bg-[#DFE6E1] hover:bg-[#B9C7BE]"}`}
              />
            ))}
          </div>

          <span className="ml-1 text-[12px] text-[#8A968D]">{indice + 1} de {LAMINAS.length}</span>

          <button
            type="button"
            onClick={() => setIndice(atual => atual - 1)}
            disabled={indice === 0}
            className="ml-auto h-[42px] rounded-[12px] border border-[#E3EBE6] px-4 text-[13px] font-semibold text-[#4C6355] transition hover:bg-[#F8FAF9] disabled:opacity-40"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => (ultima ? onClose() : setIndice(atual => atual + 1))}
            className="flex h-[42px] items-center gap-1.5 rounded-[12px] bg-[#12B85C] px-5 text-[13px] font-bold text-white transition hover:bg-[#0F9E4E]"
          >
            {ultima ? "Voltar ao começo" : "Avançar"}
            {!ultima && <ChevronRightIcon size={14} />}
          </button>
        </div>
      </div>
    </div>
  );
}
