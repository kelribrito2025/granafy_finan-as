/**
 * O formato de um lançamento na tela.
 *
 * Mora fora da página porque o modal de lançamento também é aberto do painel:
 * duas telas escrevendo a mesma forma à mão acabariam divergindo no dia em que
 * um campo novo entrar.
 */

export type TransactionType = "entrada" | "saida" | "transferencia";

export type Transaction = {
  id: number;
  type: TransactionType;
  transactionDate: string;
  /** O dia em que o dinheiro se moveu. Nulo enquanto o título está em aberto. */
  settledAt: string | null;
  description: string;
  contact: string;
  category: string;
  amount: number;
  account: string;
  accountId: number | null;
  categoryId: number | null;
  costCenter: string;
  costCenterId: number | null;
  status: "Pago" | "Pendente";
  recurring: boolean;
  recurringMonths: number | null;
  recurrenceGroupId: string | null;
  recurrenceIndex: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  transferGroupId: string | null;
};

/*
 * `createdAt`, `updatedAt` e `importBatchId` saíram daqui.
 *
 * Nenhuma tela lia os três, e eles custavam caro no extrato: são dois `Date`,
 * que o superjson serializa com metadado de tipo, mais um UUID de 36 caracteres,
 * multiplicados por 6.692 linhas de um mês cheio. Se algum dia uma tela precisar
 * de "criado em", o caminho é pedir o campo na rota daquela tela, não voltar a
 * mandar o razão inteiro com ele.
 */

export type SeriesScope = "single" | "following";

export type TransactionInput =
  Omit<Transaction, "id" | "transferGroupId" | "recurrenceGroupId" | "recurrenceIndex">
  & { amount: number; destinationAccountId: number | null; recurrenceStart: "este_mes" | "proximo_mes" };

export type OrganizationOptions = {
  accounts: Array<{ id: number; name: string; institution: string; color: string }>;
  categories: Array<{ id: number; name: string; type: "entrada" | "saida" | "ambos"; color: string }>;
  costCenters: Array<{ id: number; name: string; color: string }>;
};
