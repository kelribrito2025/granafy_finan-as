import { roundCurrency } from "@shared/currency";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { RULE_MATCH_TYPES } from "@shared/categoryRules";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida");
const accountValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(80),
  institution: z.string().trim().max(100).default(""),
  accountType: z.enum(["corrente", "poupanca", "carteira", "cartao", "gateway", "outro"]),
  color: colorSchema,
  initialBalance: z.number().finite().min(-999_999_999_999.99).max(999_999_999_999.99),
  /*
   * A data a que o saldo inicial se refere — o dia anterior à primeira
   * movimentação. Opcional: as contas que já existem não têm, e continuam
   * funcionando como antes.
   */
  initialBalanceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").nullable().optional(),
});
const categoryValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  type: z.enum(["entrada", "saida", "ambos"]),
  color: colorSchema,
});
const costCenterValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  color: colorSchema,
});
const ruleValuesSchema = z.object({
  matchType: z.enum(RULE_MATCH_TYPES),
  matchValue: z.string().trim().min(2, "Informe o texto a procurar").max(180),
  categoryId: z.number().int().positive().nullable().default(null),
  costCenterId: z.number().int().positive().nullable().default(null),
  priority: z.number().int().min(0).max(999).default(0),
}).superRefine((value, ctx) => {
  if (!value.categoryId && !value.costCenterId) {
    ctx.addIssue({
      code: "custom",
      path: ["categoryId"],
      message: "A regra precisa definir ao menos uma categoria ou um centro de custo",
      /** Só sugere, ou concilia sozinha? O padrão é sugerir. */
  autoReconcile: z.boolean().default(false),
});
  }
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

/** Resolve os nomes de categoria e centro de custo antes de gravar a regra. */
async function resolveRuleTargets(userId: number, input: z.infer<typeof ruleValuesSchema>) {
  let category = "";
  if (input.categoryId) {
    const found = await db.getTransactionCategory(userId, input.categoryId);
    if (!found?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Categoria não encontrada ou inativa" });
    category = found.name;
  }
  let costCenter = "";
  if (input.costCenterId) {
    const found = await db.getCostCenter(userId, input.costCenterId);
    if (!found?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Centro de custo não encontrado ou inativo" });
    costCenter = found.name;
  }
  return { ...input, category, costCenter };
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
    const today = new Date();
    const monthStart = `${today.getUTCFullYear()}-${String(today.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const nextMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);

    /*
     * As três estatísticas saem agregadas do banco, não de um laço sobre o
     * razão inteiro. A tela já disparava sete consultas em paralelo: estas
     * entram sem custo de tempo e tiram 6.725 linhas da rede.
     */
    const [accounts, categories, costCenters, accountStats, categoryStats, costCenterStats, uncategorized, imports, importSummary, monthCounts] = await Promise.all([
      db.listFinancialAccounts(ctx.user.id),
      db.listTransactionCategories(ctx.user.id),
      db.listCostCenters(ctx.user.id),
      db.getTransactionStatsByAccount(ctx.user.id),
      db.getTransactionStatsByCategory(ctx.user.id),
      db.getTransactionStatsByCostCenter(ctx.user.id),
      db.getUncategorizedSummary(ctx.user.id),
      db.listImportBatches(ctx.user.id),
      db.getAccountImportSummary(ctx.user.id),
      db.getAccountTransactionCounts(ctx.user.id, monthStart, nextMonth),
    ]);

    return {
      accounts: accounts.map(account => {
        const imported = importSummary.get(account.id);
        return {
          ...account,
          initialBalance: Number(account.initialBalance),
          balance: roundCurrency(Number(account.initialBalance) + (accountStats.get(account.id)?.total ?? 0)),
          transactionCount: accountStats.get(account.id)?.count ?? 0,
          monthTransactionCount: monthCounts.get(account.id) ?? 0,
          // Não há conexão bancária: a "sincronização" da conta é o histórico
          // real de importação de arquivo, ou nada.
          lastImportedAt: imported?.lastImportedAt ?? null,
          importFormat: imported?.format ?? "",
          importBatchCount: imported?.batchCount ?? 0,
        };
      }),
      categories: categories.map(category => ({
        ...category,
        transactionCount: categoryStats.get(category.id)?.count ?? 0,
        total: roundCurrency(categoryStats.get(category.id)?.total ?? 0),
      })),
      costCenters: costCenters.map(costCenter => ({
        ...costCenter,
        transactionCount: costCenterStats.get(costCenter.id)?.count ?? 0,
        total: roundCurrency(costCenterStats.get(costCenter.id)?.total ?? 0),
      })),
      imports,
      uncategorized: { count: uncategorized.count, amount: roundCurrency(uncategorized.amount) },
    };
  }),

  /** Só o necessário para a sidebar: contas ativas com o saldo já somado. */
  accountBalances: protectedProcedure.query(async ({ ctx }) => {
    const [accounts, balances] = await Promise.all([
      db.listFinancialAccounts(ctx.user.id),
      db.getAccountBalances(ctx.user.id),
    ]);
    return accounts
      .filter(account => account.isActive)
      .map(account => ({
        id: account.id,
        name: account.name,
        color: account.color,
        balance: Number(account.initialBalance) + (balances.get(account.id) ?? 0),
      }));
  }),

  options: protectedProcedure.query(async ({ ctx }) => {
    const [accounts, categories, costCenters] = await Promise.all([
      db.listFinancialAccounts(ctx.user.id),
      db.listTransactionCategories(ctx.user.id),
      db.listCostCenters(ctx.user.id),
    ]);
    return {
      accounts: accounts.filter(account => account.isActive).map(account => ({ id: account.id, name: account.name, institution: account.institution, color: account.color })),
      categories: categories.filter(category => category.isActive).map(category => ({ id: category.id, name: category.name, type: category.type, color: category.color })),
      costCenters: costCenters.filter(costCenter => costCenter.isActive).map(costCenter => ({ id: costCenter.id, name: costCenter.name, color: costCenter.color })),
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

  rules: protectedProcedure.query(async ({ ctx }) => {
    const rules = await db.listCategoryRules(ctx.user.id);
    return rules.map(rule => ({ ...rule, categoryId: rule.categoryId, costCenterId: rule.costCenterId }));
  }),

  createRule: protectedProcedure.input(ruleValuesSchema).mutation(async ({ ctx, input }) => {
    const resolved = await resolveRuleTargets(ctx.user.id, input);
    return db.createCategoryRule(ctx.user.id, { ...resolved, isActive: true });
  }),

  updateRule: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }).and(ruleValuesSchema))
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      if (!await db.getCategoryRule(ctx.user.id, id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
      }
      return db.updateCategoryRule(ctx.user.id, id, await resolveRuleTargets(ctx.user.id, values));
    }),

  toggleRule: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const rule = await db.getCategoryRule(ctx.user.id, input.id);
    if (!rule) throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
    return db.updateCategoryRule(ctx.user.id, input.id, { isActive: !rule.isActive });
  }),

  deleteRule: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!await db.getCategoryRule(ctx.user.id, input.id)) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Regra não encontrada" });
    }
    return db.deleteCategoryRule(ctx.user.id, input.id);
  }),

  /**
   * Cria em lote a árvore de categorias a partir de linhas "Caminho;tipo".
   * Categorias já existentes são puladas em vez de duplicadas — importar duas
   * vezes o mesmo plano não pode multiplicar o cadastro.
   */
  importCategories: protectedProcedure
    .input(z.object({ content: z.string().min(1).max(200_000) }))
    .mutation(async ({ ctx, input }) => {
      const existing = new Set(
        (await db.listTransactionCategories(ctx.user.id)).map(item => item.name.toLowerCase())
      );
      const seen = new Set<string>();
      const parsed: Array<{ name: string; type: "entrada" | "saida" | "ambos" }> = [];
      const invalid: string[] = [];

      for (const rawLine of input.content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || /^(caminho|categoria|nome)\s*[;,]/i.test(line)) continue;
        const [rawName, rawType = ""] = line.split(/[;,]/);
        const name = rawName.trim().replace(/\s*\/\s*/g, "/").slice(0, 120);
        if (name.length < 2) { invalid.push(line.slice(0, 60)); continue; }
        const normalizedType = rawType.trim().toLowerCase();
        const type = normalizedType === "entrada" || normalizedType === "receita"
          ? "entrada" as const
          : normalizedType === "saida" || normalizedType === "saída" || normalizedType === "despesa"
            ? "saida" as const
            : "ambos" as const;
        const key = name.toLowerCase();
        if (existing.has(key) || seen.has(key)) continue;
        seen.add(key);
        parsed.push({ name, type });
      }

      let created = 0;
      for (const item of parsed) {
        try {
          await db.createTransactionCategory(ctx.user.id, { ...item, color: "#4C6355", isActive: true });
          created += 1;
        } catch (error) {
          if (!isDuplicateDatabaseError(error)) throw error;
        }
      }
      return {
        created,
        skipped: seen.size - created,
        ignored: invalid.length,
        alreadyExisting: existing.size,
      };
    }),

  createCostCenter: protectedProcedure.input(costCenterValuesSchema).mutation(async ({ ctx, input }) => {
    if (await db.getCostCenterByName(ctx.user.id, input.name)) throw conflictError("um centro de custo");
    try {
      return await db.createCostCenter(ctx.user.id, { ...input, isActive: true });
    } catch (error) {
      return rethrowOrganizationError(error, "um centro de custo");
    }
  }),

  updateCostCenter: protectedProcedure.input(costCenterValuesSchema.extend({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const { id, ...values } = input;
    if (!await db.getCostCenter(ctx.user.id, id)) throw new TRPCError({ code: "NOT_FOUND", message: "Centro de custo não encontrado" });
    const conflicting = await db.getCostCenterByName(ctx.user.id, values.name);
    if (conflicting && conflicting.id !== id) throw conflictError("um centro de custo");
    try {
      return await db.updateCostCenter(ctx.user.id, id, values);
    } catch (error) {
      return rethrowOrganizationError(error, "um centro de custo");
    }
  }),

  toggleCostCenter: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const costCenter = await db.getCostCenter(ctx.user.id, input.id);
    if (!costCenter) throw new TRPCError({ code: "NOT_FOUND", message: "Centro de custo não encontrado" });
    return db.updateCostCenter(ctx.user.id, input.id, { isActive: !costCenter.isActive });
  }),

  deleteCostCenter: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    if (!await db.getCostCenter(ctx.user.id, input.id)) throw new TRPCError({ code: "NOT_FOUND", message: "Centro de custo não encontrado" });
    if (!await db.deleteCostCenter(ctx.user.id, input.id)) {
      throw new TRPCError({ code: "CONFLICT", message: "Este centro de custo possui lançamentos. Desative-o para preservar o histórico." });
    }
    return { success: true } as const;
  }),
});

export { accountValuesSchema, categoryValuesSchema, costCenterValuesSchema };
