import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { findMatchingRule, type CategoryRule } from "@shared/categoryRules";
import { applyImportClassification, findCompatibleImportCategory, parseImportFile } from "../importers";

const formatSchema = z.enum(["csv", "ofx"]);
const classificationSchema = z.enum(["auto", "entrada", "saida"]);
export const MAX_IMPORT_FILE_CHARACTERS = 25_000_000;
const previewInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  format: formatSchema,
  content: z.string().min(1, "Arquivo vazio").max(MAX_IMPORT_FILE_CHARACTERS, "O arquivo deve ter no máximo 25 MB"),
  accountId: z.number().int().positive(),
  incomeCategoryId: z.number().int().positive().optional(),
  expenseCategoryId: z.number().int().positive().optional(),
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
  costCenterId: z.number().int().positive().nullable().default(null),
  /** Só informativo, para a tela dizer qual regra classificou a linha. */
  ruleLabel: z.string().max(200).nullable().default(null),
});

async function validateOrganization(userId: number, accountId: number) {
  const account = await db.getFinancialAccount(userId, accountId);
  if (!account?.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "Selecione uma conta ativa" });
  return account;
}

export const importsRouter = router({
  preview: protectedProcedure.input(previewInputSchema).mutation(async ({ ctx, input }) => {
    const account = await validateOrganization(ctx.user.id, input.accountId);
    try {
      const parsed = applyImportClassification(
        parseImportFile({ userId: ctx.user.id, accountId: input.accountId, format: input.format, content: input.content }),
        input.classification,
      );
      const activeCategories = (await db.listTransactionCategories(ctx.user.id)).filter(item => item.isActive);
      const preferredCategories = {
        entrada: findCompatibleImportCategory(activeCategories, "entrada", input.incomeCategoryId),
        saida: findCompatibleImportCategory(activeCategories, "saida", input.expenseCategoryId),
      };
      const existing = new Set((await db.getTransactionsByFingerprints(ctx.user.id, parsed.map(row => row.fingerprint))).map(row => row.fingerprint));
      const seen = new Set<string>();
      let duplicateCount = 0;
      // As regras rodam na prévia, não na confirmação: assim o usuário vê o que
      // elas fizeram antes de gravar, em vez de descobrir depois.
      const rules = (await db.listCategoryRules(ctx.user.id)) as unknown as CategoryRule[];
      const categoryById = new Map(activeCategories.map(item => [item.id, item]));

      const rows = parsed.map(row => {
        const duplicate = existing.has(row.fingerprint) || seen.has(row.fingerprint);
        seen.add(row.fingerprint);
        if (duplicate) duplicateCount += 1;

        const fallback = preferredCategories[row.type];
        const rule = findMatchingRule(rules, {
          description: row.description,
          contact: row.contact,
          account: account.name,
        });
        // Uma regra só troca a categoria se a dela for compatível com o tipo da
        // linha: classificar uma saída como receita passaria direto pela
        // conferência e sujaria o DRE.
        const ruleCategory = rule?.categoryId ? categoryById.get(rule.categoryId) : undefined;
        const ruleCategoryFits = Boolean(
          ruleCategory && (ruleCategory.type === "ambos" || ruleCategory.type === row.type)
        );
        const chosen = ruleCategoryFits ? ruleCategory! : fallback;
        if (!chosen) throw new Error(`Não existe uma categoria compatível com ${row.type === "entrada" ? "entradas" : "saídas"}`);

        return {
          ...row,
          categoryId: chosen.id,
          categoryName: chosen.name,
          costCenterId: rule?.costCenterId ?? null,
          ruleLabel: rule && (ruleCategoryFits || rule.costCenterId)
            ? `${rule.matchType === "conta" ? "Conta" : rule.matchType === "contato" ? "Contato" : "Descrição"}: ${rule.matchValue}`
            : null,
          duplicate,
        };
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
    duplicateCount: z.number().int().min(0),
    rows: z.array(importRowSchema).min(1, "Selecione ao menos um lançamento"),
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
    // O centro de custo vem da prévia; conferimos aqui porque o cliente pode
    // mandar qualquer id e a prévia não é uma garantia.
    const costCenterIds = Array.from(new Set(input.rows.map(row => row.costCenterId).filter((id): id is number => Boolean(id))));
    const costCenters = await Promise.all(costCenterIds.map(id => db.getCostCenter(ctx.user.id, id)));
    if (costCenters.some(item => !item?.isActive)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Um dos centros de custo não está disponível" });
    }
    const costCenterMap = new Map(costCenters.map(item => [item!.id, item!]));

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
          costCenter: row.costCenterId ? costCenterMap.get(row.costCenterId)?.name ?? "" : "",
          costCenterId: row.costCenterId,
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
