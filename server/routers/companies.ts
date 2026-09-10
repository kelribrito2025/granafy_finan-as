import { companyDisplayName } from "@shared/companies";
import { COMPANY_COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import type { TrpcContext } from "../_core/context";
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
 *
 * A TROCA é um cookie, e a validação dele não mora aqui: `pickActiveCompany`
 * confere, em cada request, se a empresa pedida pertence a quem pediu — e
 * devolve a padrão quando não pertence, sem erro e sem atender o pedido. Este
 * router só grava a intenção; quem decide se ela vale é o contexto, a cada vez.
 */

/** Um mês. Cookie de sessão faria a empresa voltar à padrão a cada navegador fechado. */
const VALIDADE_DA_ESCOLHA = 30 * 24 * 60 * 60 * 1000;

/**
 * Grava a empresa escolhida no cookie.
 *
 * A conferência de dono acontece contra `ctx.companies`, que é a lista do
 * request — não uma consulta nova. Empresa arquivada é recusada aqui e não no
 * contexto: `pickActiveCompany` aceita arquivada de propósito, para quem já
 * estava dentro de uma não ser expulso no meio do trabalho, mas ESCOLHER uma
 * arquivada é outra coisa.
 */
function gravarEscolha(ctx: TrpcContext, companyId: number) {
  const alvo = ctx.companies.find(empresa => empresa.id === companyId);
  if (!alvo) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada neste acesso." });
  if (!alvo.isActive) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Reative a empresa antes de abri-la." });
  }
  ctx.res.cookie(COMPANY_COOKIE_NAME, String(companyId), {
    ...getSessionCookieOptions(ctx.req),
    maxAge: VALIDADE_DA_ESCOLHA,
  });
}

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

  /**
   * Cria e JÁ ABRE a empresa nova.
   *
   * Abrir é parte de criar, não um passo à parte, e o motivo é de segurança e
   * não de conveniência: quem cria uma empresa vai direto para as boas-vindas
   * dela, e as boas-vindas cadastram a primeira conta bancária e importam o
   * primeiro extrato. Se a empresa ativa continuasse sendo a anterior, esse
   * cadastro e essa importação cairiam NA EMPRESA ERRADA — o pior resultado
   * possível para esta fase inteira.
   */
  create: protectedProcedure.input(valoresSchema).mutation(async ({ ctx, input }) => {
    try {
      const criada = await db.createCompany(ctx.user.id, input);
      ctx.res.cookie(COMPANY_COOKIE_NAME, String(criada!.id), {
        ...getSessionCookieOptions(ctx.req),
        maxAge: VALIDADE_DA_ESCOLHA,
      });
      return { id: criada!.id };
    } catch (erro) {
      if (erro instanceof db.LimiteDeEmpresas) {
        throw new TRPCError({ code: "BAD_REQUEST", message: erro.message });
      }
      throw erro;
    }
  }),

  /** Troca a empresa aberta. O cliente limpa o cache e recarrega em seguida. */
  open: protectedProcedure.input(alvoSchema).mutation(async ({ ctx, input }) => {
    gravarEscolha(ctx, input.companyId);
    return { success: true } as const;
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
