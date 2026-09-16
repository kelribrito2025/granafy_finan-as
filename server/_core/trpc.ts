import { NOT_ADMIN_ERR_MSG, SEM_EMPRESA_ERR_MSG, SOMENTE_LEITURA_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  /*
   * Daqui para baixo, `activeCompanyId` é um número. Nunca nulo.
   *
   * É essa garantia que permite às 79 procedures usarem a empresa ativa sem
   * verificar nulo em cada uma — e, na fase em que as consultas passarem a
   * filtrar por empresa, evita 91 pontos onde um nulo escorreria para dentro de
   * um WHERE e devolveria lista vazia parecendo perda de dado.
   *
   * Chegar aqui sem empresa é violação de invariante: o backfill deu uma a toda
   * conta, o cadastro cria a sua e o login recria a que faltar. Falhar alto é
   * melhor que seguir em frente com nulo.
   */
  if (ctx.activeCompanyId === null || ctx.papel === null) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: SEM_EMPRESA_ERR_MSG });
  }

  /*
   * `ator` e `papel` saem daqui não nulos, junto com a empresa: a Fase B vai
   * construir a tranca de escrita em cima de `papel`, e ela não pode ter que
   * tratar nulo em 50 mutações.
   */
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      activeCompanyId: ctx.activeCompanyId,
      ator: ctx.user.id,
      papel: ctx.papel,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

/**
 * A tranca da escrita — Fase B do acesso do contador.
 *
 * `protectedProcedure` responde "quem é você"; esta responde "você pode mudar
 * isto". São perguntas diferentes e, até a Fase A, tinham a mesma resposta,
 * porque só o dono entrava. Com vínculo, não têm mais.
 *
 * A tranca mora AQUI, e não em cada mutação, por um motivo prático: uma
 * verificação repetida 46 vezes é uma verificação que alguém vai esquecer na
 * quadragésima sétima. No middleware, a mutação nova nasce trancada — e a
 * sentinela em `tranca.test.ts` recusa qualquer `.mutation(` que não passe por
 * aqui, com uma lista fechada de exceções justificadas.
 *
 * `papel` é o papel NA EMPRESA ABERTA, e é só sobre ela que esta tranca fala.
 * A mesma pessoa é dona da própria empresa e contadora na do cliente: o que
 * decide é qual delas está aberta no request.
 *
 * O que NÃO está aqui, de propósito: a leitura. O contador lê tudo o que o dono
 * lê — é a fase inteira. Bloquear leitura seria outro produto.
 */
export const escritaProcedure = protectedProcedure.use(async opts => {
  const { ctx, next } = opts;

  if (ctx.papel !== "dono") {
    throw new TRPCError({ code: "FORBIDDEN", message: SOMENTE_LEITURA_ERR_MSG });
  }

  /*
   * `next()` pelado, sem `{ ctx }`: repassar o contexto aqui o alarga de volta
   * para o tipo da raiz e as mutações perdem o `user` não-nulo que a
   * `requireUser` garantiu — cinco erros de `possibly null` em `transactions.ts`
   * foram o aviso. Esta guarda não acrescenta nada ao contexto; só decide se a
   * chamada segue.
   */
  return next();
});

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
