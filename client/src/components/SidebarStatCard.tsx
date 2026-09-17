import type { ReactNode } from "react";

/**
 * O cartão do rodapé da barra lateral.
 *
 * Cada tela põe ali o número que ela responde — o atraso em "A pagar e
 * receber", o lucro no DRE, o patrimônio no balanço. As contas conectadas
 * ficam como padrão só onde não há um número mais próximo do assunto da
 * página.
 */
/*
 * A altura mínima é a mesma do cartão de contas conectadas (ConnectedAccounts):
 * os dois se revezam no pé da barra lateral, e trocar de página não pode fazer
 * o rodapé pular de tamanho.
 */
export function SidebarStatCard({ kicker, value, hint, tone = "positive" }: {
  kicker: string;
  value: ReactNode;
  hint: ReactNode;
  /** `negative` é para o que exige ação: atraso, prejuízo, saldo negativo. */
  tone?: "positive" | "negative";
}) {
  const ruim = tone === "negative";
  return (
    <div className={`flex min-h-[104px] flex-col justify-center gap-1.5 rounded-[16px] p-3.5 ${ruim ? "bg-[#FDECEA]" : "bg-[#F1FBF6]"}`}>
      <span className={`text-[10px] font-semibold uppercase tracking-[.1em] ${ruim ? "text-[#8E1F16]" : "text-[#0A7A42]"}`}>
        {kicker}
      </span>
      <span className={`text-[20px] font-bold ${ruim ? "text-[#8E1F16]" : "text-[#0A7A42]"}`}>{value}</span>
      <span className={`text-[11.5px] ${ruim ? "text-[#8E1F16]" : "text-[#4C6355]"}`}>{hint}</span>
    </div>
  );
}
