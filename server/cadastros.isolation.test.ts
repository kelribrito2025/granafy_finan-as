import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCategoryRule,
  createCostCenter,
  createFinancialAccount,
  createTransactionCategory,
  deleteCategoryRule,
  deleteCostCenter,
  deleteFinancialAccount,
  deleteTransactionCategory,
  esquecerBancoDeTeste,
  getCategoryRule,
  getCostCenter,
  getCostCenterByName,
  getFinancialAccount,
  getFinancialAccountByName,
  getTransactionCategory,
  getTransactionCategoryByName,
  listCategoryRules,
  listCostCenters,
  listFinancialAccounts,
  listTransactionCategories,
  updateCategoryRule,
  updateCostCenter,
  updateFinancialAccount,
  updateTransactionCategory,
  usarBancoDeTesteEm,
} from "./db";
import type { Escopo } from "./escopo";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste } from "./testDatabase";

/*
 * Os cadastros em DUAS dimensões, e a segunda quase passou batido.
 *
 * A primeira versão deste arreio tinha só duas contas — Ana com a empresa dela,
 * Bruno com a dele — e parecia provar o isolamento por empresa. Não provava. O
 * varredor de mutação apagou a guarda de `companyId` de quinze funções e o
 * arquivo continuou verde: com donos diferentes, a guarda de `userId` sozinha
 * já barra tudo, e a de empresa nunca era exercitada.
 *
 * DUAS CONTAS DIFERENTES PROVAM A GUARDA DE USUÁRIO.
 * SÓ DUAS EMPRESAS DO MESMO DONO PROVAM A GUARDA DE EMPRESA.
 *
 * Então a Ana tem dois conjuntos de cadastros, sob empresas diferentes, e cada
 * função é pedida no escopo de uma empresa buscando a linha da outra — mesmo
 * `userId`, `companyId` diferente. As gêmeas entre Ana e Bruno ficam, para a
 * guarda de usuário não sumir sem ninguém notar.
 *
 * Nota sobre a semeadura: o `company_profiles_user_uidx` ainda impede a Ana de
 * ter duas empresas de verdade — é a quarta vez que esse índice barra um teste,
 * e ele só cai na Fase 5. As guardas não fazem JOIN em `companyProfiles`, então
 * os cadastros são semeados sob dois `companyId` e só um deles tem linha de
 * empresa. É a diferença entre forjar o schema, que eu não faço, e semear dado
 * que o schema aceita, que é isto.
 */

const ANA = 6_100_001;
const BRUNO = 6_100_002;
const EMPRESA_A = 6101; // da Ana, com linha em companyProfiles
const EMPRESA_B = 6102; // da Ana também — sem linha, pelo único da Fase 5
const EMPRESA_C = 6103; // do Bruno

const anaA = { userId: ANA, companyId: EMPRESA_A };
const anaB = { userId: ANA, companyId: EMPRESA_B };
const brunoC = { userId: BRUNO, companyId: EMPRESA_C };

const TABELAS = ["transactions", "categoryRules", "costCenters", "transactionCategories", "financialAccounts", "companyProfiles", "users"] as const;
/** A faixa desta suíte. Nada fora dela é lido nem apagado por este arquivo. */
const DONOS = [ANA, BRUNO] as const;

/** Um conjunto completo de cadastros para um par dono/empresa. */
async function cadastros(c: Connection, userId: number, companyId: number, sufixo: string) {
  await c.query(
    "INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance) VALUES (?, ?, ?, 'Banco', 'corrente', '#12B85C', '0')",
    [userId, companyId, `Conta ${sufixo}`],
  );
  await c.query(
    "INSERT INTO transactionCategories (userId, companyId, name, type, isActive) VALUES (?, ?, ?, 'entrada', true)",
    [userId, companyId, `Categoria ${sufixo}`],
  );
  await c.query(
    "INSERT INTO costCenters (userId, companyId, name, isActive) VALUES (?, ?, ?, true)",
    [userId, companyId, `Centro ${sufixo}`],
  );
  await c.query(
    "INSERT INTO categoryRules (userId, companyId, matchType, matchValue, category, priority, isActive) VALUES (?, ?, 'descricao', ?, 'Vendas', 1, true)",
    [userId, companyId, `regra ${sufixo}`],
  );
}

