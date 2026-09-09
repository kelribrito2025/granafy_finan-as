import { escopoDe } from "../escopo";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { shouldShowOnboarding } from "../onboarding";

/**
 * O primeiro acesso.
 *
 * Só duas operações: perguntar se o fluxo deve aparecer, e dizer que acabou.
 * O progresso passo a passo não é gravado de propósito — o fluxo é de uma
 * sentada, e quem fechar o navegador no meio cai no painel e refaz por
 * Configurações. Guardar estado que dura minutos custaria uma tabela.
 */
export const onboardingRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const [record, counts] = await Promise.all([
      db.getUserRecordById(ctx.user.id),
      db.getOnboardingCounts(escopoDe(ctx)),
    ]);
    return {
      show: shouldShowOnboarding({
        completedAt: record?.onboardingCompletedAt ?? null,
        ...counts,
      }),
      name: record?.name ?? "",
      /** Criação da conta: o cartão de teste do resumo conta 14 dias a partir daqui. */
      createdAt: record?.createdAt ?? null,
    };
  }),

  /** Vale para "terminei" e para "configurar depois": pular também é decidir. */
  complete: protectedProcedure.mutation(async ({ ctx }) => {
    await db.markOnboardingCompleted(ctx.user.id);
    return { success: true } as const;
  }),
});
