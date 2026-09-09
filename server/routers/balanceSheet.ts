import { TRPCError } from "@trpc/server";
import { escopoDe } from "../escopo";
import type { Escopo } from "../escopo";
import { z } from "zod";
import { ASSET_CATEGORIES, assetItemType } from "@shared/assetCategory";
import {
  BALANCE_GROUPS,
  calculatePatrimonialItems,
  summarizeAccountPositions,
  summarizeBalanceSheet,
} from "../balanceSheet";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { isDuplicateDatabaseError } from "./organization";

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Data inválida");

const moneySchema = z.number().finite().min(0).max(999_999_999_999.99);

export const patrimonialItemValuesSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome").max(120),
  balanceGroup: z.enum(BALANCE_GROUPS),
  itemType: z.enum([
    "bem",
    "direito",
    "estoque",
    "investimento",
    "obrigacao",
    "capital",
    "ajuste",
    "outro",
  ]),
  acquisitionDate: isoDateSchema.nullable(),
  acquisitionValue: moneySchema,
  currentValue: moneySchema,
  valuationMethod: z.enum(["manual", "depreciacao_linear"]),
  usefulLifeMonths: z.number().int().min(1).max(1_200).nullable(),
  residualValue: moneySchema,
  notes: z.string().trim().max(2_000).default(""),
  assetCategory: z.enum(ASSET_CATEGORIES).nullable().default(null),
  costCenterId: z.number().int().positive().nullable().default(null),
  sourceAccountId: z.number().int().positive().nullable().default(null),
  attachmentKey: z.string().trim().max(255).nullable().default(null),
  attachmentName: z.string().trim().max(180).nullable().default(null),
}).superRefine((value, ctx) => {
  if (value.balanceGroup.startsWith("ativo_") && !value.assetCategory) {
    ctx.addIssue({ code: "custom", path: ["assetCategory"], message: "Escolha a categoria do bem" });
  }
  if (!value.balanceGroup.startsWith("ativo_") && value.assetCategory) {
    ctx.addIssue({ code: "custom", path: ["assetCategory"], message: "Categoria de bem só se aplica a ativos" });
  }
  if (Boolean(value.attachmentKey) !== Boolean(value.attachmentName)) {
    ctx.addIssue({ code: "custom", path: ["attachmentKey"], message: "Anexo incompleto" });
  }
  if (value.acquisitionDate && value.acquisitionDate > new Date().toISOString().slice(0, 10)) {
    ctx.addIssue({
      code: "custom",
      path: ["acquisitionDate"],
      message: "A data de aquisição não pode estar no futuro",
    });
  }
  if (value.residualValue > value.acquisitionValue) {
    ctx.addIssue({
      code: "custom",
      path: ["residualValue"],
      message: "O valor residual não pode superar o valor de aquisição",
    });
  }
  if (value.valuationMethod !== "depreciacao_linear") return;
  if (!value.balanceGroup.startsWith("ativo_")) {
    ctx.addIssue({
      code: "custom",
      path: ["valuationMethod"],
      message: "A depreciação linear só pode ser usada em ativos",
    });
  }
  if (!value.acquisitionDate) {
    ctx.addIssue({
      code: "custom",
      path: ["acquisitionDate"],
      message: "Informe a data de aquisição para calcular a depreciação",
    });
  }
  if (!value.usefulLifeMonths) {
    ctx.addIssue({
      code: "custom",
      path: ["usefulLifeMonths"],
      message: "Informe a vida útil em meses",
    });
  }
  if (value.acquisitionValue <= 0) {
    ctx.addIssue({
      code: "custom",
      path: ["acquisitionValue"],
      message: "Informe um valor de aquisição maior que zero",
    });
  }
});

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Resolve os vínculos e o tipo contábil antes de gravar. `itemType` é sempre
 * derivado da categoria nos ativos: deixar os dois entrarem soltos permitiria um
 * item categorizado como Estoque chegar ao banco como "bem".
 */
async function resolveItemValues(
  escopo: Escopo,
  input: z.infer<typeof patrimonialItemValuesSchema>
) {
  let costCenter = "";
  if (input.costCenterId) {
    const found = await db.getCostCenter(escopo, input.costCenterId);
    if (!found?.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Centro de custo não encontrado ou inativo" });
    }
    costCenter = found.name;
  }

  let sourceAccount = "";
  if (input.sourceAccountId) {
    const found = await db.getFinancialAccount(escopo, input.sourceAccountId);
    if (!found?.isActive) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Conta de origem não encontrada ou inativa" });
    }
    sourceAccount = found.name;
  }

  return {
    ...input,
    itemType: input.assetCategory ? assetItemType(input.assetCategory) : input.itemType,
    costCenter,
    costCenterId: input.costCenterId,
    sourceAccount,
    sourceAccountId: input.sourceAccountId,
    acquisitionValue: input.acquisitionValue.toFixed(2),
    currentValue: input.currentValue.toFixed(2),
    residualValue: input.residualValue.toFixed(2),
  };
}

