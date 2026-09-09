import { SEM_EMPRESA_ERR_MSG, UNAUTHED_ERR_MSG } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

/*
 * O que a pessoa vê quando a invariante quebra.
 *
 * Não deveria acontecer: o backfill deu empresa a toda conta, o cadastro cria a
 * sua e o login recria a que faltar. Mas "não deveria" não é garantia, e a
 * diferença entre um erro que aponta o caminho e um que só grita aparece
 * exatamente no dia em que ninguém está esperando.
 *
 * Este arquivo existe porque a mutação cobrou: apagar a checagem do
 * `protectedProcedure` não deixava teste nenhum vermelho.
 */

const usuario: NonNullable<TrpcContext["user"]> = {
  id: 4242,
  openId: "sem-empresa",
  name: "Conta Órfã",
  email: "orfa@example.com",
  loginMethod: "password",
  role: "user",
  createdAt: new Date("2026-09-09T12:00:00.000Z"),
  updatedAt: new Date("2026-09-09T12:00:00.000Z"),
  lastSignedIn: new Date("2026-09-09T12:00:00.000Z"),
  onboardingCompletedAt: null,
};

function contexto(over: Partial<TrpcContext>): TrpcContext {
  return {
    user: usuario,
    companies: [],
    activeCompanyId: null,
    companyRequestHonored: true,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
    ...over,
  };
}

async function chamar(ctx: TrpcContext) {
  return appRouter.createCaller(ctx).settings.company();
}

describe("login autenticado sem empresa ativa", () => {
  it("é barrado antes de qualquer consulta, com PRECONDITION_FAILED", async () => {
    /*
     * PRECONDITION_FAILED e não INTERNAL_SERVER_ERROR: o estado da conta está
     * errado, não o servidor. E barrar aqui — antes da procedure — é o que
     * impede o nulo de escorrer para dentro de um WHERE na fase seguinte, onde
     * ele devolveria lista vazia parecendo perda de dado.
     */
    await expect(chamar(contexto({}))).rejects.toThrow(TRPCError);
    await expect(chamar(contexto({}))).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("a mensagem aponta um caminho que funciona", async () => {
    await expect(chamar(contexto({}))).rejects.toThrow(SEM_EMPRESA_ERR_MSG);

    /*
     * "Saia e entre de novo" só pode estar escrito porque o login passou a
     * chamar `ensureDefaultCompany`. Antes disso a frase seria conselho inócuo,
     * e mandar tentar algo que não resolve gasta a paciência da pessoa e ainda
     * esconde o defeito.
     *
     * Quem amarra a promessa ao comportamento é
     * `signupCompany.isolation.test.ts`, que entra de verdade com uma conta sem
     * empresa e confere que ela volta. Aqui só se garante que a frase é esta.
     */
    expect(SEM_EMPRESA_ERR_MSG).toContain("Saia e entre de novo");
    expect(SEM_EMPRESA_ERR_MSG).toContain("10003");
  });

  it("visita sem sessão continua recebendo o erro de login, não o de empresa", async () => {
    // A ordem das checagens importa: quem nem entrou não deve ouvir falar de empresa.
    await expect(chamar(contexto({ user: null }))).rejects.toThrow(UNAUTHED_ERR_MSG);
  });

  it("com empresa ativa, a procedure roda normalmente", async () => {
    /*
     * O outro lado da mutação: se a checagem passar a barrar sempre, este teste
     * cai. `settings.company` sem empresa cadastrada devolve o formulário
     * vazio, que é o comportamento de hoje.
     */
    const ctx = contexto({ activeCompanyId: 99, companies: [] });
    await expect(chamar(ctx)).resolves.toHaveProperty("legalName");
  });
});
