import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { SOMENTE_LEITURA_ERR_MSG } from "@shared/const";
import { escritaProcedure, protectedProcedure, router } from "./_core/trpc";
import { umaEmpresa, umContexto, umUsuario } from "./fixtures";

/*
 * A tranca em funcionamento, sem banco e sem tela.
 *
 * A sentinela ao lado prova que as mutações ESTÃO atrás da tranca. Este arquivo
 * prova o que a tranca FAZ — e são perguntas separadas de propósito: uma lista
 * completa de mutações trancadas por um middleware que deixa todo mundo passar
 * seria uma fase inteira de nada, com dois testes verdes por cima.
 *
 * O router aqui é de mentira, com um espião no corpo, porque o que se mede é se
 * o corpo CHEGA A RODAR. Recusa que acontece depois da escrita não é recusa.
 */

const gravou = vi.fn();

const routerDeTeste = router({
  gravar: escritaProcedure.mutation(() => {
    gravou();
    return { success: true } as const;
  }),
  ler: protectedProcedure.query(({ ctx }) => ({ papel: ctx.papel })),
});

const DONA = umUsuario({ id: 1, name: "Ana" });
const CONTADORA = umUsuario({ id: 2, name: "Clara" });
/** A empresa é da Ana. A Clara só a enxerga porque tem vínculo. */
const PADARIA = umaEmpresa({ id: 10, userId: DONA.id });

const comoDona = () => umContexto({ user: DONA, activeCompanyId: PADARIA.id, companies: [PADARIA] });
const comoContadora = () => umContexto({ user: CONTADORA, activeCompanyId: PADARIA.id, companies: [PADARIA] });

describe("escritaProcedure", () => {
  it("a dona grava — a tranca não pode atrapalhar quem sempre pôde", async () => {
    gravou.mockClear();
    const ctx = comoDona();
    expect(ctx.papel).toBe("dono");

    await expect(routerDeTeste.createCaller(ctx).gravar()).resolves.toEqual({ success: true });
    expect(gravou).toHaveBeenCalledOnce();
  });

  it("a contadora é recusada, e o corpo da mutação NÃO roda", async () => {
    gravou.mockClear();
    const ctx = comoContadora();
    expect(ctx.papel).toBe("contador");

    await expect(routerDeTeste.createCaller(ctx).gravar()).rejects.toThrow(TRPCError);
    expect(gravou).not.toHaveBeenCalled();
  });

  it("a recusa é FORBIDDEN e diz que é somente leitura e a quem pedir", async () => {
    /*
     * O código importa para o cliente: UNAUTHORIZED derruba a sessão e mandaria
     * a contadora para a tela de login por ter clicado em Salvar.
     */
    const erro = await routerDeTeste.createCaller(comoContadora()).gravar().then(() => { throw new Error("deveria recusar"); }, (e: unknown) => e as TRPCError);
    expect(erro.code).toBe("FORBIDDEN");
    expect(erro.message).toBe(SOMENTE_LEITURA_ERR_MSG);
    expect(erro.message).toMatch(/somente leitura/i);
    expect(erro.message).toMatch(/dono da empresa/i);
  });

  it("a leitura continua livre para a contadora — é a fase inteira", async () => {
    await expect(routerDeTeste.createCaller(comoContadora()).ler())
      .resolves.toEqual({ papel: "contador" });
  });

  /*
   * A mesma pessoa, duas empresas, dois papéis. É o caso que mais facilmente se
   * implementa errado: uma tranca guardada por usuário, e não por empresa
   * aberta, trancaria a Clara na empresa dela própria.
   */
  it("a contadora grava normalmente na PRÓPRIA empresa", async () => {
    gravou.mockClear();
    const escritorio = umaEmpresa({ id: 20, userId: CONTADORA.id });
    const ctx = umContexto({
      user: CONTADORA,
      activeCompanyId: escritorio.id,
      companies: [PADARIA, escritorio],
    });
    expect(ctx.papel).toBe("dono");

    await expect(routerDeTeste.createCaller(ctx).gravar()).resolves.toEqual({ success: true });
    expect(gravou).toHaveBeenCalledOnce();
  });

  it("sem papel resolvido, recusa antes da tranca — nunca 'na dúvida, deixa passar'", async () => {
    gravou.mockClear();
    const ctx = umContexto({ user: CONTADORA, activeCompanyId: null, companies: [] });
    expect(ctx.papel).toBeNull();

    await expect(routerDeTeste.createCaller(ctx).gravar()).rejects.toThrow();
    expect(gravou).not.toHaveBeenCalled();
  });
});
