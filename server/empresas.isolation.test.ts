import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCompany,
  esquecerBancoDeTeste,
  getCompanyProfile,
  listCompanies,
  MAXIMO_DE_EMPRESAS,
  saveCompanyProfile,
  setCompanyArchived,
  usarBancoDeTesteEm,
} from "./db";
import { DEFAULT_TRANSACTION_CATEGORIES } from "./defaultCategories";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COMPANY_COOKIE_NAME } from "@shared/const";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * A lista de empresas, agora que ela pode ter mais de uma linha.
 *
 * Este é o primeiro arreio da fase em que o dado de duas empresas do mesmo dono
 * é REAL e não semeado à mão: `createCompany` cria de verdade, com as
 * categorias-padrão junto. Até a Fase 5 o `company_profiles_user_uidx` recusava
 * a segunda, e todos os arreios anteriores contornaram isso semeando cadastros
 * sob dois `companyId` com uma linha de empresa só.
 *
 * A guarda que importa aqui é diferente das outras da Fase 4. Lá o alvo era a
 * empresa ATIVA do request; aqui as mutações recebem o `companyId` como
 * PARÂMETRO — a pessoa está mexendo numa empresa que não é a que está aberta. O
 * que separa uma pessoa da empresa de outra é só o `userId` no WHERE, e é ele
 * que estes testes tentam furar.
 */

const ANA = 6_700_001;
const BRUNO = 6_700_002;

const TABELAS = ["transactionCategories", "companyProfiles", "users"] as const;
const DONOS = [ANA, BRUNO] as const;

async function semear(c: Connection) {
  for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"]] as const) {
    await c.query(
      "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
      usuarioDeTeste(id, nome),
    );
  }
}

const contarCategorias = async (c: Connection, companyId: number) => {
  const [linhas] = await c.query<(RowDataPacket & { n: number })[]>(
    "SELECT COUNT(*) n FROM transactionCategories WHERE companyId = ?", [companyId],
  );
  return Number(linhas[0]!.n);
};

