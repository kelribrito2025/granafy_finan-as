import { companyDisplayName } from "@shared/companies";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

/**
 * As empresas do login.
 *
 * Deixou de ser vitrine: criar, renomear e arquivar mudam dado de verdade. A
 * troca de empresa NÃO está aqui — ela é a leva seguinte, porque trocar exige
 * levar o cache do cliente junto, e cache que fica para trás mostra o número de
 * uma empresa embaixo do nome de outra.
 *
 * Toda mutação recebe o `companyId` ALVO e monta o escopo com o dono do request.
 * A empresa que está ativa não tem privilégio nenhum aqui: o que decide é ser do
 * mesmo dono, e é isso que o arreio prova.
 */

const valoresSchema = z.object({
  legalName: z.string().trim().max(180).default(""),
  tradeName: z.string().trim().max(180).default(""),
  taxId: z.string().trim().max(20).default(""),
});

/** O alvo de uma mutação: uma empresa qualquer da lista, não a ativa. */
const alvoSchema = z.object({ companyId: z.number().int().positive() });

function escopoDoAlvo(ctx: { user: { id: number } | null }, companyId: number) {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return { userId: ctx.user.id, companyId };
}

export const companiesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const empresas = await db.listCompanies(ctx.user.id);
    return empresas.map(empresa => ({
      id: empresa.id,
      displayName: companyDisplayName(empresa, ctx.user.name ?? ""),
      legalName: empresa.legalName,
      tradeName: empresa.tradeName,
      taxId: empresa.taxId,
      isActive: empresa.isActive,
      /*
       * Qual é a do request agora. Vem do servidor porque é ele quem resolve a
       * empresa ativa — o cliente marcava a primeira da lista como "Atual", o
       * que era verdade enquanto a lista tinha uma linha só.
       */
      isCurrent: empresa.id === ctx.activeCompanyId,
    }));
  }),

  create: protectedProcedure.input(valoresSchema).mutation(async ({ ctx, input }) => {
    try {
      const criada = await db.createCompany(ctx.user.id, input);
      return { id: criada!.id };
    } catch (erro) {
      if (erro instanceof db.LimiteDeEmpresas) {
        throw new TRPCError({ code: "BAD_REQUEST", message: erro.message });
      }
      throw erro;
    }
  }),

  rename: protectedProcedure
    .input(alvoSchema.merge(valoresSchema))
    .mutation(async ({ ctx, input }) => {
      const { companyId, ...valores } = input;
      await db.saveCompanyProfile(escopoDoAlvo(ctx, companyId), valores);
      return { success: true } as const;
    }),

  setArchived: protectedProcedure
    .input(alvoSchema.extend({ archived: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      try {
        await db.setCompanyArchived(escopoDoAlvo(ctx, input.companyId), input.archived);
        return { success: true } as const;
      } catch (erro) {
        if (erro instanceof db.UltimaEmpresaAtiva) {
          throw new TRPCError({ code: "BAD_REQUEST", message: erro.message });
        }
        throw erro;
      }
    }),
});
