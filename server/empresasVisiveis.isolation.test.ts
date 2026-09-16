import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { empresasVisiveisPara, esquecerBancoDeTeste, listCompanies, usarBancoDeTesteEm } from "./db";
import {
  conectarNoBancoDeTeste,
  limparTabelas,
  prepararSchemaDeTeste,
  temBancoDeTeste,
  usuarioDeTeste,
} from "./testDatabase";

/*
 * A consulta que virou superfície de segurança.
 *
 * `empresasVisiveisPara` alimenta `ctx.companies`, que alimenta
 * `pickActiveCompany`, que é quem recusa o cookie de empresa alheia em todo
 * request. Uma linha a mais aqui — um vínculo revogado que entrou, o vínculo
 * de outra pessoa, um JOIN sem filtro — e o cookie passa a ser aceito, e
 * todas as guardas de escopo obedecem, porque para elas está tudo certo.
 *
 * Por isso ela tem o mesmo tipo de arreio que as guardas têm, e pela mesma
 * regra de semeadura: as empresas da Ana e do Bruno são IDÊNTICAS de propósito.
 * Se o filtro vazar, o resultado dobra em vez de mudar de cara — e dobrar é
 * trivial de assertar.
 */

const ANA = 9_800_001;
const BRUNO = 9_800_002;
/** Contadora: sem empresa própria, só vínculos. */
const CLARA = 9_800_003;

const PADARIA_DA_ANA = 9801;
const CONSULTORIA_DA_ANA = 9802;
const PADARIA_DO_BRUNO = 9803;

const TABELAS = ["companyAccess", "companyProfiles", "users"] as const;
const DONOS = [ANA, BRUNO, CLARA] as const;

describe.runIf(temBancoDeTeste())("empresasVisiveisPara", () => {
  let c: Connection;

  const vincular = (ator: number, empresa: number, dono: number, revogado = false) =>
    c.query(
      `INSERT INTO companyAccess (userId, companyId, role, grantedBy, revokedAt) VALUES (?, ?, 'contador', ?, ${revogado ? "NOW()" : "NULL"})`,
      [ator, empresa, dono],
    );

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"], [CLARA, "Clara"]] as const) {
      await c.query(
        "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
        usuarioDeTeste(id, nome),
      );
    }
    // Idênticas entre donos, de propósito: só o dono as distingue.
    await c.query(
      `INSERT INTO companyProfiles (id, userId, legalName, sortOrder) VALUES
         (?, ?, 'Padaria', 0), (?, ?, 'Consultoria', 1), (?, ?, 'Padaria', 0)`,
      [PADARIA_DA_ANA, ANA, CONSULTORIA_DA_ANA, ANA, PADARIA_DO_BRUNO, BRUNO],
    );
  });

  it("para o dono, é exatamente listCompanies — a Fase A não muda nada para quem já usa", async () => {
    const visiveis = await empresasVisiveisPara(ANA);
    const proprias = await listCompanies(ANA);
    expect(visiveis.map(e => e.id)).toEqual(proprias.map(e => e.id));
    expect(visiveis.map(e => e.id)).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA]);
  });

  it("sem vínculo, a contadora não vê nada — nem a Padaria idêntica de ninguém", async () => {
    expect(await empresasVisiveisPara(CLARA)).toEqual([]);
  });

  it("com vínculo em UMA das duas da Ana, vê só essa — a outra da mesma dona fica de fora", async () => {
    /*
     * É o caso de uso que justifica uma linha por empresa no vínculo: o dono
     * libera uma das suas e guarda a outra. Se a consulta buscasse "as
     * empresas do dono do vínculo", a Consultoria entraria junto.
     */
    await vincular(CLARA, PADARIA_DA_ANA, ANA);
    const visiveis = await empresasVisiveisPara(CLARA);
    expect(visiveis.map(e => e.id)).toEqual([PADARIA_DA_ANA]);
    expect(visiveis[0]!.userId).toBe(ANA);
  });

  it("vínculo revogado não conta", async () => {
    await vincular(CLARA, PADARIA_DA_ANA, ANA, true);
    expect(await empresasVisiveisPara(CLARA)).toEqual([]);
  });

  it("um revogado e um vivo para a mesma empresa: o vivo vale, e a empresa entra uma vez só", async () => {
    // Revogar é carimbar, não apagar — então a dupla (ator, empresa) repete.
    await vincular(CLARA, PADARIA_DA_ANA, ANA, true);
    await vincular(CLARA, PADARIA_DA_ANA, ANA);
    expect((await empresasVisiveisPara(CLARA)).map(e => e.id)).toEqual([PADARIA_DA_ANA]);
  });

  it("vínculos de outras pessoas não vazam para a contadora", async () => {
    // O Bruno liberou a dele para a ANA (não para a Clara). A Clara não a vê.
    await vincular(ANA, PADARIA_DO_BRUNO, BRUNO);
    expect(await empresasVisiveisPara(CLARA)).toEqual([]);
    // E a Ana passa a ver três: as duas dela mais a do Bruno.
    expect((await empresasVisiveisPara(ANA)).map(e => e.id).sort()).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA, PADARIA_DO_BRUNO].sort());
  });

  it("vínculo para a própria empresa não duplica a linha", async () => {
    await vincular(ANA, PADARIA_DA_ANA, ANA);
    expect((await empresasVisiveisPara(ANA)).map(e => e.id)).toEqual([PADARIA_DA_ANA, CONSULTORIA_DA_ANA]);
  });

  it("a ordem é a de listCompanies: ativas primeiro, depois sortOrder, depois id — mesmo na lista unida", async () => {
    await c.query("UPDATE companyProfiles SET isActive = 0 WHERE id = ?", [PADARIA_DA_ANA]);
    await vincular(CLARA, PADARIA_DA_ANA, ANA);
    await vincular(CLARA, CONSULTORIA_DA_ANA, ANA);
    await vincular(CLARA, PADARIA_DO_BRUNO, BRUNO);
    // Ativas (Consultoria sortOrder 1, Padaria do Bruno sortOrder 0) antes da arquivada.
    expect((await empresasVisiveisPara(CLARA)).map(e => e.id)).toEqual([PADARIA_DO_BRUNO, CONSULTORIA_DA_ANA, PADARIA_DA_ANA]);
  });
});
