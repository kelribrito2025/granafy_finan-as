import { escopoDe } from "../escopo";
import { escritaProcedure, protectedProcedure, router } from "../_core/trpc";
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
    /* A empresa ativa sai do contexto — já veio no mesmo lote que o usuário. */
    const empresaAtiva = ctx.companies.find(empresa => empresa.id === ctx.activeCompanyId);

    return {
      show: shouldShowOnboarding({
        /* A coluna da empresa manda; a do login é o legado que responde por quem não a tem. */
        companyCompletedAt: empresaAtiva?.onboardingCompletedAt ?? null,
        completedAt: record?.onboardingCompletedAt ?? null,
        companyCreatedAt: empresaAtiva?.createdAt ?? null,
        ...counts,
      }),
      name: record?.name ?? "",
      /** Criação da conta: o cartão de teste do resumo conta 14 dias a partir daqui. */
      createdAt: record?.createdAt ?? null,
    };
  }),

  /**
   * Vale para "terminei" e para "configurar depois": pular também é decidir.
   *
   * E decide para ESTA empresa, não para o login. Concluir na segunda empresa
   * não cala o assistente na terceira.
   */
  complete: escritaProcedure.mutation(async ({ ctx }) => {
    await db.markOnboardingCompleted(escopoDe(ctx));
    return { success: true } as const;
  }),
});