describe.runIf(temBancoDeTeste())("as empresas de um login", () => {
  let c: Connection;

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
    await semear(c);
  });

  it("cria a segunda empresa do mesmo login — o que a Fase 1 recusava", async () => {
    const padaria = await createCompany(ANA, { legalName: "Padaria do Bairro", tradeName: "Padaria", taxId: "" });
    const consultoria = await createCompany(ANA, { legalName: "Consultoria XYZ", tradeName: "XYZ", taxId: "" });

    expect(padaria!.id).not.toBe(consultoria!.id);
    const lista = await listCompanies(ANA);
    expect(lista.map(e => e.legalName)).toEqual(["Padaria do Bairro", "Consultoria XYZ"]);
  });

  it("a empresa nova nasce com o catálogo inteiro de categorias, e ele é dela", async () => {
    /*
     * Empresa sem categoria não deixa lançar nada. Quem acabou de criar a
     * segunda empresa não pode descobrir isso na hora de registrar a primeira
     * venda — é o mesmo motivo pelo qual o cadastro de conta já as cria.
     */
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });

    /*
     * O número vem do catálogo, não de um literal. A primeira versão deste teste
     * dizia 50 — que era o que eu lembrava — e o catálogo tem 56. Número
     * decorado em teste envelhece calado: no dia em que alguém acrescentar uma
     * categoria, o teste quebra sem ter achado defeito nenhum.
     */
    expect(await contarCategorias(c, primeira!.id)).toBe(DEFAULT_TRANSACTION_CATEGORIES.length);
    expect(await contarCategorias(c, segunda!.id)).toBe(DEFAULT_TRANSACTION_CATEGORIES.length);

    // Nenhuma categoria ficou sem dona nem com a dona errada.
    const [soltas] = await c.query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) n FROM transactionCategories WHERE userId = ? AND companyId NOT IN (?, ?)",
      [ANA, primeira!.id, segunda!.id],
    );
    expect(Number(soltas[0]!.n)).toBe(0);
  });

  it("o teto recusa a empresa além do limite, e a recusa não deixa lixo", async () => {
    /*
     * As vinte entram por SQL direto: passar por `createCompany` criaria mil
     * categorias só para exercitar uma contagem, e o que está sendo testado é o
     * teto, não a semeadura.
     */
    const valores = Array.from({ length: MAXIMO_DE_EMPRESAS }, (_, i) => [ANA, `Empresa ${i}`]).flat();
    await c.query(
      `INSERT INTO companyProfiles (userId, legalName) VALUES ${Array.from({ length: MAXIMO_DE_EMPRESAS }, () => "(?, ?)").join(", ")}`,
      valores,
    );

    await expect(createCompany(ANA, { legalName: "A que sobra", tradeName: "", taxId: "" }))
      .rejects.toThrow(/já tem 20 empresas/);
    expect(await listCompanies(ANA)).toHaveLength(MAXIMO_DE_EMPRESAS);

    // O Bruno não paga pelo teto da Ana.
    const dele = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "", taxId: "" });
    expect(dele!.userId).toBe(BRUNO);
  });

  // ── a guarda desta leva: o alvo é parâmetro, não a empresa ativa ──────────

  it("renomear a empresa de OUTRO dono não muda nada", async () => {
    const dela = await createCompany(ANA, { legalName: "Da Ana", tradeName: "", taxId: "" });
    const dele = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "", taxId: "" });

    await expect(
      saveCompanyProfile({ userId: ANA, companyId: dele!.id }, { legalName: "Sequestrada" } as never),
    ).rejects.toThrow(/não encontrada/);

    expect((await getCompanyProfile({ userId: BRUNO, companyId: dele!.id }))!.legalName).toBe("Do Bruno");
    expect((await getCompanyProfile({ userId: ANA, companyId: dela!.id }))!.legalName).toBe("Da Ana");
  });

  it("arquivar a empresa de OUTRO dono não arquiva nada", async () => {
    await createCompany(BRUNO, { legalName: "Primeira do Bruno", tradeName: "", taxId: "" });
    const alvo = await createCompany(BRUNO, { legalName: "Segunda do Bruno", tradeName: "", taxId: "" });
    await createCompany(ANA, { legalName: "Da Ana", tradeName: "", taxId: "" });

    await expect(setCompanyArchived({ userId: ANA, companyId: alvo!.id }, true))
      .rejects.toThrow(/não encontrada/);
    expect((await getCompanyProfile({ userId: BRUNO, companyId: alvo!.id }))!.isActive).toBe(true);
  });

  // ── arquivar, e a regra que impede o login de se trancar para fora ────────

  it("arquiva e reativa quando há mais de uma ativa", async () => {
    const fica = await createCompany(ANA, { legalName: "Fica", tradeName: "", taxId: "" });
    const sai = await createCompany(ANA, { legalName: "Sai", tradeName: "", taxId: "" });

    await setCompanyArchived({ userId: ANA, companyId: sai!.id }, true);
    expect((await getCompanyProfile({ userId: ANA, companyId: sai!.id }))!.isActive).toBe(false);
    // Arquivada continua na lista do dono — arquivar não é apagar.
    expect(await listCompanies(ANA)).toHaveLength(2);
    expect((await getCompanyProfile({ userId: ANA, companyId: fica!.id }))!.isActive).toBe(true);

    await setCompanyArchived({ userId: ANA, companyId: sai!.id }, false);
    expect((await getCompanyProfile({ userId: ANA, companyId: sai!.id }))!.isActive).toBe(true);
  });

  it("a última empresa ativa não pode ser arquivada", async () => {
    /*
     * `protectedProcedure` exige uma empresa ativa para qualquer procedure
     * rodar. Um login sem nenhuma não veria tela nenhuma, e o conserto seria
     * pelo banco — então a recusa é aqui, antes de acontecer.
     */
    const unica = await createCompany(ANA, { legalName: "Única", tradeName: "", taxId: "" });
    await expect(setCompanyArchived({ userId: ANA, companyId: unica!.id }, true))
      .rejects.toThrow(/única empresa ativa/);
    expect((await getCompanyProfile({ userId: ANA, companyId: unica!.id }))!.isActive).toBe(true);

    // E com duas, arquivar a primeira deixa a segunda como a última — que também não sai.
    const outra = await createCompany(ANA, { legalName: "Outra", tradeName: "", taxId: "" });
    await setCompanyArchived({ userId: ANA, companyId: unica!.id }, true);
    await expect(setCompanyArchived({ userId: ANA, companyId: outra!.id }, true))
      .rejects.toThrow(/única empresa ativa/);
  });

  // ── a troca: o cookie, e o que ele NÃO consegue pedir ────────────────────

  /** Um contexto de request, com o cookie gravado onde o teste possa ler. */
  function contexto(userId: number, empresas: Array<{ id: number; isActive: boolean }>, ativa: number) {
    const gravados: Array<[string, string]> = [];
    const ctx = {
      user: { id: userId, name: "Ana" },
      companies: empresas,
      activeCompanyId: ativa,
      companyRequestHonored: true,
      req: { protocol: "https", headers: {} },
      res: { cookie: (nome: string, valor: string) => { gravados.push([nome, valor]); }, clearCookie: () => {} },
    } as unknown as TrpcContext;
    return { ctx, gravados };
  }

  it("abrir uma empresa própria grava o cookie com o id dela", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });

    const { ctx, gravados } = contexto(ANA, await listCompanies(ANA), primeira!.id);
    await appRouter.createCaller(ctx).companies.open({ companyId: segunda!.id });

    expect(gravados).toEqual([[COMPANY_COOKIE_NAME, String(segunda!.id)]]);
  });

  it("abrir a empresa de OUTRO dono não grava cookie nenhum", async () => {
    /*
     * A guarda aqui é a lista do request: `ctx.companies` só tem as empresas de
     * quem pediu, então a empresa do Bruno simplesmente não está lá. E mesmo se
     * o cookie fosse gravado à força, `pickActiveCompany` o recusaria a cada
     * request — são duas redes, e esta prova a primeira.
     */
    const dela = await createCompany(ANA, { legalName: "Da Ana", tradeName: "", taxId: "" });
    const dele = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "", taxId: "" });

    const { ctx, gravados } = contexto(ANA, await listCompanies(ANA), dela!.id);
    await expect(appRouter.createCaller(ctx).companies.open({ companyId: dele!.id }))
      .rejects.toThrow(/não encontrada/);
    expect(gravados).toEqual([]);
  });

  it("abrir uma empresa arquivada é recusado — reativar vem primeiro", async () => {
    /*
     * `pickActiveCompany` aceita empresa arquivada de propósito, para quem já
     * estava dentro de uma não ser expulso no meio do trabalho. ESCOLHER uma
     * arquivada é outra coisa, e a recusa é aqui.
     */
    const fica = await createCompany(ANA, { legalName: "Fica", tradeName: "", taxId: "" });
    const guardada = await createCompany(ANA, { legalName: "Guardada", tradeName: "", taxId: "" });
    await setCompanyArchived({ userId: ANA, companyId: guardada!.id }, true);

    const { ctx, gravados } = contexto(ANA, await listCompanies(ANA), fica!.id);
    await expect(appRouter.createCaller(ctx).companies.open({ companyId: guardada!.id }))
      .rejects.toThrow(/Reative a empresa/);
    expect(gravados).toEqual([]);
  });

  it("criar já abre a empresa nova — é isso que impede o onboarding de gravar na errada", async () => {
    /*
     * O defeito que este teste existe para impedir: quem cria uma empresa cai
     * nas boas-vindas dela, e as boas-vindas cadastram a primeira conta e
     * importam o primeiro extrato. Se a empresa aberta continuasse sendo a
     * anterior, esse cadastro e essa importação iriam para A EMPRESA ERRADA.
     */
    const antiga = await createCompany(ANA, { legalName: "Antiga", tradeName: "", taxId: "" });

    const { ctx, gravados } = contexto(ANA, await listCompanies(ANA), antiga!.id);
    const criada = await appRouter.createCaller(ctx).companies.create({ legalName: "Nova", tradeName: "", taxId: "" });

    expect(gravados).toEqual([[COMPANY_COOKIE_NAME, String(criada.id)]]);
    expect(criada.id).not.toBe(antiga!.id);
  });

  it("a lista mostra as ativas primeiro, e cada dono vê só as suas", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });
    await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "", taxId: "" });

    await setCompanyArchived({ userId: ANA, companyId: primeira!.id }, true);

    const daAna = await listCompanies(ANA);
    expect(daAna.map(e => [e.legalName, e.isActive])).toEqual([["Segunda", true], ["Primeira", false]]);
    expect(await listCompanies(BRUNO)).toHaveLength(1);
  });
});
