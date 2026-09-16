import { roundCurrency } from "./currency";

/*
 * O saldo de abertura, derivado do próprio extrato.
 *
 * O arquivo OFX não traz saldo de abertura. O bloco `LEDGERBAL` é o saldo no
 * FIM do período — foi ele que apareceu como 17.023,06 em 07/09 no diagnóstico
 * do Efi Bank. Tratar esse número como ponto de partida e somar o extrato em
 * cima dobraria o caixa.
 *
 * Mas ele dá o de abertura de graça, por subtração:
 *
 *     abertura = saldo final − soma dos movimentos do arquivo
 *
 * É exato, não é estimativa, e é a mesma conta que desvendou os R$ 13.498,12
 * daquela conta. Serve para conferir o que a pessoa digitou no primeiro acesso,
 * que é onde ninguém ainda tem experiência para desconfiar de um número errado.
 */

export type OpeningComparison = {
  /** O que a pessoa digitou. */
  informed: number;
  /** O que o arquivo diz, por subtração. */
  derived: number;
  /** Positiva quando o digitado é maior que o derivado. */
  difference: number;
  agree: boolean;
};

/** Quantos centavos de diferença ainda contam como "bate". */
export const OPENING_TOLERANCE = 0.01;

export function derivedOpeningBalance(closingBalance: number, amounts: readonly number[]) {
  const movimento = amounts.reduce((soma, valor) => soma + valor, 0);
  return roundCurrency(closingBalance - movimento);
}

/**
 * O saldo que o arquivo implica NUMA DATA: o saldo final menos o que veio
 * depois dela. É a versão com data de `derivedOpeningBalance` — e é a que vale
 * desde que o saldo inicial passou a significar "saldo nesta data".
 *
 * Data anterior a todo o arquivo devolve a abertura clássica; data igual ou
 * posterior à última movimentação devolve o próprio saldo final.
 */
export function derivedBalanceAt(
  closingBalance: number,
  rows: readonly { transactionDate: string; amount: number }[],
  date: string,
) {
  return derivedOpeningBalance(closingBalance, rows.filter(row => row.transactionDate > date).map(row => row.amount));
}

export function compareOpeningBalance(informed: number, derived: number): OpeningComparison {
  const difference = roundCurrency(informed - derived);
  return {
    informed: roundCurrency(informed),
    derived: roundCurrency(derived),
    difference,
    // Um centavo de folga cobre arredondamento do banco, não erro de digitação.
    agree: Math.abs(difference) <= OPENING_TOLERANCE,
  };
}

/**
 * O que a tela diz quando os dois números não batem.
 *
 * Em linguagem de gente, e sem escolher pela pessoa: os dois valores podem
 * estar certos por motivos diferentes — o extrato pode não ser o primeiro
 * movimento da conta, ou a data digitada pode estar fora do lugar. A tela
 * mostra os dois, explica o que cada um é, e deixa a escolha.
 *
 * O palpite do motivo é dado só quando ele é forte: se a diferença bate
 * exatamente com o saldo final do arquivo, a pessoa digitou o saldo de hoje no
 * lugar do de abertura, que é o erro que dobra o caixa.
 */
export function openingMismatchReason(comparison: OpeningComparison, closingBalance: number) {
  if (comparison.agree) return null;
  if (Math.abs(comparison.informed - closingBalance) <= OPENING_TOLERANCE) {
    return "saldo_de_hoje" as const;
  }
  return comparison.difference > 0 ? "digitado_maior" as const : "digitado_menor" as const;
}
