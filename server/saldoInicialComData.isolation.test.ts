import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  esquecerBancoDeTeste,
  getAccountBalances,
  saldosDeCaixaPorEmpresa,
  sumPaidBefore,
  sumPaidTransactions,
  sumTransactionsBefore,
  usarBancoDeTesteEm,
} from "./db";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O saldo inicial COM DATA, no banco de verdade.
 *
 * O caso que motivou: a pessoa cadastra R$ 10.000 "em 15/09" — o que o banco
 * mostra hoje — e importa o extrato de 01 a 15/09. Antes, os cinco mil do
 * extrato eram somados em cima dos dez mil que já os continham. Agora só o
 * que vem DEPOIS de 15/09 soma.
 *
 * Cinco somas leem saldo; as cinco estão aqui, contra a mesma semente, para a
 * regra não valer em quatro e faltar na quinta.
 */

const ANA = 9_950_001;
const EMPRESA = 9951;
const escopo = { userId: ANA, companyId: EMPRESA };

const TABELAS = ["transactions", "financialAccounts", "companyProfiles", "users"] as const;

describe.runIf(temBancoDeTeste())("saldo inicial com data", () => {
  let c: Connection;
  let comData = 0;
  let semData = 0;

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
    await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria')", [EMPRESA, ANA]);

    const [a] = await c.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance, initialBalanceDate)
         VALUES (?, ?, 'Com data', 'Banco', 'corrente', '#12B85C', '10000.00', '2026-09-15')`, [ANA, EMPRESA]);
    comData = a.insertId;
    const [b] = await c.query<import("mysql2").ResultSetHeader>(
      `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance, initialBalanceDate)
         VALUES (?, ?, 'Sem data', 'Banco', 'corrente', '#12B85C', '100.00', NULL)`, [ANA, EMPRESA]);
    semData = b.insertId;

    const linhas: Array<[string, string, number, string, number | null]> = [
      // Conta com data 15/09: antes, no dia, depois — e um pendente depois.
      ["entrada", "2026-09-10", 5000, "Pago", comData],
      ["saida", "2026-09-15", -200, "Pago", comData],
      ["entrada", "2026-09-16", 300, "Pago", comData],
      ["saida", "2026-09-20", -50, "Pendente", comData],
      // Conta sem data: tudo soma, como sempre.
      ["entrada", "2026-09-01", 40, "Pago", semData],
      // Sem conta: não tem corte, e continua entrando nas somas da empresa.
      ["entrada", "2026-09-05", 7, "Pago", null],
    ];
    for (const [tipo, data, valor, status, conta] of linhas) {
      await c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, account, amount, status, accountId)
           VALUES (?, ?, ?, ?, 'Teste', 'Categoria', 'Conta', ?, ?, ?)`,
        [ANA, EMPRESA, tipo, data, valor, status, conta],
      );
    }
  });

  it("o saldo por conta ignora o que veio até a data do saldo inicial — inclusive o do próprio dia", async () => {
    const saldos = await getAccountBalances(escopo);
    expect(saldos.get(comData)).toBe(300);
    expect(saldos.get(semData)).toBe(40);
  });

  it("com data-limite, a conta com data pode não ter linha nenhuma — e isso é zero, não erro", async () => {
    const saldos = await getAccountBalances(escopo, "2026-09-15");
    expect(saldos.get(comData)).toBeUndefined();
    expect(saldos.get(semData)).toBe(40);
  });

  it("as somas da empresa aplicam a data de CADA conta, e o lançamento sem conta passa", async () => {
    expect(await sumPaidTransactions(escopo)).toBe(300 + 40 + 7);
    expect(await sumPaidBefore(escopo, "2026-09-17")).toBe(300 + 40 + 7);
    expect(await sumPaidBefore(escopo, "2026-09-16")).toBe(40 + 7);
    // Todos os status, antes da data: o pendente de 20/09 entra aqui.
    expect(await sumTransactionsBefore(escopo, "2026-09-21")).toBe(300 - 50 + 40 + 7);
  });

  it("o caixa do seletor de empresas fecha com o painel: saldo inicial mais o que veio depois", async () => {
    const saldos = await saldosDeCaixaPorEmpresa(ANA, "2026-09-21");
    expect(saldos.get(EMPRESA)).toBe(10000 + 100 + 300 + 40 + 7);
  });

  it("o caso do dia 15: dez mil digitados, extrato de cinco mil importado, saldo continua dez mil", async () => {
    /*
     * É a pergunta original, em números redondos. Sem a regra, a conta
     * mostraria 15.100 aqui.
     */
    await c.query("DELETE FROM transactions WHERE userId = ? AND transactionDate > '2026-09-15'", [ANA]);
    const saldos = await getAccountBalances(escopo);
    expect(10000 + (saldos.get(comData) ?? 0)).toBe(10000);
  });

  it("tirar a data volta ao comportamento antigo: tudo soma", async () => {
    await c.query("UPDATE financialAccounts SET initialBalanceDate = NULL WHERE id = ?", [comData]);
    const saldos = await getAccountBalances(escopo);
    expect(saldos.get(comData)).toBe(5000 - 200 + 300);
    expect(await sumPaidTransactions(escopo)).toBe(5100 + 40 + 7);
  });
});
