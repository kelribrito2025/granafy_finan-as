import { z } from "zod";
import { adminProcedure, router } from "../_core/trpc";
import * as consultas from "../admin/consultas";

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
  }),
  usuarios: router({
    listar: adminProcedure
      .input(z.object({ busca: z.string().trim().max(120).default("") }).optional())
      .query(({ input }) => consultas.listarUsuarios({ busca: input?.busca ?? "" })),
  }),
});
