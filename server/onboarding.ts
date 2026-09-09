/*
 * Quem vê o primeiro acesso.
 *
 * A regra tem duas condições e a segunda é a que protege quem já usa o
 * sistema. `onboardingCompletedAt` nasceu nula para todos os usuários que já
 * existiam — a migration 0020 não reescreveu linha nenhuma —, então a coluna
 * sozinha diria "mostre para todo mundo". A conta ter dados é o que distingue
 * "nunca passou pelo fluxo" de "não precisa dele".
 *
 * Mora aqui, longe do banco, porque é a regra que decide se alguém com 6.725
 * lançamentos vai levar um assistente de boas-vindas na cara.
 */

export type OnboardingState = {
  /** Quando terminou ou pulou. Nula enquanto nenhuma das duas coisas aconteceu. */
  completedAt: Date | null;
  accountCount: number;
  transactionCount: number;
};

export function shouldShowOnboarding({ completedAt, accountCount, transactionCount }: OnboardingState) {
  if (completedAt) return false;
  return accountCount === 0 && transactionCount === 0;
}
