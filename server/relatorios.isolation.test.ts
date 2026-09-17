import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acumuladoPorDimensao, esquecerBancoDeTeste, movimentoMensalPorConta, movimentoMensalPorDimensao, temLancamentoPago, usarBancoDeTesteEm } from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O agregado dos Relatórios, no banco de verdade.
 *
 * O que precisa ser provado contra SQL, e não em memória: o `GROUP BY` por
 * conta, mês e tipo; a regra do saldo inicial com data (o que veio até a data
 * já está no saldo e não conta); e que a outra empresa do mesmo login e o
 * lançamento pendente ficam de fora.
 */

const ANA = 9_960_001;
const EMPRESA = 9961;
const OUTRA = 9962;
const escopo = { userId: ANA, companyId: EMPRESA };

const TABELAS = ["transactions", "financialAccounts", "companyProfiles", "users"] as const;

describe.runIf(temBancoDeTeste())("relatórios: movimento mensal por conta", () => {
  let c: Connection;
  let bb = 0;
  let nu = 0;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
    await usarBancoDeTesteEm(process.env.TEST_DATABASE_URL!);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(c, TABELAS, [ANA]);
    await esquecerBancoDeTeste();
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, [ANA]);
    await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", usuarioDeTeste(ANA, "Ana"));
    await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria'), (?, ?, 'Outra')", [EMPRESA, ANA, OUTRA, ANA]);

    const [a] = await c.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance, initialBalanceDate)
         VALUES (?, ?, 'BB', 'Banco do Brasil', 'corrente', '#12B85C', '1000.00', '2026-05-10')`, [ANA, EMPRESA]);
    bb = a.insertId;
    const [b] = await c.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance, initialBalanceDate)
         VALUES (?, ?, 'Nu', '', 'carteira', '#12B85C', '0.00', NULL)`, [ANA, EMPRESA]);
    nu = b.insertId;

    const linhas: Array<[number, string, string, number, string, number | null]> = [
      // BB, saldo inicial em 10/05: o de 10/05 não conta, o de 11/05 conta.
      [EMPRESA, "entrada", "2026-05-10", 500, "Pago", bb],
      [EMPRESA, "entrada", "2026-05-11", 200.5, "Pago", bb],
      [EMPRESA, "saida", "2026-05-20", -80, "Pago", bb],
      [EMPRESA, "saida", "2026-06-02", -30, "Pendente", bb],
      // Transferência BB → Nu em junho: as duas pernas.
      [EMPRESA, "transferencia", "2026-06-15", -300, "Pago", bb],
      [EMPRESA, "transferencia", "2026-06-15", 300, "Pago", nu],
      // Nu, sem data: tudo conta.
      [EMPRESA, "entrada", "2026-04-03", 40, "Pago", nu],
      // Sem conta.
      [EMPRESA, "saida", "2026-04-09", -7, "Pago", null],
      // Outra empresa do mesmo login: fora.
      [OUTRA, "entrada", "2026-05-11", 99_999, "Pago", null],
    ];
    for (const [empresa, tipo, data, valor, status, conta] of linhas) {
      await c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status, accountId)
           VALUES (?, ?, ?, ?, 'Teste', 'Categoria', 'Conta', ?, ?, ?)`,
        [ANA, empresa, tipo, data, valor, status, conta],
      );
    }
  });

  it("agrupa por conta, mês e tipo, só o pago, com a regra do saldo inicial com data", async () => {
    const linhas = await movimentoMensalPorConta(escopo, "2026-04-01", "2026-07-01");
    const ordenadas = [...linhas].sort((x, y) => `${x.mes}${x.accountId}${x.transferencia}`.localeCompare(`${y.mes}${y.accountId}${y.transferencia}`));
    expect(ordenadas).toEqual([
      { accountId: nu, mes: "2026-04", transferencia: false, entradas: 40, saidas: 0 },
      { accountId: null, mes: "2026-04", transferencia: false, entradas: 0, saidas: 7 },
      { accountId: bb, mes: "2026-05", transferencia: false, entradas: 200.5, saidas: 80 },
      { accountId: bb, mes: "2026-06", transferencia: true, entradas: 0, saidas: 300 },
      { accountId: nu, mes: "2026-06", transferencia: true, entradas: 300, saidas: 0 },
    ]);
  });

  it("a janela é fechada no fim: julho de fora, e uma janela vazia devolve lista vazia", async () => {
    expect(await movimentoMensalPorConta(escopo, "2026-07-01", "2026-08-01")).toEqual([]);
  });

  it("temLancamentoPago diz se há relatório para montar, por empresa", async () => {
    expect(await temLancamentoPago(escopo)).toBe(true);
    await c.query("DELETE FROM transactions WHERE companyId = ? AND status = 'Pago'", [EMPRESA]);
    expect(await temLancamentoPago(escopo)).toBe(false);
    expect(await temLancamentoPago({ userId: ANA, companyId: OUTRA })).toBe(true);
  });

  it("por categoria: agrupa por (id, nome) e mês, só o pago e sem transferência", async () => {
    await c.query(
      `UPDATE transactions SET category = 'Mensalidades', categoryId = 77 WHERE companyId = ? AND amount > 0 AND type = 'entrada'`, [EMPRESA]);
    const linhas = await movimentoMensalPorDimensao(escopo, "categoria", "2026-04-01", "2026-07-01");
    const ordenadas = [...linhas].sort((x, y) => `${x.mes}${x.nome}`.localeCompare(`${y.mes}${y.nome}`));
    expect(ordenadas).toEqual([
      { id: null, nome: "Categoria", mes: "2026-04", entradas: 0, saidas: 7, lancamentos: 1 },
      { id: 77, nome: "Mensalidades", mes: "2026-04", entradas: 40, saidas: 0, lancamentos: 1 },
      { id: null, nome: "Categoria", mes: "2026-05", entradas: 0, saidas: 80, lancamentos: 1 },
      { id: 77, nome: "Mensalidades", mes: "2026-05", entradas: 200.5, saidas: 0, lancamentos: 1 },
    ]);
  });

  it("por centro de custo: o movimento da janela e o acumulado antes dela, pela mesma regra", async () => {
    await c.query(
      `UPDATE transactions SET costCenter = 'Operação', costCenterId = 5 WHERE companyId = ? AND accountId = ?`, [EMPRESA, bb]);
    const linhas = await movimentoMensalPorDimensao(escopo, "centroDeCusto", "2026-05-15", "2026-07-01");
    expect(linhas.filter(l => l.nome === "Operação")).toEqual([
      { id: 5, nome: "Operação", mes: "2026-05", entradas: 0, saidas: 80, lancamentos: 1 },
    ]);
    // Antes de 15/05: o de 10/05 está na data do saldo inicial e não conta; sobra o de 11/05.
    const antes = await acumuladoPorDimensao(escopo, "centroDeCusto", "2026-05-15");
    expect(antes.find(a => a.nome === "Operação")).toEqual({ id: 5, nome: "Operação", total: 200.5 });
    expect(antes.find(a => a.nome === "")).toEqual({ id: null, nome: "", total: 40 - 7 });
  });
});
