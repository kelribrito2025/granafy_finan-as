/*
 * Quando o título foi liquidado.
 *
 * `transactionDate` é o vencimento; `settledAt` é o dia em que o dinheiro se
 * moveu. A regra de qual data gravar é curta mas tem quatro caminhos, e errar
 * qualquer um deles corrompe a tela de pagas e recebidas em silêncio: o título
 * aparece no mês errado e o prazo médio mente. Por isso mora aqui, longe do
 * banco, onde dá para testar.
 */

export type SettlementInput = {
  /** O status que o título vai ficar depois desta operação. */
  status: "Pago" | "Pendente";
  /** A data que a pessoa digitou no formulário, se digitou. */
  informed?: string | null;
  /** A liquidação que o título já tinha registrada. */
  existing?: string | null;
  /** Hoje, no fuso da conta. */
  todayIso: string;
};

/**
 * A data de liquidação a gravar, ou `null` quando não há liquidação.
 *
 * Voltar para "Pendente" é o estorno: a data some junto, senão sobraria uma
 * liquidação órfã e o título continuaria contando na tela de liquidadas mesmo
 * tendo voltado para os abertos.
 *
 * Marcar como pago sem informar data assume hoje — um clique. Editar outro
 * campo de um título já pago **não** move a liquidação para hoje: a data que
 * está lá é um fato, não um reflexo da última vez que alguém salvou a tela.
 */
export function settlementDateFor({ status, informed, existing, todayIso }: SettlementInput) {
  if (status !== "Pago") return null;
  if (informed) return informed;
  return existing ?? todayIso;
}
