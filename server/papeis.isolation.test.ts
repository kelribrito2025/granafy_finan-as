import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { promover, rebaixar } from "./admin/papeis";
import { esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import {
  conectarNoBancoDeTeste,
  limparTabelas,
  prepararSchemaDeTeste,
  temBancoDeTeste,
  usuarioDeTeste,
} from "./testDatabase";

/*
 * Promover admin, e a collation que decide se o e-mail é encontrado.
 *
 * `promover` comparava `email.trim()` direto contra a coluna, enquanto todo
 * e-mail entra no banco em minúsculas — cadastro, login e Google passam por
 * `normalizeEmail`. Num MySQL com collation padrão isso passaria despercebido,
 * porque `utf8mb4_general_ci` ignora caixa. O TiDB usa BINÁRIA: "Fulano@x.com"
 * simplesmente não casa com "fulano@x.com", e o admin recebia "nenhum login com
 * esse e-mail" para uma conta que existe.
 *
 * Por isso este arreio precisa de banco de verdade: a diferença mora na
 * collation, e nenhum teste com banco simulado a reproduz. É o mesmo motivo que
 * `testDatabase.ts` dá para a suíte inteira apontar para um schema TiDB.
 */

const ADA = 9_700_001;
const BENTO = 9_700_002;
const CLARA = 9_700_003;

const TABELAS = ["users"] as const;
const DONOS = [ADA, BENTO, CLARA] as const;

describe.runIf(temBancoDeTeste())("promover admin pelo e-mail", () => {
  let conexao: Connection;

  const papelDe = async (id: number) => {
    const [linhas] = await conexao.query("SELECT role FROM users WHERE id = ?", [id]);
    return (linhas as Array<{ role: string }>)[0]?.role ?? null;
  };

  beforeAll(async () => {
    conexao = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(conexao);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(conexao, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await conexao?.end();
  });

  beforeEach(async () => {
    await limparTabelas(conexao, TABELAS, DONOS);
    for (const [id, nome] of [[ADA, "Ada"], [BENTO, "Bento"], [CLARA, "Clara"]] as const) {
      await conexao.query(
        "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
        usuarioDeTeste(id, nome),
      );
    }
    // A Ada é a admin que promove; os outros dois nascem usuários comuns.
    await conexao.query("UPDATE users SET role = 'admin' WHERE id = ?", [ADA]);
  });

  it("promove com o e-mail exato, como sempre funcionou", async () => {
    await promover({ email: `teste-${BENTO}@t.local`, ator: ADA });
    expect(await papelDe(BENTO)).toBe("admin");
  });

  /*
   * O bug. O e-mail está gravado em minúsculas; digitado com maiúsculas, a
   * comparação binária do TiDB não casava e o admin via "nenhum login com esse
   * e-mail" — sobre uma conta que está bem ali.
   */
  it("promove quando o e-mail é digitado com maiúsculas", async () => {
    await promover({ email: `TESTE-${BENTO}@T.LOCAL`, ator: ADA });
    expect(await papelDe(BENTO)).toBe("admin");
  });

  it("promove quando vem com espaços em volta", async () => {
    await promover({ email: `  teste-${BENTO}@t.local  `, ator: ADA });
    expect(await papelDe(BENTO)).toBe("admin");
  });

  it("continua recusando um e-mail que não existe", async () => {
    await expect(
      promover({ email: "ninguem@t.local", ator: ADA }),
    ).rejects.toThrow(/nenhum login/i);
  });

  /*
   * As duas recusas que já existiam não podem ter sido afrouxadas pela
   * normalização: promover é a ação mais fácil de fazer sem querer.
   */
  it("não promove quem já é admin, nem com a caixa trocada", async () => {
    await promover({ email: `teste-${BENTO}@t.local`, ator: ADA });
    await expect(
      promover({ email: `TESTE-${BENTO}@t.local`, ator: ADA }),
    ).rejects.toThrow(/já é admin/i);
  });

  it("o último admin não é rebaixado", async () => {
    await expect(rebaixar({ id: ADA, ator: BENTO })).rejects.toThrow(/último admin/i);
    expect(await papelDe(ADA)).toBe("admin");
  });

  it("rebaixa quando há outro admin de pé", async () => {
    await promover({ email: `teste-${CLARA}@t.local`, ator: ADA });
    await rebaixar({ id: CLARA, ator: ADA });
    expect(await papelDe(CLARA)).toBe("user");
    expect(await papelDe(ADA)).toBe("admin");
  });
});
