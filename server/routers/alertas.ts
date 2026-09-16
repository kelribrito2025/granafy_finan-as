import { TRPCError } from "@trpc/server";
import { enviarAlertaDaEmpresa } from "../alertas";
import { escritaProcedure, router } from "../_core/trpc";
import { userToday } from "../userToday";

/*
 * Alertas — o botão "Enviar agora" de Preferências.
 *
 * Manda o alerta da empresa aberta para o próprio dono, agora, ignorando a
 * hora e o carimbo do dia. Serve para testar sem esperar as 8h e para quem
 * quer a lista na caixa de entrada neste minuto. É `escritaProcedure` porque
 * dispara e-mail em nome da empresa: o contador não.
 */
export const alertasRouter = router({
  enviarAgora: escritaProcedure.mutation(async ({ ctx }) => {
    const empresa = ctx.companies.find(e => e.id === ctx.activeCompanyId);
    if (!empresa) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
    if (!ctx.user.email) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Sua conta não tem e-mail cadastrado." });
    return enviarAlertaDaEmpresa({
      userId: ctx.user.id,
      email: ctx.user.email,
      nome: ctx.user.name,
      empresa,
      hoje: await userToday(ctx.user.id),
    });
  }),
});
