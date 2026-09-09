import { companyDisplayName } from "@shared/companies";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";

/**
 * As empresas do login.
 *
 * Por enquanto só lista, e a lista tem sempre uma. É a semente: quando a troca
 * de empresa deixar de ser vitrine, criar, arquivar e reordenar entram aqui.
 *
 * O nome de exibição é resolvido no servidor, com o nome do usuário à mão —
 * quem não tem razão social cadastrada não pode aparecer como "Empresa sem
 * nome" numa lista de uma linha só.
 */
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
    }));
  }),
});