async function semear(c: Connection) {
  await c.query(
    `INSERT INTO users (id, openId, email, name, loginMethod) VALUES
       (?, 'a', 'ana@t.local', 'Ana', 'password'), (?, 'b', 'bruno@t.local', 'Bruno', 'password')`,
    [ANA, BRUNO],
  );
  await c.query(
    `INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Gêmea'), (?, ?, 'Gêmea')`,
    [EMPRESA_A, ANA, EMPRESA_C, BRUNO],
  );
  await cadastros(c, ANA, EMPRESA_A, "A");
  await cadastros(c, ANA, EMPRESA_B, "B");
  // Do Bruno com os MESMOS nomes da empresa A: gêmeas entre donos diferentes.
  await cadastros(c, BRUNO, EMPRESA_C, "A");
}

const um = async <T>(p: Promise<T[]>) => (await p)[0]!;

describe.runIf(temBancoDeTeste())("isolamento dos cadastros entre empresas", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    // Devolve o banco como encontrou: lixo deixado para trás é o que faz a
    // ordem dos arquivos importar.
    await limparTabelas(c, TABELAS, DONOS);
    await esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await semear(c);
  });

  // ── a dimensão que faltava: mesma pessoa, empresas diferentes ──────────────

  it("listar no escopo de uma empresa não traz os cadastros da outra do MESMO dono", async () => {
    for (const [nome, listar] of [
      ["contas", listFinancialAccounts],
      ["categorias", listTransactionCategories],
      ["centros de custo", listCostCenters],
      ["regras", listCategoryRules],
    ] as const) {
      const deA = await listar(anaA);
      const deB = await listar(anaB);
      expect(deA, nome).toHaveLength(1);
      expect(deB, nome).toHaveLength(1);
      expect(deA[0]!.id, nome).not.toBe(deB[0]!.id);
    }
  });

  it("buscar por ID a linha da outra empresa do mesmo dono devolve nada", async () => {
    const contaB = await um(listFinancialAccounts(anaB));
    const categoriaB = await um(listTransactionCategories(anaB));
    const centroB = await um(listCostCenters(anaB));
    const regraB = await um(listCategoryRules(anaB));

    expect(await getFinancialAccount(anaA, contaB.id)).toBeUndefined();
    expect(await getTransactionCategory(anaA, categoriaB.id)).toBeUndefined();
    expect(await getCostCenter(anaA, centroB.id)).toBeUndefined();
    expect(await getCategoryRule(anaA, regraB.id)).toBeUndefined();
  });

  it("buscar por NOME não atravessa a empresa, nem dentro do mesmo dono", async () => {
    /*
     * O caminho da importação: é assim que texto de extrato vira cadastro. Um
     * nome que case com o da outra empresa põe lançamento na conta errada — e
     * isso não aparece em lista nenhuma, aparece no saldo, semanas depois.
     */
    expect(await getFinancialAccountByName(anaA, "Conta B")).toBeUndefined();
    expect(await getTransactionCategoryByName(anaA, "Categoria B")).toBeUndefined();
    expect(await getCostCenterByName(anaA, "Centro B")).toBeUndefined();

    // E o nome da própria empresa continua achando.
    expect((await getFinancialAccountByName(anaA, "Conta A"))?.companyId).toBe(EMPRESA_A);
  });

  it("editar a linha da outra empresa do mesmo dono não muda nada", async () => {
    const contaB = await um(listFinancialAccounts(anaB));
    const categoriaB = await um(listTransactionCategories(anaB));
    const centroB = await um(listCostCenters(anaB));
    const regraB = await um(listCategoryRules(anaB));

    await updateFinancialAccount(anaA, contaB.id, { name: "Sequestrada" });
    await updateTransactionCategory(anaA, categoriaB.id, { name: "Sequestrada" });
    await updateCostCenter(anaA, centroB.id, { name: "Sequestrada" });
    await updateCategoryRule(anaA, regraB.id, { matchValue: "sequestrada" });

    expect((await um(listFinancialAccounts(anaB))).name).toBe("Conta B");
    expect((await um(listTransactionCategories(anaB))).name).toBe("Categoria B");
    expect((await um(listCostCenters(anaB))).name).toBe("Centro B");
    expect((await um(listCategoryRules(anaB))).matchValue).toBe("regra B");
  });

  it("apagar a linha da outra empresa do mesmo dono não apaga nada", async () => {
    const contaB = await um(listFinancialAccounts(anaB));
    const categoriaB = await um(listTransactionCategories(anaB));
    const centroB = await um(listCostCenters(anaB));
    const regraB = await um(listCategoryRules(anaB));

    await deleteFinancialAccount(anaA, contaB.id);
    await deleteTransactionCategory(anaA, categoriaB.id);
    await deleteCostCenter(anaA, centroB.id);
    await deleteCategoryRule(anaA, regraB.id);

    expect(await listFinancialAccounts(anaB)).toHaveLength(1);
    expect(await listTransactionCategories(anaB)).toHaveLength(1);
    expect(await listCostCenters(anaB)).toHaveLength(1);
    expect(await listCategoryRules(anaB)).toHaveLength(1);
  });

  // ── a dimensão de sempre: donos diferentes ────────────────────────────────

  it("nada do Bruno aparece para a Ana, nem com nomes idênticos", async () => {
    const contaDele = await um(listFinancialAccounts(brunoC));
    expect(await getFinancialAccount(anaA, contaDele.id)).toBeUndefined();

    // "Conta A" existe nos dois; cada um acha a sua.
    const dela = await getFinancialAccountByName(anaA, "Conta A");
    const dele = await getFinancialAccountByName(brunoC, "Conta A");
    expect(dela!.id).not.toBe(dele!.id);
    expect(dela!.userId).toBe(ANA);
    expect(dele!.userId).toBe(BRUNO);
  });

  it("pedir a empresa do Bruno com o userId da Ana não devolve nada", async () => {
    /* Prova que a guarda de usuário continua de pé, e não só a de empresa. */
    const cruzado = { userId: ANA, companyId: EMPRESA_C };
    expect(await listFinancialAccounts(cruzado)).toHaveLength(0);
    expect(await listTransactionCategories(cruzado)).toHaveLength(0);
    expect(await listCostCenters(cruzado)).toHaveLength(0);
    expect(await listCategoryRules(cruzado)).toHaveLength(0);
  });

  // ── defesa em profundidade: a referência cruzada ──────────────────────────

  /*
   * Estas seis guardas não são falsificáveis com dado bem-formado, e vale
   * dizer por quê em vez de fingir que são.
   *
   * As funções de editar e apagar cadastro também mexem em `transactions`:
   * renomeiam o rótulo da conta nos lançamentos, ou recusam a exclusão se o
   * cadastro estiver em uso. O filtro é
   * `(userId, companyId, accountId | categoryId | costCenterId)` — e como o id
   * do cadastro é chave global, ele sozinho já exclui a outra empresa. A guarda
   * de empresa só entra em ação se existir um lançamento de uma empresa
   * apontando para o cadastro de outra.
   *
   * Isso o app não produz hoje. Mas "o app não produz" não é garantia — é
   * exatamente o tipo de suposição que a Fase 6 pode invalidar, quando mover
   * coisa entre empresas virar assunto. Então a corrupção é semeada de
   * propósito, e o teste prova que a defesa defende.
   */
  async function lancamentoCruzado(conta: number, categoria: number, centro: number, companyId: number) {
    await c.query(
      `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status, accountId, categoryId, costCenterId)
         VALUES (?, ?, 'entrada', '2026-09-01', 'Cruzado', 'Categoria A', 'Conta A', 10, 'Pago', ?, ?, ?)`,
      [ANA, companyId, conta, categoria, centro],
    );
  }

  it("renomear cadastro não reescreve o rótulo em lançamento de outra empresa", async () => {
    const contaA = await um(listFinancialAccounts(anaA));
    const categoriaA = await um(listTransactionCategories(anaA));
    const centroA = await um(listCostCenters(anaA));
    // Um lançamento da empresa B apontando para os cadastros da empresa A.
    await lancamentoCruzado(contaA.id, categoriaA.id, centroA.id, EMPRESA_B);

    await updateFinancialAccount(anaA, contaA.id, { name: "Renomeada" });
    await updateTransactionCategory(anaA, categoriaA.id, { name: "Recategorizada" });
    await updateCostCenter(anaA, centroA.id, { name: "Remanejado" });

    const [linhas] = await c.query(
      "SELECT account, category, costCenter FROM transactions WHERE companyId = ?", [EMPRESA_B],
    );
    const cruzado = (linhas as Array<{ account: string; category: string; costCenter: string }>)[0]!;
    expect(cruzado.account).toBe("Conta A");
    expect(cruzado.category).toBe("Categoria A");
    expect(cruzado.costCenter).toBe("");
  });

  it("lançamento de outra empresa não impede apagar o cadastro desta", async () => {
    /*
     * Sem a guarda de empresa, a consulta de "está em uso?" enxerga o
     * lançamento da empresa B e recusa a exclusão de um cadastro da empresa A
     * que ninguém em A usa.
     */
    const contaA = await um(listFinancialAccounts(anaA));
    const categoriaA = await um(listTransactionCategories(anaA));
    const centroA = await um(listCostCenters(anaA));
    await lancamentoCruzado(contaA.id, categoriaA.id, centroA.id, EMPRESA_B);

    expect(await deleteFinancialAccount(anaA, contaA.id)).toBe(true);
    expect(await deleteTransactionCategory(anaA, categoriaA.id)).toBe(true);
    expect(await deleteCostCenter(anaA, centroA.id)).toBe(true);
  });

  it("e o uso DENTRO da própria empresa continua impedindo a exclusão", async () => {
    /* O outro lado: a guarda não pode ter virado "nunca recusa". */
    const contaA = await um(listFinancialAccounts(anaA));
    const categoriaA = await um(listTransactionCategories(anaA));
    const centroA = await um(listCostCenters(anaA));
    await lancamentoCruzado(contaA.id, categoriaA.id, centroA.id, EMPRESA_A);

    expect(await deleteFinancialAccount(anaA, contaA.id)).toBe(false);
    expect(await deleteTransactionCategory(anaA, categoriaA.id)).toBe(false);
    expect(await deleteCostCenter(anaA, centroA.id)).toBe(false);
  });

  // ── os carimbos ───────────────────────────────────────────────────────────

  it("tudo que é criado nasce carimbado com a empresa de quem criou", async () => {
    /*
     * Um INSERT sem carimbo é pior que uma leitura sem guarda: a leitura mostra
     * menos, o insert cria uma linha órfã que a última fase vai encontrar — e
     * que até lá não aparece em busca nenhuma.
     */
    await createFinancialAccount(anaA, { name: "Nova conta", institution: "X", accountType: "corrente", color: "#000", initialBalance: "0" });
    await createTransactionCategory(anaA, { name: "Nova categoria", type: "entrada" });
    await createCostCenter(anaA, { name: "Novo centro" });
    await createCategoryRule(anaA, { matchType: "descricao", matchValue: "nova", category: "Vendas", priority: 2 });

    for (const tabela of ["financialAccounts", "transactionCategories", "costCenters", "categoryRules"]) {
      const [orfas] = await c.query(`SELECT COUNT(*) AS n FROM \`${tabela}\` WHERE companyId IS NULL`);
      expect(Number((orfas as Array<{ n: number }>)[0]!.n), `${tabela} sem carimbo`).toBe(0);
    }

    // O que ela criou na empresa A não encosta na B nem no Bruno.
    expect(await listFinancialAccounts(anaA)).toHaveLength(2);
    expect(await listFinancialAccounts(anaB)).toHaveLength(1);
    expect(await listFinancialAccounts(brunoC)).toHaveLength(1);
  });
});
