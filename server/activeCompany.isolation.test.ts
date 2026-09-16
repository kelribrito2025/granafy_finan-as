import { COMPANY_COOKIE_NAME, COOKIE_NAME } from "@shared/const";
import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSessionToken } from "./auth";
import { createContext } from "./_core/context";
import { escopoDe } from "./escopo";
import { esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O request da Ana pedindo a empresa do Bruno.
 *
 * O módulo puro já prova a regra com uma lista em memória. Este arquivo prova o
 * caminho inteiro: cookie de sessão da Ana, cookie de empresa apontando para a
 * do Bruno, a lista vindo do banco de verdade. É onde um erro de fiação
 * apareceria — passar a lista errada para o `pickActiveCompany`, por exemplo —
 * e o módulo puro sozinho não pegaria.
 */

const ANA = 7_100_001;
const BRUNO = 7_100_002;
/** A terceira pessoa da Fase A: contadora, sem empresa própria, só vínculo. */
const CLARA = 7_100_003;
const EMPRESA_DA_ANA = 7101;
const EMPRESA_DO_BRUNO = 7103;

const TABELAS = ["companyAccess", "companyProfiles", "users"] as const;
const DONOS = [ANA, BRUNO, CLARA] as const;

/** Um request só com os cabeçalhos que o contexto lê. */
function requisicao(cookies: string[]) {
  return {
    req: { headers: { cookie: cookies.join("; ") } },
    res: {},
  } as unknown as Parameters<typeof createContext>[0];
}

describe.runIf(temBancoDeTeste())("a empresa ativa do request", () => {
  let c: Connection;
  let cookieDaAna = "";
  let cookieDaClara = "";

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
    cookieDaAna = `${COOKIE_NAME}=${await createSessionToken(ANA)}`;
    cookieDaClara = `${COOKIE_NAME}=${await createSessionToken(CLARA)}`;
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
    /*
     * Uma empresa por dono — não por escolha, por limite: o
     * company_profiles_user_uidx ainda está de pé e não deixa semear duas para
     * a mesma pessoa. É o mesmo muro da Fase 1, e a resposta é a mesma: não
     * forjo o futuro no schema de teste. O caso de duas empresas do mesmo dono
     * está coberto no módulo puro, com lista em memória; aqui fica o que dá
     * para provar contra o banco que existe.
     *
     * O que importa nesta fase não precisa de duas: o pedido pela empresa
     * ALHEIA já é o caso perigoso, e ele se prova com uma de cada.
     */
    await c.query(
      `INSERT INTO companyProfiles (id, userId, legalName, sortOrder) VALUES
         (?, ?, 'Empresa', 0), (?, ?, 'Empresa', 0)`,
      [EMPRESA_DA_ANA, ANA, EMPRESA_DO_BRUNO, BRUNO],
    );
  });

  it("sem cookie de empresa, resolve para a padrão da pessoa", async () => {
    const ctx = await createContext(requisicao([cookieDaAna]));
    expect(ctx.user?.id).toBe(ANA);
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(true);
    expect(ctx.companies.map(e => e.id)).toEqual([EMPRESA_DA_ANA]);
  });

  it("pedindo a empresa DELA, marca o pedido como atendido", async () => {
    /*
     * Com uma empresa só o id resolvido é o mesmo dos dois lados — o que muda,
     * e é o que este teste fixa, é o SINAL: pedir a própria dá atendido, pedir
     * a alheia dá não atendido. É esse sinal que a tela vai usar para apagar
     * uma seleção velha.
     */
    const ctx = await createContext(requisicao([cookieDaAna, `${COMPANY_COOKIE_NAME}=${EMPRESA_DA_ANA}`]));
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(true);
  });

  it("pedindo a empresa DO BRUNO, NÃO atende — e cai na padrão dela", async () => {
    /*
     * O teste que dá sentido à fase. Se um dia isto ficar verde devolvendo
     * EMPRESA_DO_BRUNO, o produto inteiro está comprometido.
     */
    const ctx = await createContext(requisicao([cookieDaAna, `${COMPANY_COOKIE_NAME}=${EMPRESA_DO_BRUNO}`]));
    expect(ctx.activeCompanyId).not.toBe(EMPRESA_DO_BRUNO);
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(false);
    // E a lista dela nunca contém a dele.
    expect(ctx.companies.map(e => e.id)).not.toContain(EMPRESA_DO_BRUNO);
  });

  it("cookie com empresa inexistente também cai na padrão", async () => {
    const ctx = await createContext(requisicao([cookieDaAna, `${COMPANY_COOKIE_NAME}=999999`]));
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(false);
  });

  it.each(["abc", "", "-3", "1e3", "007x", " 12"])("cookie sujo (%j) não vira pedido", async sujo => {
    /*
     * Lixo não é pedido: é ausência de pedido. Por isso `pedidoAtendido` fica
     * true — não houve nada a atender, e a tela não deve apagar seleção nenhuma
     * por causa de um cookie corrompido.
     */
    const ctx = await createContext(requisicao([cookieDaAna, `${COMPANY_COOKIE_NAME}=${sujo}`]));
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(true);
  });

  it("ponto-e-vírgula no cookie não contrabandeia nada", async () => {
    /*
     * "1;2" não é lixo: o ponto-e-vírgula TERMINA o cookie, então o valor é
     * "1" — um pedido legítimo pela empresa de id 1. Escrevi este caso como
     * "lixo ignorado" e o teste me corrigiu.
     *
     * E o resultado é o que interessa: id 1 não é da Ana, então não é atendido.
     * A defesa não está no formato do cookie, está na lista do dono.
     */
    const ctx = await createContext(requisicao([cookieDaAna, `${COMPANY_COOKIE_NAME}=1;2`]));
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(false);
  });

  it("visita sem sessão não recebe empresa nenhuma", async () => {
    const ctx = await createContext(requisicao([`${COMPANY_COOKIE_NAME}=${EMPRESA_DO_BRUNO}`]));
    expect(ctx.user).toBeNull();
    expect(ctx.activeCompanyId).toBeNull();
    expect(ctx.companies).toEqual([]);
  });

  it("conta sem empresa nenhuma resolve para nulo, não para a de outro", async () => {
    /*
     * A invariante quebrada de propósito. O contexto tem de devolver nulo — e é
     * o protectedProcedure que transforma isso em erro com caminho, em vez de
     * deixar o nulo escorrer para uma consulta.
     */
    await c.query("DELETE FROM companyProfiles WHERE userId = ?", [ANA]);
    const ctx = await createContext(requisicao([cookieDaAna]));
    expect(ctx.user?.id).toBe(ANA);
    expect(ctx.activeCompanyId).toBeNull();
    expect(ctx.companies).toEqual([]);
  });

  /*
   * ── A terceira pessoa ──────────────────────────────────────────────────
   *
   * Até a Fase A, todo teste deste arquivo assumia ator = dono. A Clara é o
   * primeiro caso em que não são: ela não tem empresa própria, e o que ela vê
   * vem de `companyAccess`. Os casos abaixo fixam as três coisas que a fase
   * promete — sem vínculo ela não vê nada; com vínculo ela vê SÓ a liberada;
   * e o escopo dentro dessa empresa aponta para a DONA, não para ela.
   */

  it("contadora sem vínculo não recebe empresa nenhuma — nem a da Ana", async () => {
    const ctx = await createContext(requisicao([cookieDaClara]));
    expect(ctx.user?.id).toBe(CLARA);
    expect(ctx.ator).toBe(CLARA);
    expect(ctx.companies).toEqual([]);
    expect(ctx.activeCompanyId).toBeNull();
    expect(ctx.papel).toBeNull();
  });

  it("com vínculo ativo, vê a empresa da Ana como contadora — e o escopo aponta para a Ana", async () => {
    await c.query(
      "INSERT INTO companyAccess (userId, companyId, role, grantedBy) VALUES (?, ?, 'contador', ?)",
      [CLARA, EMPRESA_DA_ANA, ANA],
    );
    const ctx = await createContext(requisicao([cookieDaClara]));

    expect(ctx.companies.map(e => e.id)).toEqual([EMPRESA_DA_ANA]);
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.ator).toBe(CLARA);
    expect(ctx.papel).toBe("contador");

    /*
     * O teste que dá sentido à Fase A. O `userId` do escopo é o da ANA — o
     * dono do dado —, e não o da Clara, que está logada. É isso que faz as
     * ~96 guardas continuarem certas sem mudar uma linha: elas filtram pelo
     * dono, e o dono continua sendo o dono.
     */
    const escopo = escopoDe(ctx);
    expect(escopo.userId).toBe(ANA);
    expect(escopo.companyId).toBe(EMPRESA_DA_ANA);
    expect(escopo.userId).not.toBe(CLARA);
  });

  it("vínculo revogado não vale — a empresa some da lista no request seguinte", async () => {
    await c.query(
      "INSERT INTO companyAccess (userId, companyId, role, grantedBy, revokedAt) VALUES (?, ?, 'contador', ?, NOW())",
      [CLARA, EMPRESA_DA_ANA, ANA],
    );
    const ctx = await createContext(requisicao([cookieDaClara]));
    expect(ctx.companies).toEqual([]);
    expect(ctx.activeCompanyId).toBeNull();
  });

  it("pedindo a empresa do Bruno pelo cookie, a contadora cai na que lhe foi liberada", async () => {
    /*
     * A mesma recusa que a Ana já tinha, agora para quem entrou por vínculo:
     * o cookie de empresa alheia é ignorado, e o sinal diz que foi.
     */
    await c.query(
      "INSERT INTO companyAccess (userId, companyId, role, grantedBy) VALUES (?, ?, 'contador', ?)",
      [CLARA, EMPRESA_DA_ANA, ANA],
    );
    const ctx = await createContext(requisicao([cookieDaClara, `${COMPANY_COOKIE_NAME}=${EMPRESA_DO_BRUNO}`]));
    expect(ctx.activeCompanyId).toBe(EMPRESA_DA_ANA);
    expect(ctx.companyRequestHonored).toBe(false);
  });

  it("a dona continua dona: papel 'dono' e escopo com o próprio id", async () => {
    // A regressão que importa: para quem já usava o sistema, a Fase A não muda nada.
    const ctx = await createContext(requisicao([cookieDaAna]));
    expect(ctx.ator).toBe(ANA);
    expect(ctx.papel).toBe("dono");
    expect(escopoDe(ctx)).toEqual({ userId: ANA, companyId: EMPRESA_DA_ANA });
  });
});
