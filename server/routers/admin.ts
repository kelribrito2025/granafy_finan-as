import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as consultas from "../admin/consultas";
import * as exclusoes from "../admin/exclusoes";

/*
 * O admin do sistema. Tudo passa pelo `adminProcedure`, que recusa quem não
 * tem `role = admin` — e não exige empresa ativa, porque o admin não olha
 * pela janela de uma empresa, olha o sistema.
 */
export const adminRouter = router({
  resumo: adminProcedure.query(() => consultas.resumoDoSistema()),
  barra: adminProcedure.query(() => consultas.contadoresDaBarra()),
  contas: router({
    listar: adminProcedure
      .input(z.object({
        busca: z.string().trim().max(120).default(""),
        situacao: z.enum(["todas", "ativas", "arquivadas"]).default("todas"),
      }).optional())
      .query(({ input }) => consultas.listarContas({ busca: input?.busca ?? "", situacao: input?.situacao ?? "todas" })),
    detalhe: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => consultas.detalheDaConta(input.id)),
    /*
     * A prévia é uma consulta: diz o que some, tabela a tabela, antes de
     * qualquer pergunta na tela. A exclusão só aceita a razão social
     * digitada por inteiro — ver `admin/exclusoes.ts`.
     */
    previaDaExclusao: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => exclusoes.previaDaExclusaoDaConta(input.id)),
    excluir: adminProcedure
      .input(z.object({ id: z.number().int().positive(), confirmacao: z.string().min(1).max(320) }))
      .mutation(({ ctx, input }) => exclusoes.excluirConta({ id: input.id, confirmacao: input.confirmacao, ator: ctx.user.id })),
  }),
  usuarios: router({
    listar: adminProcedure
      .input(z.object({ busca: z.string().trim().max(120).default("") }).optional())
      .query(({ input }) => consultas.listarUsuarios({ busca: input?.busca ?? "" })),
    previaDaExclusao: adminProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(({ input }) => exclusoes.previaDaExclusaoDoUsuario(input.id)),
    excluir: adminProcedure
      .input(z.object({ id: z.number().int().positive(), confirmacao: z.string().min(1).max(320) }))
      .mutation(({ ctx, input }) => exclusoes.excluirUsuario({ id: input.id, confirmacao: input.confirmacao, ator: ctx.user.id })),
  }),
});
