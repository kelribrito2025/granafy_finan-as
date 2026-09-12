import { companyDisplayName } from "@shared/companies";
import { COMPANY_COOKIE_NAME, COMPANY_REMEMBER_COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { valorDoCookie, type TrpcContext } from "../_core/context";
import * as db from "../db";
import { userToday } from "../userToday";

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

/** `2026-09-10` → `2026-09-11`, pelo UTC, que é como as datas ISO do produto andam. */
function diaSeguinte(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

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
/** O id que o cookie da empresa carrega agora, sem julgar se é do dono. */
function escolhaNoCookie(ctx: TrpcContext) {
  const cru = valorDoCookie(ctx.req, COMPANY_COOKIE_NAME);
  return cru !== null && /^\d+$/.test(cru) ? Number(cru) : null;
}

/** A pessoa já disse que não quer mais ser perguntada neste navegador. */
function lembrancaLigada(ctx: TrpcContext) {
  return valorDoCookie(ctx.req, COMPANY_REMEMBER_COOKIE_NAME) === "1";
}

/**
 * Liga ou desliga o "lembrar minha escolha".
 *
 * `undefined` não mexe: quem troca de empresa pelo menu do perfil não está
 * respondendo a essa pergunta, e mudar a preferência dela de lambuja seria
 * decidir no lugar da pessoa.
 */
function gravarLembranca(ctx: TrpcContext, lembrar: boolean | undefined) {
  if (lembrar === undefined) return;
  if (lembrar) {
    ctx.res.cookie(COMPANY_REMEMBER_COOKIE_NAME, "1", {
      ...getSessionCookieOptions(ctx.req),
      maxAge: VALIDADE_DA_ESCOLHA,
    });
  } else {
    ctx.res.clearCookie(COMPANY_REMEMBER_COOKIE_NAME, getSessionCookieOptions(ctx.req));
  }
}

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
    /*
     * O saldo vem junto porque a lista é onde se escolhe, e escolher empresa
     * sem ver o caixa dela é escolher no escuro. Uma consulta agregada para
     * todas, não uma por linha.
     *
     * `amanhã` e não `hoje`: o critério é "pago ANTES desta data", então o dia
     * de hoje só entra se a data for a de amanhã. É o mesmo `addOneDay(today)`
     * que o painel usa, e a razão de o saldo do modal bater com o dele.
     */
    const hoje = await userToday(ctx.user.id);
    const [empresas, saldos] = await Promise.all([
      db.listCompanies(ctx.user.id),
      db.saldosDeCaixaPorEmpresa(ctx.user.id, diaSeguinte(hoje)),
    ]);
    const noCookie = escolhaNoCookie(ctx);
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
      /** Empresa sem conta e sem lançamento não aparece na agregação: é zero, não nulo. */
      saldo: saldos.get(empresa.id) ?? 0,
      criadaEm: empresa.createdAt,
      /*
       * FIXO, e assumido como fixo. Papéis de usuário não existem: um login tem
       * acesso total às empresas dele e não há como compartilhar. O rótulo está
       * aqui porque o desenho pede a linha, e "Administradora" é o que é
       * verdade hoje para todo mundo que vê esta tela. No dia em que houver
       * convite e papel, ele passa a sair do banco — e este comentário é o
       * marcador de onde.
       *
       * O ÚLTIMO ACESSO com data ainda não entrou: nenhuma coluna sabe quando
       * alguém abriu uma empresa, e data inventada em tela é o que saiu do
       * cartão de uso dos Planos. O que existe de verdade é `ultimaEscolhida`,
       * logo abaixo — o cookie diz qual foi a última que a pessoa escolheu, e
       * isso não é estimativa. Ter a DATA custa uma coluna e uma escrita no
       * `gravarEscolha`.
       */
      papel: "Administradora" as const,
      /*
       * A última que esta pessoa escolheu NESTE navegador — o cookie, não a
       * padrão. Falso para todas quando ainda não houve escolha, que é
       * exatamente o primeiro login: ali não há "última", e marcar a primeira
       * da lista seria inventar uma memória que não existe.
       */
      ultimaEscolhida: noCookie !== null && empresa.id === noCookie,
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

  /**
   * O portão do login: esta pessoa precisa escolher antes de entrar?
   *
   * Só com mais de uma empresa ATIVA, e só enquanto ela não tiver pedido para
   * ser lembrada neste navegador. Quem tem uma empresa só nunca vê a tela —
   * perguntar entre uma opção não é escolha, é um clique a mais.
   *
   * Responde da lista que o contexto já montou para o request: nenhuma
   * consulta nova no caminho mais quente do produto, que é entrar.
   */
  portao: protectedProcedure.query(({ ctx }) => {
    const ativas = ctx.companies.filter(empresa => empresa.isActive);
    return {
      ativas: ativas.length,
      precisaEscolher: ativas.length > 1 && !lembrancaLigada(ctx),
    };
  }),

  /**
   * Troca a empresa aberta. O cliente limpa o cache e recarrega em seguida.
   *
   * `lembrar` só chega da tela de escolha do login, que é onde a pergunta é
   * feita. Pelo menu do perfil ele vem indefinido e a preferência fica como
   * estava.
   */
  open: protectedProcedure
    .input(alvoSchema.extend({ lembrar: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      gravarEscolha(ctx, input.companyId);
      gravarLembranca(ctx, input.lembrar);
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
