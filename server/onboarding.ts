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
   * Quando alguém terminou ou pulou o fluxo NESTE LOGIN, pela última vez.
   *
   * É por login e não por empresa porque a coluna mora em `users`. Ver a nota
   * sobre a empresa nova, logo abaixo.
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
 * LIMITAÇÃO CONHECIDA, e é o preço de não ter coluna por empresa: concluir ou
 * pular o fluxo atualiza o `completedAt` do login para agora, então empresas
 * criadas ANTES daquele instante param de oferecer o assistente. Quem criar
 * três empresas de uma vez e passar pelo fluxo de uma perde a oferta nas outras
 * duas — elas continuam alcançáveis por Configurações › Tour do produto. Uma
 * coluna `onboardingCompletedAt` em `companyProfiles` resolveria, e é migration.
 *
 * DECIDIDO: essa coluna entra na migration do cadeado, na Fase 7, no mesmo
 * ritual — sem sentada extra. É um ADD COLUMN nulo, então nasce nula para as
 * empresas que já existem e a regra de hoje continua valendo para elas: a
 * comparação de datas segue como fallback de quem tem a coluna vazia.
 */
export function shouldShowOnboarding({ completedAt, companyCreatedAt, accountCount, transactionCount }: OnboardingState) {
  /* Empresa com dado não precisa de assistente, tenha passado por ele ou não. */
  if (accountCount > 0 || transactionCount > 0) return false;
  if (!completedAt) return true;
  if (!companyCreatedAt) return false;
  return companyCreatedAt.getTime() > completedAt.getTime();
}
