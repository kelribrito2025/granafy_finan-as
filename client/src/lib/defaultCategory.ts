import { countsInResult, normalizeName, rootOf } from "@shared/dre";

/** A raiz que um extrato bancário quase sempre quer do lado da receita. */
export const PREFERRED_INCOME_ROOT = "receitas operacionais";

/**
 * A categoria que já vem escolhida num formulário de importação.
 *
 * Era a primeira da lista, que é a primeira em ordem alfabética. Quando
 * "Aportes de Capital" entrou no plano padrão, ela virou a primeira receita — e
 * um extrato inteiro de Pix recebido nascia classificado como aporte de sócio,
 * fora do resultado da DRE, sem ninguém ter escolhido isso.
 *
 * A ordem é explícita: a raiz preferida primeiro, depois qualquer raiz que a
 * DRE conte no resultado. Se nada servir, devolve vazio e quem chama decide o
 * que fazer — melhor pedir do que adivinhar errado.
 *
 * Mora aqui, e não dentro de uma tela, porque o primeiro acesso importa pelo
 * mesmo caminho e não pode escolher diferente do modal.
 */
export function defaultCategoryId(categories: readonly { id: number; name: string }[], preferredRoot?: string) {
  const preferida = preferredRoot
    ? categories.find(category => normalizeName(rootOf(category.name)) === preferredRoot)
    : undefined;
  const escolhida = preferida ?? categories.find(category => countsInResult(category.name));
  return escolhida ? String(escolhida.id) : "";
}
