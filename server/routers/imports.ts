import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { applyImportClassification, parseImportFile } from "../importers";

const formatSchema = z.enum(["csv", "ofx"]);
const classificationSchema = z.enum(["auto", "entrada", "saida"]);
const previewInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  format: formatSchema,
  content: z.string().min(1, "Arquivo vazio").max(5_000_000, "O arquivo deve ter no máximo 5 MB"),
  accountId: z.number().int().positive(),
  defaultCategoryId: z.number().int().positive(),
  classification: classificationSchema.default("auto"),
});
const importRowSchema = z.object({
  sourceIndex: z.number().int().positive(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().trim().min(1).max(180),
  contact: z.string().trim().max(120),
  amount: z.number().finite().refine(value => value !== 0, "Valor não pode ser zero"),
  type: z.enum(["entrada", "saida"]),
  externalId: z.string().max(160).nullable(),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  categoryId: z.number().int().positive(),
});

async function validateOrganization(userId: number, accountId: number, categoryId: number) {
  const [account, category] = await Promise.all([
    db.getFinancialAccount(userId, accountId),
    db.getTransactionCategory(userId, categoryId),
  ]);
  if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma conta ativa" });
  if (!category?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma categoria ativa" });
  return { account, category };
}

export const importsRouter = router({
  preview: protectedProcedure.input(previewInputSchema).mutation(async ({ ctx, input }) => {
    const { account, category } = await validateOrganization(ctx.user.id, input.accountId, input.defaultCategoryId);
    try {
      const parsed = applyImportClassification(
        parseImportFile({ userId: ctx.user.id, accountId: input.accountId, format: input.format, content: input.content }),
        input.classification,
      );
      const activeCategories = (await db.listTransactionCategories(ctx.user.id)).filter(item => item.isActive);
      const existing = new Set((await db.getTransactionsByFingerprints(ctx.user.id, parsed.map(row => row.fingerprint))).map(row => row.fingerprint));
      const seen = new Set<string>();
      let duplicateCount = 0;
      const rows = parsed.map(row => {
        const duplicate = existing.has(row.fingerprint) || seen.has(row.fingerprint);
        seen.add(row.fingerprint);
        if (duplicate) duplicateCount += 1;
        const rowCategory = category.type === "ambos" || category.type === row.type
          ? category
          : activeCategories.find(item => item.type === "ambos" || item.type === row.type);
        if (!rowCategory) throw new Error(`Não existe uma categoria compatível com ${row.type === "entrada" ? "entradas" : "saídas"}`);
        return { ...row, categoryId: rowCategory.id, categoryName: rowCategory.name, duplicate };
      });
      return {
        fileName: input.fileName,
        format: input.format,
        account: { id: account.id, name: account.name },
        rows,
        duplicateCount,
      };
    } catch (error) {
      throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Não foi possível interpretar o arquivo" });
    }
  }),

  confirm: protectedProcedure.input(z.object({
    fileName: z.string().trim().min(1).max(255),
    format: formatSchema,
    accountId: z.number().int().positive(),
    duplicateCount: z.number().int().min(0).max(1_000),
    rows: z.array(importRowSchema).min(1, "Selecione ao menos um lançamento").max(1_000),
  })).mutation(async ({ ctx, input }) => {
    const account = await db.getFinancialAccount(ctx.user.id, input.accountId);
    if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "A conta selecionada não está disponível" });
    const categoryIds = Array.from(new Set(input.rows.map(row => row.categoryId)));
    const categories = await Promise.all(categoryIds.map(id => db.getTransactionCategory(ctx.user.id, id)));
    if (categories.some(category => !category?.isActive)) throw new TRPCError({ code: "BAD_REQUEST", message: "Uma das categorias não está disponível" });
    const categoryMap = new Map(categories.map(category => [category!.id, category!]));
    if (input.rows.some(row => {
      const category = categoryMap.get(row.categoryId);
      const expectedType = row.amount < 0 ? "saida" : "entrada";
      return !category || row.type !== expectedType || (category.type !== "ambos" && category.type !== expectedType);
    })) throw new TRPCError({ code: "BAD_REQUEST", message: "Uma categoria não é compatível com o tipo do lançamento" });
    const existing = new Set((await db.getTransactionsByFingerprints(ctx.user.id, input.rows.map(row => row.fingerprint))).map(row => row.fingerprint));
    const seen = new Set<string>();
    const uniqueRows = input.rows.filter(row => {
      if (existing.has(row.fingerprint) || seen.has(row.fingerprint)) return false;
      seen.add(row.fingerprint);
      return true;
    });
    if (!uniqueRows.length) throw new TRPCError({ code: "CONFLICT", message: "Todos os lançamentos selecionados já foram importados" });

    const batchId = randomUUID();
    await db.createImportBatch({
      id: batchId,
      userId: ctx.user.id,
      fileName: input.fileName,
      format: input.format,
      accountId: account.id,
      duplicateCount: input.duplicateCount + (input.rows.length - uniqueRows.length),
      transactions: uniqueRows.map(row => {
        const category = categoryMap.get(row.categoryId)!;
        return {
          type: row.amount < 0 ? "saida" : "entrada",
          transactionDate: row.transactionDate,
          description: row.description,
          contact: row.contact,
          category: category.name,
          categoryId: category.id,
          amount: row.amount.toFixed(2),
          account: account.name,
          accountId: account.id,
          status: "Pago",
          recurring: false,
          externalId: row.externalId,
          fingerprint: row.fingerprint,
        };
      }),
    });

    return {
      batchId,
      importedCount: uniqueRows.length,
      duplicateCount: input.duplicateCount + (input.rows.length - uniqueRows.length),
    };
  }),
});

export { importRowSchema, previewInputSchema, validateOrganization };