async function calculatePosition(escopo: Escopo, referenceDate: string) {
  const [items, accounts, balances] = await Promise.all([
    db.listPatrimonialItems(escopo.userId),
    db.listFinancialAccounts(escopo),
    // O saldo por conta vem somado do banco. Trazer o razão inteiro para fazer
    // a mesma soma em memória custava quase meio segundo por abertura da tela.
    db.getAccountBalances(escopo.userId, referenceDate),
  ]);
  const calculatedItems = calculatePatrimonialItems(items, referenceDate);
  const financial = summarizeAccountPositions(accounts, balances);
  const summary = summarizeBalanceSheet(
    calculatedItems,
    financial.cashAndEquivalents,
    financial.currentLiabilities
  );
  return { items: calculatedItems, summary, accountCount: accounts.length };
}

function normalizeSnapshot(snapshot: Awaited<ReturnType<typeof db.listBalanceSheetSnapshots>>[number]) {
  return {
    ...snapshot,
    cashAndEquivalents: Number(snapshot.cashAndEquivalents),
    currentAssets: Number(snapshot.currentAssets),
    nonCurrentAssets: Number(snapshot.nonCurrentAssets),
    currentLiabilities: Number(snapshot.currentLiabilities),
    nonCurrentLiabilities: Number(snapshot.nonCurrentLiabilities),
    declaredEquity: Number(snapshot.declaredEquity),
    totalAssets: Number(snapshot.totalAssets),
    totalLiabilities: Number(snapshot.totalLiabilities),
    netWorth: Number(snapshot.netWorth),
  };
}

function persistenceError(error: unknown): never {
  if (isDuplicateDatabaseError(error)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Já existe um item patrimonial com esse nome.",
    });
  }
  console.error("[BalanceSheet] Persistence failed", {
    code: typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "unknown",
  });
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "Não foi possível salvar o item patrimonial. Tente novamente.",
  });
}

export const balanceSheetRouter = router({
  overview: protectedProcedure
    .input(z.object({ referenceDate: isoDateSchema.optional() }).optional())
    .query(async ({ ctx, input }) => {
      const referenceDate = input?.referenceDate ?? todayUtc();
      const [{ items, summary, accountCount }, snapshots] = await Promise.all([
        calculatePosition(escopoDe(ctx), referenceDate),
        db.listBalanceSheetSnapshots(ctx.user.id, 24),
      ]);
      return {
        referenceDate,
        summary,
        items,
        accountCount,
        activeItemCount: items.filter(item => item.isActive).length,
        history: snapshots.map(normalizeSnapshot).reverse(),
      };
    }),

  createItem: protectedProcedure
    .input(patrimonialItemValuesSchema)
    .mutation(async ({ ctx, input }) => {
      if (await db.getPatrimonialItemByName(ctx.user.id, input.name)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um item patrimonial com esse nome.",
        });
      }
      try {
        return await db.createPatrimonialItem(ctx.user.id, {
          ...await resolveItemValues(escopoDe(ctx), input),
          isActive: true,
        });
      } catch (error) {
        return persistenceError(error);
      }
    }),

  updateItem: protectedProcedure
    .input(patrimonialItemValuesSchema.and(z.object({ id: z.number().int().positive() })))
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      if (!await db.getPatrimonialItem(ctx.user.id, id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item patrimonial não encontrado" });
      }
      const conflicting = await db.getPatrimonialItemByName(ctx.user.id, values.name);
      if (conflicting && conflicting.id !== id) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Já existe um item patrimonial com esse nome.",
        });
      }
      try {
        return await db.updatePatrimonialItem(ctx.user.id, id, await resolveItemValues(escopoDe(ctx), values));
      } catch (error) {
        return persistenceError(error);
      }
    }),

  toggleItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const item = await db.getPatrimonialItem(ctx.user.id, input.id);
      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item patrimonial não encontrado" });
      }
      return db.updatePatrimonialItem(ctx.user.id, input.id, { isActive: !item.isActive });
    }),

  deleteItem: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (!await db.getPatrimonialItem(ctx.user.id, input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item patrimonial não encontrado" });
      }
      await db.deletePatrimonialItem(ctx.user.id, input.id);
      return { success: true } as const;
    }),

  captureSnapshot: protectedProcedure
    .input(z.object({ referenceDate: isoDateSchema }))
    .mutation(async ({ ctx, input }) => {
      if (input.referenceDate > todayUtc()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A data da posição não pode estar no futuro.",
        });
      }
      const { items, summary } = await calculatePosition(escopoDe(ctx), input.referenceDate);
      return db.upsertBalanceSheetSnapshot(ctx.user.id, {
        referenceDate: input.referenceDate,
        cashAndEquivalents: summary.cashAndEquivalents.toFixed(2),
        currentAssets: summary.currentAssets.toFixed(2),
        nonCurrentAssets: summary.nonCurrentAssets.toFixed(2),
        currentLiabilities: summary.currentLiabilities.toFixed(2),
        nonCurrentLiabilities: summary.nonCurrentLiabilities.toFixed(2),
        declaredEquity: summary.declaredEquity.toFixed(2),
        totalAssets: summary.totalAssets.toFixed(2),
        totalLiabilities: summary.totalLiabilities.toFixed(2),
        netWorth: summary.netWorth.toFixed(2),
        itemCount: items.filter(item => item.isActive).length,
      });
    }),

  deleteSnapshot: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await db.deleteBalanceSheetSnapshot(ctx.user.id, input.id);
      return { success: true } as const;
    }),
});

export { isoDateSchema };
