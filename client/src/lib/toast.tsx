import { toast as sonner, useSonner } from "sonner";
import { useEffect, useRef, useState, type ReactNode } from "react";

/*
 * As notificações do painel, nos três modelos do desenho.
 *
 *   29A — o toast escuro compacto, padrão de tudo: ícone, mensagem, fechar.
 *   29E — o desfazer, com o anel de contagem regressiva e o botão "Desfazer".
 *   29J — a pilha: a mais recente na frente, as outras espiando atrás, e o
 *         "+N" na da frente dizendo quantas esperam.
 *
 * O sonner continua sendo o motor (fila, pilha, pausa no hover, teclado);
 * o que muda é o desenho, que passa a ser nosso por `toast.custom`. As
 * chamadas do app não mudam: `toast.success("…")`, `toast.error("…",
 * { description })` continuam valendo — só o import troca de "sonner" para
 * "@/lib/toast".
 */

type Tipo = "success" | "error" | "info" | "warning";
type Opcoes = { description?: ReactNode; duration?: number; id?: string | number };

/* Erro fica mais tempo: é o que a pessoa precisa ler. */
const DURACAO: Record<Tipo, number> = { success: 4000, info: 5000, warning: 6000, error: 7000 };

const traco = (conteudo: ReactNode, tamanho: number, espessura: number, cor: string) => (
  <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke={cor} strokeWidth={espessura} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{conteudo}</svg>
);
const ICONE: Record<Tipo, ReactNode> = {
  success: traco(<path d="M20 6L9 17l-5-5" />, 15, 2.6, "#7EE2A8"),
  info: traco(<><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>, 15, 2.4, "#7EE2A8"),
  warning: traco(<><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></>, 15, 2.4, "#F2C94C"),
  error: traco(<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6" /><path d="M9 9l6 6" /></>, 15, 2.4, "#F4A497"),
};
const CHIP: Record<Tipo, string> = {
  success: "bg-[rgba(126,226,168,.18)]",
  info: "bg-[rgba(126,226,168,.18)]",
  warning: "bg-[rgba(242,201,76,.18)]",
  error: "bg-[rgba(244,164,151,.18)]",
};

const FECHAR = traco(<><path d="M18 6L6 18" /><path d="M6 6l12 12" /></>, 14, 2.2, "#8FB39E");

/*
 * O "+N" da pilha, só na da frente e só quando há alguém atrás.
 *
 * Lido do DOM, não da lista do sonner: o sonner marca o cartão da frente
 * com `data-front` e os que estão saindo com `data-removed`, e é isso que a
 * pessoa vê. A lista interna dele mantém cartões já fechados quando o
 * fechamento é de todos de uma vez, e o número inflava. `useSonner` é o
 * gatilho para reler quando outro chega ou sai; o relógio de um segundo
 * cobre o que expira sozinho, que não avisa ninguém.
 */
function Pilha() {
  const { toasts } = useSonner();
  const marca = useRef<HTMLSpanElement>(null);
  const [estado, setEstado] = useState({ naFrente: false, atras: 0 });
  useEffect(() => {
    const ler = () => {
      const cartao = marca.current?.closest("[data-sonner-toast]");
      const vivos = cartao?.parentElement?.querySelectorAll('[data-sonner-toast]:not([data-removed="true"])');
      setEstado({ naFrente: cartao?.getAttribute("data-front") === "true", atras: (vivos?.length ?? 1) - 1 });
    };
    const tique = window.setTimeout(ler, 0);
    const relogio = window.setInterval(ler, 1000);
    return () => { window.clearTimeout(tique); window.clearInterval(relogio); };
  }, [toasts]);
  return (
    <span ref={marca} className="contents">
      {estado.naFrente && estado.atras > 0 && (
        <span className="toast-pilha shrink-0 rounded-[7px] bg-white/10 px-2 py-1 text-[11px] font-bold text-[#C5DACE]">+{estado.atras}</span>
      )}
    </span>
  );
}

function Fechar({ id }: { id: string | number }) {
  return (
    <button
      type="button"
      aria-label="Fechar"
      onClick={() => sonner.dismiss(id)}
      className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] transition hover:bg-[#1F3D2B]"
    >
      {FECHAR}
    </button>
  );
}

/** 29A — e 29J quando há pilha. */
function Cartao({ id, tipo, titulo, detalhe }: { id: string | number; tipo: Tipo; titulo: ReactNode; detalhe?: ReactNode }) {
  return (
    <div role="status" className="flex w-full items-center gap-3 rounded-[14px] bg-[#0B1F14] px-4 py-3.5 shadow-[0_14px_34px_rgba(6,23,17,.28)] ring-1 ring-white/[.06]">
      <span className={`flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] ${CHIP[tipo]}`}>{ICONE[tipo]}</span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={`text-[13.5px] leading-[1.45] ${detalhe ? "font-bold text-white" : "text-[#EAF4EE]"}`}>{titulo}</span>
        {detalhe && <span className="truncate text-[12px] text-[#8FB39E]">{detalhe}</span>}
      </div>
      <Pilha />
      <Fechar id={id} />
    </div>
  );
}

/*
 * 29E — o desfazer.
 *
 * O tempo é nosso, não do sonner: a duração dele fica infinita e este cartão
 * se fecha sozinho quando o anel acaba. Passar o mouse por cima pausa o anel
 * e o relógio, que é o que o sonner faria com os toasts comuns.
 */
const CIRCUNFERENCIA = 2 * Math.PI * 13;

function Desfazer({ id, titulo, detalhe, duracao, onDesfazer }: {
  id: string | number;
  titulo: ReactNode;
  detalhe?: ReactNode;
  duracao: number;
  onDesfazer: () => void;
}) {
  const [restante, setRestante] = useState(duracao);
  const [pausado, setPausado] = useState(false);
  const fim = useRef(Date.now() + duracao);
  const feito = useRef(false);

  useEffect(() => {
    if (pausado) return;
    fim.current = Date.now() + restante;
    const relogio = window.setInterval(() => {
      const sobra = Math.max(0, fim.current - Date.now());
      setRestante(sobra);
      if (sobra === 0) {
        window.clearInterval(relogio);
        sonner.dismiss(id);
      }
    }, 100);
    return () => window.clearInterval(relogio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pausado]);

  const segundos = Math.max(1, Math.ceil(restante / 1000));
  const progresso = 1 - restante / duracao;

  return (
    <div
      role="status"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      className="flex w-full items-center gap-3 rounded-[14px] bg-[#0B1F14] px-3.5 py-[13px] shadow-[0_14px_34px_rgba(6,23,17,.28)] ring-1 ring-white/[.06]"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="16" cy="16" r="13" fill="none" stroke="#1F3D2B" strokeWidth="3" />
          <circle
            cx="16" cy="16" r="13" fill="none" stroke="#7EE2A8" strokeWidth="3" strokeLinecap="round"
            strokeDasharray={CIRCUNFERENCIA}
            strokeDashoffset={CIRCUNFERENCIA * progresso}
            style={{ transition: "stroke-dashoffset 100ms linear" }}
          />
        </svg>
        <span className="relative text-[11px] font-bold text-[#EAF4EE]">{segundos}</span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[13.5px] font-bold text-white">{titulo}</span>
        {detalhe && <span className="truncate text-[12px] text-[#8FB39E]">{detalhe}</span>}
      </div>
      <Pilha />
      <button
        type="button"
        onClick={() => {
          if (feito.current) return;
          feito.current = true;
          sonner.dismiss(id);
          onDesfazer();
        }}
        className="flex h-[34px] shrink-0 items-center gap-[7px] whitespace-nowrap rounded-[10px] bg-[rgba(126,226,168,.16)] px-[13px] text-[13px] font-bold text-[#7EE2A8] transition hover:bg-[rgba(126,226,168,.26)]"
      >
        {traco(<><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 010 10H9" /></>, 14, 2.4, "#7EE2A8")}
        Desfazer
      </button>
    </div>
  );
}

function mostrar(tipo: Tipo, titulo: ReactNode, opcoes: Opcoes = {}) {
  /*
   * `id` só entra quando existe. O sonner espalha estas opções POR CIMA do id
   * que ele acabou de gerar; um `id: undefined` aqui apagava esse id, o
   * cartão nascia com um número e era guardado com outro, e a pilha nunca
   * reconhecia o cartão da frente.
   */
  const extras: { duration: number; id?: string | number } = { duration: opcoes.duration ?? DURACAO[tipo] };
  if (opcoes.id !== undefined) extras.id = opcoes.id;
  return sonner.custom(id => <Cartao id={id} tipo={tipo} titulo={titulo} detalhe={opcoes.description} />, extras);
}

export const toast = {
  success: (titulo: ReactNode, opcoes?: Opcoes) => mostrar("success", titulo, opcoes),
  error: (titulo: ReactNode, opcoes?: Opcoes) => mostrar("error", titulo, opcoes),
  info: (titulo: ReactNode, opcoes?: Opcoes) => mostrar("info", titulo, opcoes),
  warning: (titulo: ReactNode, opcoes?: Opcoes) => mostrar("warning", titulo, opcoes),
  /**
   * O 29E. `onDesfazer` só é chamado se a pessoa clicar antes de o anel
   * acabar; a ação em si já aconteceu quando o toast aparece.
   */
  desfazer: ({ titulo, detalhe, onDesfazer, duracao = 5000 }: { titulo: ReactNode; detalhe?: ReactNode; onDesfazer: () => void; duracao?: number }) =>
    sonner.custom(id => <Desfazer id={id} titulo={titulo} detalhe={detalhe} duracao={duracao} onDesfazer={onDesfazer} />, { duration: Infinity }),
  dismiss: (id?: string | number) => sonner.dismiss(id),
};

// Só no servidor de desenvolvimento, em localhost: dispara um toast pelo
// console, para ver o desenho sem precisar provocar a ação de verdade.
if (import.meta.env.DEV && ["localhost", "127.0.0.1"].includes(window.location.hostname)) {
  (window as Window & { __toast?: typeof toast; __sonner?: typeof sonner }).__toast = toast;
  (window as Window & { __toast?: typeof toast; __sonner?: typeof sonner }).__sonner = sonner;
}
