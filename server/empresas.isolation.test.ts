import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCompany,
  ensureDefaultCompany,
  ensureDefaultTransactionCategories,
  esquecerBancoDeTeste,
  getCompanyProfile,
  listCompanies,
  markOnboardingCompleted,
  MAXIMO_DE_EMPRESAS,
  saldosDeCaixaPorEmpresa,
  saveCompanyProfile,
  setCompanyArchived,
  usarBancoDeTesteEm,
} from "./db";
import { DEFAULT_CATEGORY_CATALOG_VERSION, DEFAULT_TRANSACTION_CATEGORIES } from "./defaultCategories";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { COMPANY_COOKIE_NAME, COMPANY_REMEMBER_COOKIE_NAME } from "@shared/const";
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

const TABELAS = ["transactions", "financialAccounts", "transactionCategories", "companyProfiles", "users"] as const;
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
  function contexto(userId: number, empresas: Array<{ id: number; isActive: boolean }>, ativa: number, cookie = "") {
    const gravados: Array<[string, string]> = [];
    const apagados: string[] = [];
    const ctx = {
      user: { id: userId, name: "Ana" },
      companies: empresas,
      activeCompanyId: ativa,
      companyRequestHonored: true,
      req: { protocol: "https", headers: cookie ? { cookie } : {} },
      res: {
        cookie: (nome: string, valor: string) => { gravados.push([nome, valor]); },
        clearCookie: (nome: string) => { apagados.push(nome); },
      },
    } as unknown as TrpcContext;
    return { ctx, gravados, apagados };
  }

  it("abrir uma empresa própria grava o cookie com o id dela", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });

    const { ctx, gravados } = contexto(ANA, await listCompanies(ANA), primeira!.id);
    await appRouter.createCaller(ctx).companies.open({ companyId: segunda!.id });

    expect(gravados).toEqual([[COMPANY_COOKIE_NAME, String(segunda!.id)]]);
  });

  // ── o portão do login: escolher antes de entrar ──────────────────────────

  it("com UMA empresa ativa o login não pergunta nada", async () => {
    /*
     * Perguntar entre uma opção não é escolher, é um clique a mais — e é o
     * caso da maioria das contas e de todo cadastro novo.
     */
    const unica = await createCompany(ANA, { legalName: "Única", tradeName: "", taxId: "" });
    const { ctx } = contexto(ANA, await listCompanies(ANA), unica!.id);

    expect(await appRouter.createCaller(ctx).companies.portao()).toEqual({ ativas: 1, precisaEscolher: false });
  });

  it("com duas ativas pergunta, e a empresa arquivada não conta como opção", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });

    const duas = contexto(ANA, await listCompanies(ANA), primeira!.id);
    expect(await appRouter.createCaller(duas.ctx).companies.portao()).toEqual({ ativas: 2, precisaEscolher: true });

    await setCompanyArchived({ userId: ANA, companyId: segunda!.id }, true);
    const uma = contexto(ANA, await listCompanies(ANA), primeira!.id);
    expect(await appRouter.createCaller(uma.ctx).companies.portao()).toEqual({ ativas: 1, precisaEscolher: false });
  });

  it("quem pediu para ser lembrado neste navegador não é perguntado de novo", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });

    const lembrado = contexto(ANA, await listCompanies(ANA), primeira!.id, `${COMPANY_REMEMBER_COOKIE_NAME}=1`);
    expect(await appRouter.createCaller(lembrado.ctx).companies.portao()).toEqual({ ativas: 2, precisaEscolher: false });

    /* Qualquer outro valor não vale como "sim": só o "1" que o servidor grava. */
    const duvidoso = contexto(ANA, await listCompanies(ANA), primeira!.id, `${COMPANY_REMEMBER_COOKIE_NAME}=talvez`);
    expect(await appRouter.createCaller(duvidoso.ctx).companies.portao()).toEqual({ ativas: 2, precisaEscolher: true });
  });

  it("a lembrança só muda quando a tela de escolha responde a pergunta", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "", taxId: "" });
    const empresas = await listCompanies(ANA);

    /* Pelo menu do perfil: troca a empresa e não opina sobre a lembrança. */
    const menu = contexto(ANA, empresas, primeira!.id);
    await appRouter.createCaller(menu.ctx).companies.open({ companyId: segunda!.id });
    expect(menu.gravados.map(([nome]) => nome)).toEqual([COMPANY_COOKIE_NAME]);
    expect(menu.apagados).toEqual([]);

    /* Na tela de escolha, com a caixa marcada. */
    const marcada = contexto(ANA, empresas, primeira!.id);
    await appRouter.createCaller(marcada.ctx).companies.open({ companyId: segunda!.id, lembrar: true });
    expect(marcada.gravados).toEqual([
      [COMPANY_COOKIE_NAME, String(segunda!.id)],
      [COMPANY_REMEMBER_COOKIE_NAME, "1"],
    ]);

    /* E desmarcada: a lembrança é apagada, e a pergunta volta no próximo login. */
    const desmarcada = contexto(ANA, empresas, primeira!.id, `${COMPANY_REMEMBER_COOKIE_NAME}=1`);
    await appRouter.createCaller(desmarcada.ctx).companies.open({ companyId: segunda!.id, lembrar: false });
    expect(desmarcada.apagados).toEqual([COMPANY_REMEMBER_COOKIE_NAME]);
  });

  it("conciliação sem conta bancária responde um ESTADO, não um erro", async () => {
    /*
     * O `overview` lançava BAD_REQUEST quando não havia conta, e a tela desenhava
     * a barra vermelha de falha para uma conta que estava só começando. Agora
     * responde `semContas`, e este teste é o que impede alguém de voltar a
     * lançar: sem ele, o `throw` antigo passaria em silêncio por toda a suíte.
     */
    const empresa = await createCompany(ANA, { legalName: "Sem conta", tradeName: "", taxId: "" });
    const { ctx } = contexto(ANA, await listCompanies(ANA), empresa!.id);
    const resposta = await appRouter.createCaller(ctx).reconciliation.overview({ year: 2026, month: 9, accountId: null });
    expect(resposta.semContas).toBe(true);

    /* Com uma conta, o pacote inteiro — e o discriminante diz que é o pacote. */
    await c.query(
      "INSERT INTO financialAccounts (userId, companyId, name, initialBalance) VALUES (?, ?, 'Caixa', '0.00')",
      [ANA, empresa!.id],
    );
    const cheia = await appRouter.createCaller(ctx).reconciliation.overview({ year: 2026, month: 9, accountId: null });
    expect(cheia.semContas).toBe(false);
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

  // ── a Fase 7: as duas colunas por empresa ────────────────────────────────

  it("o catálogo novo entra em TODAS as empresas do login, não na primeira", async () => {
    /*
     * O furo que a Fase 7 achou, e o teste que o prova morto.
     *
     * Antes, a versão do catálogo morava em `users`: a função pegava a empresa
     * padrão, inseria as categorias novas nela e carimbava o LOGIN. Da segunda
     * chamada em diante o login já constava atualizado, e a outra empresa
     * ficava sem as categorias novas para sempre.
     *
     * As duas empresas voltam para a versão 0 de propósito — é a forma de uma
     * empresa antiga, criada antes da coluna existir.
     */
    const padaria = await createCompany(ANA, { legalName: "Padaria", tradeName: "Padaria", taxId: "" });
    const oficina = await createCompany(ANA, { legalName: "Oficina", tradeName: "Oficina", taxId: "" });

    await c.query("UPDATE companyProfiles SET categoryDefaultsVersion = 0 WHERE userId = ?", [ANA]);
    await c.query("DELETE FROM transactionCategories WHERE userId = ?", [ANA]);

    const resultado = await ensureDefaultTransactionCategories(ANA);

    expect(resultado.empresas).toBe(2);
    expect(await contarCategorias(c, padaria!.id)).toBe(DEFAULT_TRANSACTION_CATEGORIES.length);
    expect(await contarCategorias(c, oficina!.id)).toBe(DEFAULT_TRANSACTION_CATEGORIES.length);

    const [versoes] = await c.query<(RowDataPacket & { categoryDefaultsVersion: number })[]>(
      "SELECT categoryDefaultsVersion FROM companyProfiles WHERE userId = ?", [ANA],
    );
    expect(versoes.map(l => l.categoryDefaultsVersion)).toEqual([DEFAULT_CATEGORY_CATALOG_VERSION, DEFAULT_CATEGORY_CATALOG_VERSION]);
  });

  it("passar duas vezes não duplica categoria nem ressuscita a desativada", async () => {
    /*
     * É o que torna seguro a coluna nascer em 0 nas empresas que já existem: a
     * primeira passada sobre empresa completa não insere nada, e quem desativou
     * uma categoria de propósito não a vê voltar.
     */
    const empresa = await createCompany(ANA, { legalName: "Mercado", tradeName: "Mercado", taxId: "" });
    const antes = await contarCategorias(c, empresa!.id);

    await c.query("UPDATE transactionCategories SET isActive = 0 WHERE companyId = ? LIMIT 1", [empresa!.id]);
    await c.query("UPDATE companyProfiles SET categoryDefaultsVersion = 0 WHERE id = ?", [empresa!.id]);

    await ensureDefaultTransactionCategories(ANA);

    expect(await contarCategorias(c, empresa!.id)).toBe(antes);
    const [inativas] = await c.query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) n FROM transactionCategories WHERE companyId = ? AND isActive = 0", [empresa!.id],
    );
    expect(Number(inativas[0]!.n)).toBe(1);
  });

  it("o catálogo de uma pessoa não entra na empresa da outra", async () => {
    const daAna = await createCompany(ANA, { legalName: "Da Ana", tradeName: "Ana", taxId: "" });
    const doBruno = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "Bruno", taxId: "" });

    await c.query("UPDATE companyProfiles SET categoryDefaultsVersion = 0");
    const resultado = await ensureDefaultTransactionCategories(ANA);

    expect(resultado.empresas).toBe(1);
    const [versao] = await c.query<(RowDataPacket & { categoryDefaultsVersion: number })[]>(
      "SELECT categoryDefaultsVersion FROM companyProfiles WHERE id = ?", [doBruno!.id],
    );
    /* A empresa do Bruno continua atrasada: a varredura da Ana não a alcança. */
    expect(versao[0]!.categoryDefaultsVersion).toBe(0);
    expect(daAna!.id).not.toBe(doBruno!.id);
  });

  it("concluir as boas-vindas carimba a empresa, e só ela", async () => {
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "1", taxId: "" });
    const segunda = await createCompany(ANA, { legalName: "Segunda", tradeName: "2", taxId: "" });

    await markOnboardingCompleted({ userId: ANA, companyId: primeira!.id });

    const marcada = await getCompanyProfile({ userId: ANA, companyId: primeira!.id });
    const intocada = await getCompanyProfile({ userId: ANA, companyId: segunda!.id });
    expect(marcada?.onboardingCompletedAt).toBeInstanceOf(Date);
    /* A limitação da Fase 6, morta: a segunda empresa continua oferecendo o fluxo. */
    expect(intocada?.onboardingCompletedAt).toBeNull();
  });

  it("concluir as boas-vindas na empresa de outra pessoa não escreve nada", async () => {
    const doBruno = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "Bruno", taxId: "" });

    await expect(markOnboardingCompleted({ userId: ANA, companyId: doBruno!.id })).rejects.toThrow();

    const [linha] = await c.query<(RowDataPacket & { onboardingCompletedAt: Date | null })[]>(
      "SELECT onboardingCompletedAt FROM companyProfiles WHERE id = ?", [doBruno!.id],
    );
    expect(linha[0]!.onboardingCompletedAt).toBeNull();
  });

  it("a empresa padrão de quem não tem nenhuma é NOVA, e não a de outra pessoa", async () => {
    /*
     * Guarda que existia sem prova, achada por varredura de mutação — apagar o
     * `eq(companyProfiles.userId, userId)` de `garantirEmpresaPadrao` deixava a
     * suíte inteira verde.
     *
     * O que ela segura: sem o filtro, o SELECT devolve a PRIMEIRA empresa da
     * tabela, de quem for. Um login sem empresa passaria a "ter" a empresa de
     * outra pessoa no login seguinte — e no cadastro, que chama a mesma função
     * dentro da transação, as categorias-padrão do recém-chegado seriam
     * inseridas dentro da empresa de um estranho.
     *
     * O arreio nunca tinha passado por aqui: todos os outros testes criam
     * empresa por `createCompany`, que não usa este caminho.
     */
    const daAna = await createCompany(ANA, { legalName: "Da Ana", tradeName: "Ana", taxId: "" });

    /* O Bruno existe e não tem empresa nenhuma — é o estado que aciona o caminho. */
    const doBruno = await ensureDefaultCompany(BRUNO);

    expect(doBruno).not.toBe(daAna!.id);
    const [linha] = await c.query<(RowDataPacket & { userId: number })[]>(
      "SELECT userId FROM companyProfiles WHERE id = ?", [doBruno],
    );
    expect(linha[0]!.userId).toBe(BRUNO);
  });

  it("a empresa padrão de quem já tem uma é a que ele já tem", async () => {
    /* O par do de cima: a função não pode criar empresa a cada login. */
    const primeira = await createCompany(ANA, { legalName: "Primeira", tradeName: "1", taxId: "" });
    expect(await ensureDefaultCompany(ANA)).toBe(primeira!.id);
    expect((await listCompanies(ANA)).length).toBe(1);
  });

  // ── o saldo por empresa do modal de troca ─────────────────────────────────

  it("o saldo de cada empresa é o dela: nem soma a irmã, nem a de outro dono", async () => {
    /*
     * O número que decide a escolha no modal. Se ele somar empresas, a pessoa
     * troca de empresa olhando um total que não existe em lugar nenhum — e o
     * modal passa a discordar do painel, que calcula certo.
     *
     * Semeado à mão porque o que se prova aqui é a AGREGAÇÃO, e ela precisa de
     * casos que as funções de criação não produzem: pendente, transferência e
     * lançamento de amanhã têm de ficar fora.
     */
    const padaria = await createCompany(ANA, { legalName: "Padaria", tradeName: "Padaria", taxId: "" });
    const oficina = await createCompany(ANA, { legalName: "Oficina", tradeName: "Oficina", taxId: "" });
    const doBruno = await createCompany(BRUNO, { legalName: "Do Bruno", tradeName: "Bruno", taxId: "" });

    const conta = async (userId: number, companyId: number, nome: string, inicial: string) => {
      const [r] = await c.query<never>(
        "INSERT INTO financialAccounts (userId, companyId, name, initialBalance) VALUES (?, ?, ?, ?)",
        [userId, companyId, nome, inicial],
      );
      return Number((r as unknown as { insertId: number }).insertId);
    };
    const lancar = (userId: number, companyId: number, valor: string, status: string, tipo: string, data: string) =>
      c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, amount, status, account, category)
         VALUES (?, ?, ?, ?, 'x', ?, ?, 'c', 'y')`,
        [userId, companyId, tipo, data, valor, status],
      );

    await conta(ANA, padaria!.id, "Caixa da padaria", "100.00");
    await conta(ANA, oficina!.id, "Caixa da oficina", "500.00");
    await conta(BRUNO, doBruno!.id, "Caixa do Bruno", "9000.00");

    await lancar(ANA, padaria!.id, "30.00", "Pago", "entrada", "2026-09-01");
    await lancar(ANA, oficina!.id, "7.00", "Pago", "entrada", "2026-09-01");
    /* Os três que NÃO entram, um por motivo. */
    await lancar(ANA, padaria!.id, "1000.00", "Pendente", "entrada", "2026-09-01");
    await lancar(ANA, padaria!.id, "2000.00", "Pago", "transferencia", "2026-09-01");
    await lancar(ANA, padaria!.id, "4000.00", "Pago", "entrada", "2026-09-30");
    await lancar(BRUNO, doBruno!.id, "50.00", "Pago", "entrada", "2026-09-01");

    const saldos = await saldosDeCaixaPorEmpresa(ANA, "2026-09-10");

    expect(saldos.get(padaria!.id)).toBe(130);
    expect(saldos.get(oficina!.id)).toBe(507);
    /* A empresa do Bruno não existe no mapa da Ana — não é zero, é ausente. */
    expect(saldos.has(doBruno!.id)).toBe(false);
  });

  it("empresa sem conta e sem lançamento não aparece no mapa — a tela mostra zero", async () => {
    const vazia = await createCompany(ANA, { legalName: "Vazia", tradeName: "Vazia", taxId: "" });
    const saldos = await saldosDeCaixaPorEmpresa(ANA, "2026-09-10");
    expect(saldos.has(vazia!.id)).toBe(false);
  });
});
