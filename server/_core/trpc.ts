import { NOT_ADMIN_ERR_MSG, SEM_EMPRESA_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
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
