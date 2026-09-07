import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida");
const accountValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  institution: z.string().trim().max(100).default(""),
  accountType: z.enum(["corrente", "poupanca", "carteira", "cartao", "gateway", "outro"]),
  color: colorSchema,
  initialBalance: z.number().finite().min(-999_999_999_999.99).max(999_999_999_999.99),
});
const categoryValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  type: z.enum(["entrada", "saida", "ambos"]),
  color: colorSchema,
});

function conflictError(entity: string) {
  return new TRPCError({ code: "CONFLICT", message: `Já existe ${entity} com esse nome.` });
}

export function isDuplicateDatabaseError(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (typeof current !== "object") break;
    const candidate = current as {
      code?: string;
      errno?: number;
      sqlState?: string;
      sqlMessage?: string;
      message?: string;
      cause?: unknown;
    };
    if (
      candidate.code === "ER_DUP_ENTRY" ||
      candidate.errno === 1062 ||
      candidate.sqlState === "23000" ||
      /duplicate|unique/i.test(candidate.sqlMessage ?? "")
    ) return true;
    current = candidate.cause;
  }
  return false;
}

function rethrowOrganizationError(error: unknown, entity: string): never {
  if (isDuplicateDatabaseError(error)) throw conflictError(entity);
  console.error("[Organization] Persistence failed", {
    entity,
    code: typeof error === "object" && error && "code" in error ? String(error.code) : "unknown",
  });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: `Não foi possível salvar ${entity}. Tente novamente.`,
  });
}

export const organizationRouter = router({
  overview: protectedProcedure.query(async ({ ctx }) => {
    const [accounts, categories, transactions, imports] = await Promise.all([
      db.listFinancialAccounts(ctx.user.id),
      db.listTransactionCategories(ctx.user.id),
      db.listAllTransactions(ctx.user.id),
      db.listImportBatches(ctx.user.id),
    ]);
    const accountStats = new Map<number, { count: number; movement: number }>();
    const categoryStats = new Map<number, { count: number; total: number }>();
    transactions.forEach(transaction => {
      if (transaction.accountId) {
        const current = accountStats.get(transaction.accountId) ?? { count: 0, movement: 0 };
        accountStats.set(transaction.accountId, { count: current.count + 1, movement: current.movement + (transaction.status === "Pago" ? Number(transaction.amount) : 0) });
      }
      if (transaction.categoryId) {
        const current = categoryStats.get(transaction.categoryId) ?? { count: 0, total: 0 };
        categoryStats.set(transaction.categoryId, { count: current.count + 1, total: current.total + Number(transaction.amount) });
      }
    });

    return {
      accounts: accounts.map(account => ({
        ...account,
        initialBalance: Number(account.initialBalance),
        balance: Number(account.initialBalance) + (accountStats.get(account.id)?.movement ?? 0),
        transactionCount: accountStats.get(account.id)?.count ?? 0,
      })),
      categories: categories.map(category => ({
        ...category,
        transactionCount: categoryStats.get(category.id)?.count ?? 0,
        total: categoryStats.get(category.id)?.total ?? 0,
      })),
      imports,
    };
  }),

  options: protectedProcedure.query(async ({ ctx }) => {
    const [accounts, categories] = await Promise.all([
      db.listFinancialAccounts(ctx.user.id),
      db.listTransactionCategories(ctx.user.id),
    ]);
    return {
      accounts: accounts.filter(account => account.isActive).map(account => ({ id: account.id, name: account.name, institution: account.institution, color: account.color })),
      categories: categories.filter(category => category.isActive).map(category => ({ id: category.id, name: category.name, type: category.type, color: category.color })),
    };
  }),

  createAccount: protectedProcedure.input(accountValuesSchema).mutation(async ({ ctx, input }) => {
    if (await db.getFinancialAccountByName(ctx.user.id, input.name)) {
      throw conflictError("uma conta");
    }
    try {
      return await db.createFinancialAccount(ctx.user.id, { ...input, initialBalance: input.initialBalance.toFixed(2), isActive: true });
    } catch (error) {
      return rethrowOrganizationError(error, "uma conta");
    }
  }),

  updateAccount: protectedProcedure.input(accountValuesSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    if (!await db.getFinancialAccount(ctx.user.id, id)) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });
    const conflictingAccount = await db.getFinancialAccountByName(ctx.user.id, values.name);
    if (conflictingAccount && conflictingAccount.id !== id) throw conflictError("uma conta");
    try {
      return await db.updateFinancialAccount(ctx.user.id, id, { ...values, initialBalance: values.initialBalance.toFixed(2) });
    } catch (error) {
      return rethrowOrganizationError(error, "uma conta");
    }
  }),

  toggleAccount: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const account = await db.getFinancialAccount(ctx.user.id, input.id);
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });
    return db.updateFinancialAccount(ctx.user.id, input.id, { isActive: !account.isActive });
  }),

  deleteAccount: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!await db.getFinancialAccount(ctx.user.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Conta não encontrada" });
    if (!await db.deleteFinancialAccount(ctx.user.id, input.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta conta possui lançamentos. Desative-a para preservar o histórico." });
    }
    return { success: true } as const;
  }),

  createCategory: protectedProcedure.input(categoryValuesSchema).mutation(async ({ ctx, input }) => {
    if (await db.getTransactionCategoryByName(ctx.user.id, input.name)) {
      throw conflictError("uma categoria");
    }
    try {
      return await db.createTransactionCategory(ctx.user.id, { ...input, isActive: true });
    } catch (error) {
      return rethrowOrganizationError(error, "uma categoria");
    }
  }),

  updateCategory: protectedProcedure.input(categoryValuesSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    if (!await db.getTransactionCategory(ctx.user.id, id)) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
    const conflictingCategory = await db.getTransactionCategoryByName(ctx.user.id, values.name);
    if (conflictingCategory && conflictingCategory.id !== id) throw conflictError("uma categoria");
    try {
      return await db.updateTransactionCategory(ctx.user.id, id, values);
    } catch (error) {
      return rethrowOrganizationError(error, "uma categoria");
    }
  }),

  toggleCategory: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const category = await db.getTransactionCategory(ctx.user.id, input.id);
    if (!category) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
    return db.updateTransactionCategory(ctx.user.id, input.id, { isActive: !category.isActive });
  }),

  deleteCategory: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!await db.getTransactionCategory(ctx.user.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Categoria não encontrada" });
    if (!await db.deleteTransactionCategory(ctx.user.id, input.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "Esta categoria possui lançamentos. Desative-a para preservar o histórico." });
    }
    return { success: true } as const;
  }),
});

export { accountValuesSchema, categoryValuesSchema };
