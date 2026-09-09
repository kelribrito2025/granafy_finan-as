import { roundCurrency } from "@shared/currency";

/*
 * A ordenação das colunas de "Pagas e recebidas".
 *
 * Vizinha de `transactionSort`, e separada dela de propósito: lá as colunas são
 * categoria, conta e situação; aqui são a data em que o dinheiro andou, o
 * título e o valor. Juntar as duas daria um módulo com chaves que só valem em
 * metade das telas.
 *
 * Mora fora do componente para poder ser testada sem montar a tela — é a mesma
 * separação de `periodLock`, `settlement` e companhia.
 */

export type SettledSortKey = "settledAt" | "description" | "amount";
export type SettledSortDirection = "asc" | "desc";
export type SettledSortState = { key: SettledSortKey; direction: SettledSortDirection } | null;

export type SortableSettled = {
  id: number;
  /** A data da liquidação. Nunca nula nesta tela, mas o tipo da API permite. */
  settledAt: string | null;
  description: string;
  amount: number;
};

/**
 * Ordena por uma coluna, com o id como desempate.
 *
 * O valor compara em módulo, como em Lançamentos: na lista única entram
 * entradas e saídas juntas, e quem clica em "Valor" procura os títulos grandes
 * — não quer os pagamentos empurrados para uma ponta só por serem negativos.
 *
 * O desempate pelo id não inverte junto com a direção. É o que mantém a ordem
 * estável: dois títulos de mesmo valor não trocam de lugar quando a pessoa
 * inverte a coluna e volta.
 */
export function sortSettled<T extends SortableSettled>(
  itens: readonly T[],
  key: SettledSortKey,
  direction: SettledSortDirection,
) {
  const multiplicador = direction === "asc" ? 1 : -1;
  return [...itens].sort((esquerda, direita) => {
    let comparacao: number;
    if (key === "amount") {
      comparacao = Math.abs(esquerda.amount) - Math.abs(direita.amount);
    } else if (key === "settledAt") {
      // Data ISO compara como texto; sem data vai para o fim nos dois sentidos.
      comparacao = (esquerda.settledAt ?? "9999-12-31").localeCompare(direita.settledAt ?? "9999-12-31");
    } else {
      comparacao = esquerda.description.localeCompare(direita.description, "pt-BR", { sensitivity: "base" });
    }
    return comparacao === 0 ? esquerda.id - direita.id : comparacao * multiplicador;
  });
}

/**
 * Os grupos por dia da lista única — ou um grupo só, quando há ordenação.
 *
 * Com uma coluna ordenada, o cabeçalho de dia deixaria de significar o que diz:
 * a lista não está mais em ordem de dia, e cada faixa "líquido do dia" viraria
 * um recorte arbitrário. Então some, e a data continua visível linha a linha.
 */
export function buildSettledDayGroups<T extends SortableSettled>(
  itens: readonly T[],
  sort: SettledSortState,
) {
  const liquidoDe = (linhas: readonly T[]) =>
    roundCurrency(linhas.reduce((soma, item) => soma + item.amount, 0));

  if (sort) {
    return [{ date: null, linhas: sortSettled(itens, sort.key, sort.direction), liquido: liquidoDe(itens) }];
  }

  const grupos = new Map<string, T[]>();
  for (const item of itens) {
    const dia = item.settledAt ?? "";
    grupos.set(dia, [...(grupos.get(dia) ?? []), item]);
  }
  return Array.from(grupos, ([date, linhas]) => ({ date, linhas, liquido: liquidoDe(linhas) }));
}
