import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  classifyMovement,
  closeReconciliationPeriod,
  createImportBatch,
  createTransactionsForMovement,
  esquecerBancoDeTeste,
  getBankMovement,
  getReconciliationPeriod,
  getStatementBalance,
  groupMovements,
  linkMovement,
  listBankMovements,
  listClosedReconciliationPeriods,
  listReconciliationAudit,
  listReconciliationLinks,
  reopenReconciliationPeriod,
  saveStatementBalance,
  unlinkMovement,
  usarBancoDeTesteEm,
} from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * A conciliação em duas dimensões.
 *
 * O que está em jogo aqui é diferente das duas sub-levas anteriores. Cadastro
 * errado aparece numa lista; lançamento errado entra numa soma. Conciliação
 * errada faz as duas coisas ao mesmo tempo e ainda GRAVA: conciliar é escrever
 * status, vínculo e histórico de uma vez, e um período fechado é uma tranca que
 * outras telas consultam. Uma guarda solta aqui não vaza leitura — vaza
 * escrita, no extrato de outra empresa.
 *
 * Mesma regra dos outros arreios, e é ela que explica a semeadura:
 *
 *   DUAS CONTAS DIFERENTES PROVAM A GUARDA DE USUÁRIO.
 *   SÓ DUAS EMPRESAS DO MESMO DONO PROVAM A GUARDA DE EMPRESA.
 *
 * A Ana tem o mesmo conjunto — conta, lançamento, movimentação, vínculo, saldo
 * declarado, período fechado e histórico — em duas empresas, com os valores da
 * segunda multiplicados por cem. O Bruno fica com uma empresa só, para a guarda
 * de usuário não sumir sem ninguém notar.
 *
 * O truque que torna quase tudo falsificável sem semear corrupção: as funções
 * filtram por id de movimento, de período ou de conta, e esses ids são chaves
 * globais. Pedir NO ESCOPO DA EMPRESA A o id que pertence à B é o bastante —
 * sem a guarda de empresa, o `userId` bate e a linha volta.
 */

const ANA = 6_300_001;
const BRUNO = 6_300_002;
const EMPRESA_A = 6301; // da Ana, com linha em companyProfiles
const EMPRESA_B = 6302; // da Ana também — sem linha, pelo único da Fase 5
const EMPRESA_C = 6303; // do Bruno

const anaA = { userId: ANA, companyId: EMPRESA_A };
const anaB = { userId: ANA, companyId: EMPRESA_B };
const brunoC = { userId: BRUNO, companyId: EMPRESA_C };

const MES = { de: "2026-09-01", ate: "2026-09-30" };

const TABELAS = [
  "reconciliationAudit", "reconciliationLinks", "reconciliationPeriods", "statementBalances",
  "bankMovements", "transactionImportBatches", "transactions", "financialAccounts",
  "companyProfiles", "users",
] as const;
/** A faixa desta suíte. Nada fora dela é lido nem apagado por este arquivo. */
const DONOS = [ANA, BRUNO] as const;

const EMPRESAS = [
  { userId: ANA, companyId: EMPRESA_A, sufixo: "A", fator: 1 },
  { userId: ANA, companyId: EMPRESA_B, sufixo: "B", fator: 100 },
  { userId: BRUNO, companyId: EMPRESA_C, sufixo: "C", fator: 7 },
] as const;

type Semeado = { conta: number; lancamento: number; semPar: number; conciliado: number; periodo: number };

/** Os ids de cada empresa, por `companyId`. */
let porEmpresa: Map<number, Semeado>;
const empresaA = () => porEmpresa.get(EMPRESA_A)!;
const empresaB = () => porEmpresa.get(EMPRESA_B)!;

const marcas = (linhas: number, colunas: number) =>
  Array.from({ length: linhas }, () => `(${Array(colunas).fill("?").join(", ")})`).join(", ");

