import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createLocalUser, esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste } from "./testDatabase";

/*
 * O cadastro fecha o vazamento na fonte.
 *
 * `createLocalUser` insere 50 categorias-padrão na mesma transação da conta.
 * Antes desta fase elas nasciam sem empresa, e foi assim que dois logins
 * "vazios" apareceram no banco com 50 linhas cada — 100 linhas que o backfill
 * teria de adotar e que a última fase não conseguiria pôr em NOT NULL.
 *
 * Este arquivo existe porque a mutação denunciou a falta dele: quebrar o
 * `createLocalUser` de propósito não deixava teste nenhum vermelho. Um conserto
 * sem prova é uma intenção, não um conserto.
 */

const TABELAS = ["transactionCategories", "companyProfiles", "users"] as const;

describe.runIf(temBancoDeTeste())("cadastro cria a empresa junto da conta", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS);
  });

  it("a conta nova nasce com exatamente uma empresa", async () => {
    const usuario = await createLocalUser({
      email: "nova@teste.local",
      name: "Conta Nova",
      passwordHash: "hash",
    });

    const [empresas] = await c.query("SELECT id, userId, legalName, isActive FROM companyProfiles WHERE userId = ?", [usuario.id]);
    const lista = empresas as Array<{ id: number; userId: number; legalName: string; isActive: number }>;
    expect(lista).toHaveLength(1);
    expect(lista[0]!.userId).toBe(usuario.id);
    // Vazia de propósito: o rótulo da tela sai do nome do usuário.
    expect(lista[0]!.legalName).toBe("");
    expect(Boolean(lista[0]!.isActive)).toBe(true);
  });

  it("nenhuma categoria-padrão nasce sem empresa", async () => {
    const usuario = await createLocalUser({
      email: "outra@teste.local",
      name: "Outra Conta",
      passwordHash: "hash",
    });

    const [orfas] = await c.query(
      "SELECT COUNT(*) AS n FROM transactionCategories WHERE userId = ? AND companyId IS NULL",
      [usuario.id],
    );
    expect(Number((orfas as Array<{ n: number }>)[0]!.n)).toBe(0);
  });

  it("as categorias apontam para a empresa daquela conta, e não para outra", async () => {
    /*
     * Duas contas criadas em sequência. Se o carimbo pegasse a empresa errada —
     * a última criada, por exemplo — as categorias da primeira apontariam para
     * a empresa da segunda, e nada mais no sistema denunciaria.
     */
    const primeira = await createLocalUser({ email: "p@teste.local", name: "Primeira", passwordHash: "h" });
    const segunda = await createLocalUser({ email: "s@teste.local", name: "Segunda", passwordHash: "h" });

    const [cruzadas] = await c.query(`
      SELECT COUNT(*) AS n
        FROM transactionCategories t
        JOIN companyProfiles c ON c.id = t.companyId
       WHERE c.userId <> t.userId`);
    expect(Number((cruzadas as Array<{ n: number }>)[0]!.n)).toBe(0);

    for (const usuario of [primeira, segunda]) {
      const [linhas] = await c.query(
        `SELECT DISTINCT c.userId AS dono
           FROM transactionCategories t JOIN companyProfiles c ON c.id = t.companyId
          WHERE t.userId = ?`,
        [usuario.id],
      );
      expect((linhas as Array<{ dono: number }>).map(l => l.dono)).toEqual([usuario.id]);
    }
  });

  it("todas as 50 categorias-padrão da conta carregam a mesma empresa", async () => {
    const usuario = await createLocalUser({ email: "t@teste.local", name: "Terceira", passwordHash: "h" });
    const [linhas] = await c.query(
      "SELECT companyId, COUNT(*) AS n FROM transactionCategories WHERE userId = ? GROUP BY companyId",
      [usuario.id],
    );
    const grupos = linhas as Array<{ companyId: number | null; n: number }>;
    // Um grupo só: nenhuma sobrou de fora, nenhuma pegou empresa diferente.
    expect(grupos).toHaveLength(1);
    expect(grupos[0]!.companyId).not.toBeNull();
    expect(Number(grupos[0]!.n)).toBeGreaterThan(0);
  });
});
