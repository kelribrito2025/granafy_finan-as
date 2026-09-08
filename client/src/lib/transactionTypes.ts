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
  description: string;
  contact: string;
  category: string;
  amount: number;
  account: string;
  accountId: number | null;
  categoryId: number | null;
  costCenter: string;
  costCenterId: number | null;
  importBatchId: string | null;
  status: "Pago" | "Pendente";
  recurring: boolean;
  recurringMonths: number | null;
  recurrenceGroupId: string | null;
  recurrenceIndex: number | null;
  attachmentKey: string | null;
  attachmentName: string | null;
  transferGroupId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SeriesScope = "single" | "following";

export type TransactionInput =
  Omit<Transaction, "id" | "createdAt" | "updatedAt" | "importBatchId" | "transferGroupId" | "recurrenceGroupId" | "recurrenceIndex">
  & { amount: number; destinationAccountId: number | null; recurrenceStart: "este_mes" | "proximo_mes" };

export type OrganizationOptions = {
  accounts: Array<{ id: number; name: string; institution: string; color: string }>;
  categories: Array<{ id: number; name: string; type: "entrada" | "saida" | "ambos"; color: string }>;
  costCenters: Array<{ id: number; name: string; color: string }>;
};
