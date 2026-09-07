import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { TransactionRecord } from "../../drizzle/schema";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const transactionValuesSchema = z.object({
  type: z.enum(["entrada", "saida"]),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  description: z.string().trim().min(2, "Informe a descrição").max(180),
  contact: z.string().trim().max(120).default(""),
  category: z.string().trim().min(2, "Informe a categoria").max(120),
  amount: z.number().finite().positive("O valor deve ser maior que zero").max(999_999_999_999.99),
  account: z.string().trim().min(1, "Informe a conta").max(80),
  accountId: z.number().int().positive().nullable().optional(),
  categoryId: z.number().int().positive().nullable().optional(),
  status: z.enum(["Pago", "Pendente"]),
  recurring: z.boolean().default(false),
});

const periodSchema = z.object({
  year: z.number().int().min(2000).max(2200),
  month: z.number().int().min(1).max(12),
});

function periodBounds(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

function signedAmount(input: z.infer<typeof transactionValuesSchema>) {
  const absolute = Math.abs(input.amount);
  return input.type === "saida" ? -absolute : absolute;
}

function toTransaction(record: TransactionRecord) {
  return {
    id: record.id,
    type: record.type,
    transactionDate: record.transactionDate,
    description: record.description,
    contact: record.contact,
    category: record.category,
    amount: Number(record.amount),
    account: record.account,
    accountId: record.accountId,
    categoryId: record.categoryId,
    importBatchId: record.importBatchId,
    status: record.status,
    recurring: record.recurring,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

async function resolveTransactionOrganization(userId: number, input: z.infer<typeof transactionValuesSchema>) {
  const normalized = { ...input };
  if (input.accountId) {
    const account = await db.getFinancialAccount(userId, input.accountId);
    if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Conta não encontrada ou inativa" });
    normalized.account = account.name;
  }
  if (input.categoryId) {
    const category = await db.getTransactionCategory(userId, input.categoryId);
    if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria não encontrada ou inativa" });
    if (category.type !== "ambos" && category.type !== input.type) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A categoria não é compatível com o tipo do lançamento" });
    }
    normalized.category = category.name;
  }
  return normalized;
}

function summarize(records: TransactionRecord[]) {
  const incoming = records.reduce((sum, record) => sum + Math.max(0, Number(record.amount)), 0);
  const outgoing = records.reduce((sum, record) => sum + Math.abs(Math.min(0, Number(record.amount))), 0);
  return { incoming, outgoing, balance: incoming - outgoing };
}

const MAX_BULK_DELETE_IDS = 20_000;

export const transactionsRouter = router({
  list: protectedProcedure.input(periodSchema).query(async ({ ctx, input }) => {
    const { start, end } = periodBounds(input.year, input.month);
    const [records, previousRecords, accounts] = await Promise.all([
      db.listTransactionsByPeriod(ctx.user.id, start, end),
      db.listTransactionsBefore(ctx.user.id, start),
      db.listFinancialAccounts(ctx.user.id),
    ]);
    const initialBalance = accounts.reduce((sum, account) => sum + Number(account.initialBalance), 0);
    const previousBalance = initialBalance + previousRecords.reduce((sum, record) => sum + Number(record.amount), 0);

    return {
      items: records.map(toTransaction),
      summary: { ...summarize(records), previousBalance },
    };
  }),

  dashboard: protectedProcedure
    .input(z.object({ range: z.enum(["month", "quarter", "year"]).default("month") }).optional())
    .query(async ({ ctx, input }) => {
    const [records, accounts] = await Promise.all([
      db.listAllTransactions(ctx.user.id),
      db.listFinancialAccounts(ctx.user.id),
    ]);
    const today = new Date();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const range = input?.range ?? "month";
    const startMonth = range === "year" ? 1 : range === "quarter" ? Math.floor((month - 1) / 3) * 3 + 1 : month;
    const endMonth = range === "year" ? 13 : range === "quarter" ? startMonth + 3 : month + 1;
    const start = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    const end = endMonth === 13 ? `${year + 1}-01-01` : `${year}-${String(endMonth).padStart(2, "0")}-01`;
    const current = records.filter(record => record.transactionDate >= start && record.transactionDate < end);
    const currentSummary = summarize(current);
    const paidBalance = accounts.reduce((sum, account) => sum + Number(account.initialBalance), 0) + records
      .filter(record => record.status === "Pago")
      .reduce((sum, record) => sum + Number(record.amount), 0);
    const pendingReceivable = records.filter(record => record.status === "Pendente" && Number(record.amount) > 0);
    const pendingPayable = records.filter(record => record.status === "Pendente" && Number(record.amount) < 0);
    const todayString = today.toISOString().slice(0, 10);
    const overdue = pendingPayable.filter(record => record.transactionDate < todayString);
    const dueToday = pendingReceivable.filter(record => record.transactionDate === todayString);
    const margin = currentSummary.incoming > 0
      ? ((currentSummary.incoming - currentSummary.outgoing) / currentSummary.incoming) * 100
      : 0;

    const months = Array.from({ length: 9 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 9 + index, 1));
      const period = periodBounds(date.getUTCFullYear(), date.getUTCMonth() + 1);
      const monthRecords = records.filter(record => record.transactionDate >= period.start && record.transactionDate < period.end);
      return {
        label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", ""),
        ...summarize(monthRecords),
      };
    });

    const revenueByCategory = Array.from(
      current
        .filter(record => Number(record.amount) > 0)
        .reduce((groups, record) => {
          groups.set(record.category, (groups.get(record.category) ?? 0) + Number(record.amount));
          return groups;
        }, new Map<string, number>())
    )
      .map(([label, amount]) => ({ label, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 4);

    return {
      cashAvailable: paidBalance,
      current: currentSummary,
      pendingReceivable: {
        count: pendingReceivable.length,
        amount: pendingReceivable.reduce((sum, record) => sum + Number(record.amount), 0),
      },
      pendingPayable: {
        count: pendingPayable.length,
        amount: pendingPayable.reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0),
      },
      overdue: {
        count: overdue.length,
        amount: overdue.reduce((sum, record) => sum + Math.abs(Number(record.amount)), 0),
      },
      dueToday: {
        count: dueToday.length,
        amount: dueToday.reduce((sum, record) => sum + Number(record.amount), 0),
      },
      margin,
      months,
      recent: records.slice(0, 5).map(toTransaction),
      revenueByCategory,
      range,
    };
  }),

  create: protectedProcedure.input(transactionValuesSchema).mutation(async ({ ctx, input }) => {
    const normalized = await resolveTransactionOrganization(ctx.user.id, input);
    const record = await db.createTransaction(ctx.user.id, {
      ...normalized,
      amount: signedAmount(normalized).toFixed(2),
    });
    if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível criar o lançamento" });
    return toTransaction(record);
  }),

  update: protectedProcedure.input(transactionValuesSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    const existing = await db.getTransactionById(ctx.user.id, id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    const normalized = await resolveTransactionOrganization(ctx.user.id, values);
    const record = await db.updateTransaction(ctx.user.id, id, {
      ...normalized,
      amount: signedAmount(normalized).toFixed(2),
    });
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    return toTransaction(record);
  }),

  duplicate: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getTransactionById(ctx.user.id, input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    const record = await db.createTransaction(ctx.user.id, {
      type: existing.type,
      transactionDate: existing.transactionDate,
      description: `${existing.description} (cópia)`.slice(0, 180),
      contact: existing.contact,
      category: existing.category,
      amount: existing.amount,
      account: existing.account,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      status: existing.status,
      recurring: existing.recurring,
    });
    if (!record) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Não foi possível duplicar o lançamento" });
    return toTransaction(record);
  }),

  toggleStatus: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getTransactionById(ctx.user.id, input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    const record = await db.updateTransaction(ctx.user.id, input.id, {
      type: existing.type,
      transactionDate: existing.transactionDate,
      description: existing.description,
      contact: existing.contact,
      category: existing.category,
      amount: existing.amount,
      account: existing.account,
      accountId: existing.accountId,
      categoryId: existing.categoryId,
      status: existing.status === "Pago" ? "Pendente" : "Pago",
      recurring: existing.recurring,
    });
    if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    return toTransaction(record);
  }),

  delete: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const existing = await db.getTransactionById(ctx.user.id, input.id);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Lançamento não encontrado" });
    await db.deleteTransaction(ctx.user.id, input.id);
    return { success: true } as const;
  }),

  deleteMany: protectedProcedure.input(z.object({
    ids: z.array(z.number().int().positive()).min(1).max(MAX_BULK_DELETE_IDS, "Selecione no máximo 20.000 lançamentos por vez"),
  })).mutation(async ({ ctx, input }) => {
    const ids = Array.from(new Set(input.ids));
    const deletedCount = await db.deleteTransactions(ctx.user.id, ids);
    return { success: true, requestedCount: ids.length, deletedCount } as const;
  }),
});

export { MAX_BULK_DELETE_IDS, periodBounds, signedAmount, summarize, toTransaction, transactionValuesSchema };
