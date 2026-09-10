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
  /**
   * Quando alguém terminou ou pulou o fluxo NESTA EMPRESA.
   *
   * A resposta certa, desde a Fase 7. Nula nas empresas que existiam antes da
   * coluna — e é para elas que as duas linhas abaixo continuam servindo.
   */
  companyCompletedAt: Date | null;
  /**
   * Quando alguém terminou ou pulou o fluxo neste LOGIN, pela última vez.
   *
   * Legado que ainda responde: a coluna mora em `users` e ninguém escreve nela
   * desde a Fase 7. Ela é o que impede as contas antigas de verem o assistente
   * de volta.
   */
  completedAt: Date | null;
  /** Quando a empresa ATIVA foi criada. */
  companyCreatedAt: Date | null;
  accountCount: number;
  transactionCount: number;
};

/**
 * Quem vê o primeiro acesso — agora que um login pode ter várias empresas.
 *
 * A regra tinha duas condições e ganhou uma terceira, porque a segunda empresa
 * de um login veterano é um caso que não existia: ela está vazia, mas o
 * `completedAt` do dono já está preenchido desde a primeira. Sem a terceira
 * condição, criar uma empresa levaria direto ao painel vazio — sem conta, sem
 * extrato e sem ninguém dizendo por onde começar.
 *
 * A terceira condição é uma comparação de datas, e não uma coluna nova: se a
 * empresa nasceu DEPOIS da última vez que alguém concluiu o fluxo, ela nunca
 * passou por ele.
 *
 * Isso preserva o que a segunda condição protege. Quem tem conta antiga e
 * apagou tudo continua sem ver o assistente, porque a empresa dele é anterior
 * ao `completedAt`. E quem nunca passou continua vendo.
 *
 * A LIMITAÇÃO ACABOU, e vale entender o que ela era: enquanto a resposta vinha
 * só da comparação de datas, concluir o fluxo numa empresa empurrava o
 * `completedAt` do login para agora e TODAS as empresas criadas antes daquele
 * instante paravam de oferecer o assistente. Quem criasse três de uma vez e
 * passasse pelo fluxo de uma perdia a oferta nas outras duas.
 *
 * A Fase 7 trouxe `companyProfiles.onboardingCompletedAt`, e agora a ordem das
 * perguntas é o que importa:
 *
 *   1. Esta empresa tem dado dentro? Então não precisa, e ponto.
 *   2. Esta empresa já passou pelo fluxo? A coluna dela responde, e é a
 *      resposta que não depende de mais nada.
 *   3. A coluna está nula? Então é empresa anterior à Fase 7, e aí a
 *      comparação de datas antiga responde por ela — exatamente como respondia.
 *
 * Nada escreve mais em `users.onboardingCompletedAt`, e é de propósito: voltar a
 * escrever ali ressuscitaria a limitação, porque o passo 3 de uma empresa
 * antiga passaria a ver a conclusão de uma empresa nova.
 */
export function shouldShowOnboarding(
  { companyCompletedAt, completedAt, companyCreatedAt, accountCount, transactionCount }: OnboardingState
) {
  /* Empresa com dado não precisa de assistente, tenha passado por ele ou não. */
  if (accountCount > 0 || transactionCount > 0) return false;
  /* A resposta da própria empresa vem antes de qualquer inferência sobre o login. */
  if (companyCompletedAt) return false;
  if (!completedAt) return true;
  if (!companyCreatedAt) return false;
  return companyCreatedAt.getTime() > completedAt.getTime();
}
