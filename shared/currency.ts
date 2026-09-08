/**
 * Arredonda para centavo, uma vez só, no lugar certo.
 *
 * O banco guarda `decimal(15,2)` e o SQL soma certo. A deriva nasce depois:
 * `Number(amount)` vira float e cada `reduce` empilha o erro de representação
 * binária — somar 0,1 e 0,2 em JavaScript dá 0,30000000000000004. Na tela isso
 * não aparece, porque o `Intl` corta em duas casas. No CSV aparece: o
 * `.toFixed(2)` da exportação corta um número que já veio derivado, e o
 * contador recebe uma coluna que não fecha por um centavo.
 *
 * Era a mesma função escrita em três lugares — `shared/dre.ts`,
 * `shared/cashflow.ts` e `server/balanceSheet.ts` —, cada uma com um detalhe a
 * menos. Esta junta os dois cuidados que estavam separados.
 */
export function roundCurrency(value: number) {
  // O EPSILON puxa para cima o caso em que o float parou logo abaixo do meio
  // centavo: sem ele, 1,005 arredonda para 1,00.
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  // Somar uma lista vazia de saídas devolve -0, e a tela escreve "− R$ 0,00".
  return rounded === 0 ? 0 : rounded;
}