async function semear(c: Connection) {
  for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"]] as const) {
    await c.query(
      "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
      usuarioDeTeste(id, nome),
    );
  }
  await c.query(
    `INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Gêmea'), (?, ?, 'Gêmea')`,
    [EMPRESA_A, ANA, EMPRESA_C, BRUNO],
  );

  const v = (valor: number, fator: number) => (valor * fator).toFixed(2);

  await c.query(
    `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance)
       VALUES ${marcas(EMPRESAS.length, 7)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, `Conta ${e.sufixo}`, "Banco", "corrente", "#12B85C", "0"]),
  );
  const contas = new Map<number, number>();
  {
    const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number })[]>(
      "SELECT id, companyId FROM financialAccounts WHERE userId IN (?, ?)", [ANA, BRUNO],
    );
    for (const linha of linhas) contas.set(linha.companyId, linha.id);
  }

  await c.query(
    `INSERT INTO transactions (userId, companyId, type, transactionDate, settledAt, description, category, costCenter, amount, account, accountId, status, recurring)
       VALUES ${marcas(EMPRESAS.length, 13)}`,
    EMPRESAS.flatMap(e => [
      e.userId, e.companyId, "entrada", "2026-09-05", "2026-09-05", `Lançamento ${e.sufixo}`,
      "Vendas", "", v(100, e.fator), `Conta ${e.sufixo}`, contas.get(e.companyId), "Pago", false,
    ]),
  );
  /*
   * DOIS movimentos por empresa, um em cada estado. Não é capricho de
   * semeadura: com um só, e ele já nascendo `sem_par`, o `unlinkMovement`
   * sem guarda de empresa escrevia `sem_par` por cima de `sem_par` e o teste
   * não tinha como notar. A varredura encontrou essa guarda viva e estava
   * certa — o arreio é que não distinguia efeito de nenhum efeito.
   */
  await c.query(
    `INSERT INTO bankMovements (userId, companyId, accountId, movementDate, description, contact, amount, status, classificationNote, fingerprint)
       VALUES ${marcas(EMPRESAS.length * 2, 10)}`,
    EMPRESAS.flatMap(e => [
      e.userId, e.companyId, contas.get(e.companyId), "2026-09-05", `Movimento ${e.sufixo}`, "",
      v(100, e.fator), "sem_par", "", `fp-${e.sufixo}`,
      e.userId, e.companyId, contas.get(e.companyId), "2026-09-06", `Conciliado ${e.sufixo}`, "",
      v(200, e.fator), "conciliado", "", `fp-conc-${e.sufixo}`,
    ]),
  );
  await c.query(
    `INSERT INTO statementBalances (userId, companyId, accountId, asOf, balance) VALUES ${marcas(EMPRESAS.length, 5)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, contas.get(e.companyId), "2026-09-30", v(500, e.fator)]),
  );
  /*
   * Um lote de importação por empresa, COM saldo declarado no arquivo.
   *
   * Não é enfeite de semeadura: `getStatementBalance` lê de duas tabelas — o
   * `LEDGERBAL` que veio no arquivo e o número informado à mão — e sem lote
   * nenhum a primeira leitura voltava vazia com guarda ou sem. A varredura
   * encontrou essa guarda viva e estava certa: o arreio não a exercitava.
   */
  await c.query(
    `INSERT INTO transactionImportBatches (id, userId, companyId, fileName, format, accountId, importedCount, duplicateCount, statementBalance, statementBalanceDate)
       VALUES ${marcas(EMPRESAS.length, 10)}`,
    EMPRESAS.flatMap(e => [
      `lote-${e.sufixo}`, e.userId, e.companyId, "extrato.ofx", "ofx", contas.get(e.companyId),
      1, 0, v(900, e.fator), "2026-09-28",
    ]),
  );
  await c.query(
    `INSERT INTO reconciliationPeriods (userId, companyId, accountId, year, month, statementBalance, systemBalance, movementCount, reopenReason)
       VALUES ${marcas(EMPRESAS.length, 9)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, contas.get(e.companyId), 2026, 8, v(500, e.fator), v(500, e.fator), 1, ""]),
  );

  /*
   * Os ids voltam em três consultas, uma por tabela, e não em uma por empresa:
   * a semeadura roda a cada teste, e cada ida ao TiDB custa o ping. Foi o que
   * derrubou o arreio dos lançamentos de 147 s para 66 s.
   */
  porEmpresa = new Map(EMPRESAS.map(e => [e.companyId, { conta: contas.get(e.companyId)!, lancamento: 0, semPar: 0, conciliado: 0, periodo: 0 }]));
  for (const [tabela, campo] of [["transactions", "lancamento"], ["reconciliationPeriods", "periodo"]] as const) {
    const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number })[]>(
      `SELECT id, companyId FROM \`${tabela}\` WHERE userId IN (?, ?)`, [ANA, BRUNO],
    );
    for (const linha of linhas) porEmpresa.get(linha.companyId)![campo] = linha.id;
  }
  {
    const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number; status: string })[]>(
      "SELECT id, companyId, status FROM bankMovements WHERE userId IN (?, ?)", [ANA, BRUNO],
    );
    for (const linha of linhas) {
      porEmpresa.get(linha.companyId)![linha.status === "conciliado" ? "conciliado" : "semPar"] = linha.id;
    }
  }

  // Um vínculo e uma linha de histórico por empresa, agora que os ids existem.
  await c.query(
    `INSERT INTO reconciliationLinks (userId, companyId, movementId, transactionId, amount, origin) VALUES ${marcas(EMPRESAS.length, 6)}`,
    EMPRESAS.flatMap(e => {
      const ids = porEmpresa.get(e.companyId)!;
      return [e.userId, e.companyId, ids.conciliado, ids.lancamento, v(100, e.fator), "manual"];
    }),
  );
  await c.query(
    `INSERT INTO reconciliationAudit (userId, companyId, movementId, action, previousStatus, newStatus, detail) VALUES ${marcas(EMPRESAS.length, 7)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, porEmpresa.get(e.companyId)!.conciliado, "conciliar", "sem_par", "conciliado", `histórico ${e.sufixo}`]),
  );
}

describe.runIf(temBancoDeTeste())("isolamento da conciliação entre empresas", () => {
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

  // ── leitura ───────────────────────────────────────────────────────────────

  it("as movimentações da conta da outra empresa não aparecem", async () => {
    const daA = await listBankMovements(anaA, empresaA().conta, MES.de, MES.ate);
    expect(daA).toHaveLength(2);
    expect(daA.map(m => m.companyId)).toEqual([EMPRESA_A, EMPRESA_A]);
    expect(daA.map(m => m.amount).sort()).toEqual(["100.00", "200.00"]);

    // A conta da empresa B, pedida no escopo da A: sem a guarda, o dono bate e a linha volta.
    expect(await listBankMovements(anaA, empresaB().conta, MES.de, MES.ate)).toEqual([]);
  });

  it("buscar movimentação por id não atravessa a empresa", async () => {
    expect(await getBankMovement(anaA, empresaB().semPar)).toBeUndefined();
    expect((await getBankMovement(anaA, empresaA().semPar))!.companyId).toBe(EMPRESA_A);
  });

  it("os vínculos e o histórico da outra empresa não são lidos", async () => {
    expect(await listReconciliationLinks(anaA, [empresaB().conciliado])).toEqual([]);
    expect(await listReconciliationLinks(anaA, [empresaA().conciliado])).toHaveLength(1);

    expect(await listReconciliationAudit(anaA, empresaB().conciliado)).toEqual([]);
    expect(await listReconciliationAudit(anaA, empresaA().conciliado)).toHaveLength(1);
  });

  it("o saldo declarado é o da empresa pedida", async () => {
    // O informado à mão é mais recente que o do arquivo, e por isso vence.
    expect(await getStatementBalance(anaA, empresaA().conta, "2026-09-30"))
      .toEqual({ balance: 500, asOf: "2026-09-30", origin: "manual" });

    // Só o do arquivo, quando a data pedida é anterior ao informado à mão.
    expect(await getStatementBalance(anaA, empresaA().conta, "2026-09-29"))
      .toEqual({ balance: 900, asOf: "2026-09-28", origin: "arquivo" });

    // A conta da B no escopo da A não devolve nem o informado nem o do arquivo.
    expect(await getStatementBalance(anaA, empresaB().conta, "2026-09-30")).toBeNull();
    expect(await getStatementBalance(anaA, empresaB().conta, "2026-09-29")).toBeNull();
  });

  it("o período fechado da outra empresa não é encontrado nem listado", async () => {
    expect(await getReconciliationPeriod(anaA, empresaB().conta, 2026, 8)).toBeUndefined();
    expect((await getReconciliationPeriod(anaA, empresaA().conta, 2026, 8))!.companyId).toBe(EMPRESA_A);

    const fechados = await listClosedReconciliationPeriods(anaA);
    expect(fechados).toEqual([{ accountId: empresaA().conta, year: 2026, month: 8 }]);
  });

  // ── escrita: o que não pode alcançar o extrato da outra empresa ───────────

  it("conciliar não muda o status de movimentação da outra empresa", async () => {
    await linkMovement(anaA, {
      movementId: empresaB().semPar,
      transactionId: empresaA().lancamento,
      amount: "1.00",
      origin: "manual",
      previousStatus: "sem_par",
      detail: "invasora",
    });

    // A linha de B fica como estava; o vínculo criado nasce na empresa A.
    expect((await getBankMovement(anaB, empresaB().semPar))!.status).toBe("sem_par");
    const naA = await listReconciliationLinks(anaA, [empresaB().semPar]);
    expect(naA).toHaveLength(1);
    expect(naA[0]!.companyId).toBe(EMPRESA_A);
  });

  it("desfazer não apaga o vínculo da outra empresa", async () => {
    await unlinkMovement(anaA, { movementId: empresaB().conciliado, previousStatus: "conciliado", detail: "invasora" });

    expect(await listReconciliationLinks(anaB, [empresaB().conciliado])).toHaveLength(1);
    // O estado que denuncia: sem a guarda, este movimento voltaria para "sem_par".
    expect((await getBankMovement(anaB, empresaB().conciliado))!.status).toBe("conciliado");
  });

  it("classificar não marca movimentação da outra empresa", async () => {
    await classifyMovement(anaA, {
      movementId: empresaB().semPar,
      classification: "pessoal",
      note: "invasora",
      relatedMovementId: null,
      previousStatus: "sem_par",
    });

    expect((await getBankMovement(anaB, empresaB().semPar))!.classification).toBeNull();
  });

  it("criar lançamento a partir de movimentação alheia não concilia a alheia", async () => {
    await createTransactionsForMovement(anaA, {
      movementId: empresaB().semPar,
      previousStatus: "sem_par",
      detail: "invasora",
      parts: [{
        type: "entrada", transactionDate: "2026-09-05", description: "Invasora", category: "Vendas",
        amount: "1.00", account: "Conta A", status: "Pago", recurring: false, linkAmount: "1.00",
      }],
    });

    expect((await getBankMovement(anaB, empresaB().semPar))!.status).toBe("sem_par");
  });

  it("agrupar não recolhe movimentação da outra empresa", async () => {
    await groupMovements(anaA, {
      movementIds: [empresaB().semPar],
      transactionId: empresaA().lancamento,
      amounts: ["1.00"],
      detail: "invasora",
    });

    expect((await getBankMovement(anaB, empresaB().semPar))!.status).toBe("sem_par");
  });

  it("informar saldo grava na empresa do escopo, e não na outra", async () => {
    await saveStatementBalance(anaA, {
      accountId: empresaA().conta, asOf: "2026-09-30", balance: "777.00", accountName: "Conta A",
    });

    expect((await getStatementBalance(anaA, empresaA().conta, "2026-09-30"))!.balance).toBe(777);
    // O saldo da empresa B, na conta dela, continua como estava.
    expect((await getStatementBalance(anaB, empresaB().conta, "2026-09-30"))!.balance).toBe(50_000);
  });

  it("fechar e reabrir período não alcançam o período da outra empresa", async () => {
    await closeReconciliationPeriod(anaA, {
      accountId: empresaA().conta, year: 2026, month: 9,
      statementBalance: "100.00", systemBalance: "100.00", movementCount: 1,
    });
    const novo = await getReconciliationPeriod(anaA, empresaA().conta, 2026, 9);
    expect(novo!.companyId).toBe(EMPRESA_A);

    // Reabrir o período da B a partir do escopo da A não pode surtir efeito.
    await reopenReconciliationPeriod(anaA, { periodId: empresaB().periodo, reason: "invasora", detail: "invasora" });
    expect((await getReconciliationPeriod(anaB, empresaB().conta, 2026, 8))!.reopenedAt).toBeNull();
  });

  // ── importação: o lote inteiro nasce na empresa de quem importou ──────────

  it("importar carimba a empresa nas quatro tabelas do lote", async () => {
    await createImportBatch(anaA, {
      id: "lote-a",
      fileName: "extrato.ofx",
      format: "ofx",
      accountId: empresaA().conta,
      duplicateCount: 0,
      statementBalance: null,
      transactions: [{
        type: "entrada", transactionDate: "2026-09-10", description: "Importada", category: "Vendas",
        amount: "42.00", account: "Conta A", status: "Pago", recurring: false, fingerprint: "fp-lote-a",
      }],
    });

    for (const tabela of ["transactionImportBatches", "transactions", "bankMovements", "reconciliationLinks"] as const) {
      const [linhas] = await c.query<(RowDataPacket & { companyId: number | null })[]>(
        `SELECT companyId FROM \`${tabela}\` WHERE userId = ? AND companyId IS NULL`, [ANA],
      );
      expect(linhas, tabela).toEqual([]);
    }

    const movimentos = await listBankMovements(anaA, empresaA().conta, "2026-09-01", "2026-09-30");
    expect(movimentos.filter(m => m.importBatchId === "lote-a")).toHaveLength(1);
    expect(await listBankMovements(anaB, empresaA().conta, "2026-09-01", "2026-09-30")).toEqual([]);
  });

  it("os índices únicos por dono continuam sem companyId — é isso que torna duas guardas inverificáveis", async () => {
    /*
     * Este teste não prova guarda nenhuma: prova a RAZÃO de duas delas não
     * poderem ser provadas, e avisa no dia em que a razão deixar de valer.
     *
     * `transactions_user_fingerprint_uidx` é único em (userId, fingerprint) e
     * `statement_balances_account_date_uidx` em (userId, accountId, asOf) —
     * nenhum dos dois inclui `companyId`. Enquanto for assim, o banco garante
     * uma linha por dono nesses recortes, e a guarda de empresa dentro de
     * `createImportBatch` e `saveStatementBalance` não tem como mudar
     * resultado: a varredura de mutação as encontra vivas, e está certa.
     *
     * A tentação era apagar as duas guardas para o boletim ficar limpo. Elas
     * ficam: cobrem escrita — vínculo de conciliação e histórico de saldo — e o
     * dia em que esses índices ganharem `companyId`, ou em que a Fase 6
     * permitir mover conta entre empresas, elas passam a valer sozinhas.
     *
     * Quando esse dia chegar, este teste fica vermelho e cobra os dois testes
     * que hoje não existem porque não podem existir.
     */
    const unicos = async (tabela: string) => {
      const [linhas] = await c.query<(RowDataPacket & { Key_name: string; Column_name: string; Non_unique: number })[]>(
        `SHOW INDEX FROM \`${tabela}\``,
      );
      const porNome = new Map<string, string[]>();
      for (const linha of linhas.filter(l => Number(l.Non_unique) === 0)) {
        porNome.set(linha.Key_name, [...(porNome.get(linha.Key_name) ?? []), linha.Column_name]);
      }
      return porNome;
    };

    expect((await unicos("transactions")).get("transactions_user_fingerprint_uidx"))
      .toEqual(["userId", "fingerprint"]);
    expect((await unicos("statementBalances")).get("statement_balances_account_date_uidx"))
      .toEqual(["userId", "accountId", "asOf"]);
  });

  // ── a dimensão de sempre: donos diferentes ────────────────────────────────

  it("nada do Bruno aparece para a Ana, e o escopo cruzado não devolve nada", async () => {
    const dele = porEmpresa.get(EMPRESA_C)!;
    expect(await getBankMovement(anaA, dele.semPar)).toBeUndefined();
    expect(await listReconciliationAudit(anaA, dele.conciliado)).toEqual([]);

    expect(await listBankMovements(brunoC, dele.conta, MES.de, MES.ate)).toHaveLength(2);

    /* Empresa do Bruno com o userId da Ana: prova que a guarda de dono continua de pé. */
    const cruzado = { userId: ANA, companyId: EMPRESA_C };
    expect(await listBankMovements(cruzado, dele.conta, MES.de, MES.ate)).toEqual([]);
    expect(await listClosedReconciliationPeriods(cruzado)).toEqual([]);
  });
});
