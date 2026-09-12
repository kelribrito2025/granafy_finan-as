import type { ReactNode } from "react";

/*
 * O vazio de DENTRO de um cartão.
 *
 * A tela toda sem nada tem a sua própria peça (VisaoGeralVazia, FluxoVazio,
 * DreVazia...). Esta aqui é o caso do meio, que é o mais comum depois do
 * primeiro dia: a empresa já existe, a conta já está cadastrada, e um cartão
 * específico ainda não tem o que mostrar. Antes cada um resolvia sozinho —
 * um parágrafo cinza aqui, uma linha de zeros ali — e o resultado era a tela
 * voltar ao visual antigo assim que a primeira conta era criada.
 *
 * Uma peça só, usada nos dois caminhos: o mesmo desenho aparece na tela
 * inteira vazia e no cartão isolado, e nenhum dos dois pode mais mudar
 * sozinho.
 */
export function CartaoVazio({ icone, titulo, texto, acoes = [], alturaMinima = 220 }: {
  icone: ReactNode;
  titulo: string;
  texto: string;
  acoes?: Array<{ rotulo: string; onClick: () => void; icone?: ReactNode; tom?: "principal" | "secundario" }>;
  /** Em px. O cartão de um painel lateral estreito pede menos altura. */
  alturaMinima?: number;
}) {
  return (
    <div
      className="flex flex-1 flex-col items-center justify-center gap-3.5 rounded-[16px] bg-[#F8FAF9] p-8 text-center"
      style={{ minHeight: alturaMinima }}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-[16px] border border-[#E3EBE6] bg-white text-[#4C6355]">{icone}</span>
      <div className="flex flex-col gap-1">
        <strong className="text-[15px] font-bold">{titulo}</strong>
        <span className="max-w-[360px] text-[13px] leading-relaxed text-[#4C6355]">{texto}</span>
      </div>
      {acoes.length > 0 && (
        <div className="flex flex-wrap justify-center gap-2.5">
          {acoes.map(acao => (
            <button
              key={acao.rotulo}
              type="button"
              onClick={acao.onClick}
              className={`flex h-[42px] items-center gap-2 rounded-[11px] px-[18px] text-[13.5px] transition ${
                acao.tom === "secundario"
                  ? "border border-[#E3EBE6] bg-white font-semibold text-[#28382E] hover:bg-[#F8FAF9]"
                  : "bg-[#12B85C] font-bold text-white hover:bg-[#0F9E4E]"
              }`}
            >
              {acao.icone}
              {acao.rotulo}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** O visto verde do "Precisa de você" quando não há nada pendente. */
export function NadaPendente({ texto = "Atrasos, conciliações e recebimentos do dia aparecem aqui." }: { texto?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[14px] bg-[#F1FBF6] p-3.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#12B85C] text-white">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
      </span>
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-bold text-[#0A7A42]">Nada pendente</span>
        <span className="text-[12px] text-[#4C6355]">{texto}</span>
      </div>
    </div>
  );
}

/*
 * As barras por vir do "Receita por canal".
 *
 * Três pares de traços apagados no lugar das barras, para o cartão guardar a
 * forma que vai ter. É decoração: `aria-hidden`, e a frase abaixo é o que o
 * leitor de tela recebe.
 */
export function BarrasFantasma({ texto }: { texto: string }) {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col gap-3 opacity-45">
        {[38, 52, 30].map(largura => (
          <div key={largura} className="flex flex-col gap-1.5">
            <span className="h-2.5 rounded-[5px] bg-[#E3EBE6]" style={{ width: `${largura}%` }} />
            <span className="block h-2 rounded-[4px] bg-[#EDF2EE]" />
          </div>
        ))}
      </div>
      <span className="text-[12.5px] leading-relaxed text-[#8A968D]">{texto}</span>
    </>
  );
}
