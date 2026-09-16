import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { esquecerBancoDeTeste, listarRegistroDeAcessos, registrarAcesso, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O registro de acesso no banco — Fase E.
 *
 * A pergunta de isolamento é a de sempre, com um detalhe: `userId` aqui é o
 * ATOR. A Clara entra na Padaria da Ana e na Padaria do Bruno; cada dono vê
 * só a linha da SUA empresa, embora a atora seja a mesma pessoa.
 */
const ANA = 9_970_001;
const BRUNO = 9_970_002;
const CLARA = 9_970_003;
const PADARIA_DA_ANA = 9971;
const PADARIA_DO_BRUNO = 9972;
const DONOS = [ANA, BRUNO, CLARA] as const;

describe.runIf(temBancoDeTeste())("registro de acesso", () => {
  let c: Connection;
  beforeAll(async () => { c = await conectarNoBancoDeTeste(); await prepararSchemaDeTeste(c); await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!); }, 60_000);
  afterAll(async () => {
    await limparTabelas(c, ["accessLog", "companyProfiles", "users"] as const, DONOS);
    await esquecerBancoDeTeste(); await c?.end();
  });
  beforeEach(async () => {
    await limparTabelas(c, ["accessLog", "companyProfiles", "users"] as const, DONOS);
    for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"], [CLARA, "Clara"]] as const) {
      await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", usuarioDeTeste(id, nome));
    }
    await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria'), (?, ?, 'Padaria')", [PADARIA_DA_ANA, ANA, PADARIA_DO_BRUNO, BRUNO]);
  });

  it("cada dono vê só os eventos das próprias empresas, mesmo com a mesma atora nas duas", async () => {
    await registrarAcesso(CLARA, { companyId: PADARIA_DA_ANA, event: "entrada" });
    await registrarAcesso(CLARA, { companyId: PADARIA_DO_BRUNO, event: "troca" });
    await registrarAcesso(CLARA, { companyId: PADARIA_DA_ANA, event: "exportacao", detail: "DRE" });

    const daAna = await listarRegistroDeAcessos(ANA);
    expect(daAna.map(l => [l.event, l.detail, l.nome])).toEqual([["exportacao", "DRE", "Clara"], ["entrada", null, "Clara"]]);
    expect(daAna.every(l => l.companyId === PADARIA_DA_ANA)).toBe(true);

    const doBruno = await listarRegistroDeAcessos(BRUNO);
    expect(doBruno.map(l => l.event)).toEqual(["troca"]);

    // A Clara não é dona de nada: não vê registro nenhum, nem o que ela mesma fez.
    expect(await listarRegistroDeAcessos(CLARA)).toEqual([]);
  });

  it("o detalhe é cortado em 120 caracteres e o limite de linhas vale", async () => {
    await registrarAcesso(ANA, { companyId: PADARIA_DA_ANA, event: "exportacao", detail: "x".repeat(300) });
    await registrarAcesso(ANA, { companyId: PADARIA_DA_ANA, event: "entrada" });
    const linhas = await listarRegistroDeAcessos(ANA, 1);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]!.event).toBe("entrada");
    expect((await listarRegistroDeAcessos(ANA))[1]!.detail).toHaveLength(120);
  });
});
