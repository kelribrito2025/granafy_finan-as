import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { esquecerBancoDeTeste, usarBancoDeTesteEm } from "./db";
import {
  excluirConta,
  excluirUsuario,
  previaDaExclusaoDaConta,
  previaDaExclusaoDoUsuario,
} from "./admin/exclusoes";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O arreio da única porta de saída de dado do produto.
 *
 * As exclusões do admin são a coisa mais perigosa que existe aqui: elas
 * atravessam empresas de propósito, não passam pelo Escopo e não têm
 * desfazer. O que estes testes cobram é o contrário do resto da suíte —
 * não "apagou?", e sim "apagou SÓ o que foi pedido, e recusou quando
 * devia".
 *
 * A faixa 6.800.00x é desta suíte. Ana é a dona do alvo, Bruno é a
 * testemunha: nada do Bruno pode encostar em nada, em teste nenhum.
 */

const ANA = 6_800_001;
const BRUNO = 6_800_002;
const CHEFE = 6_800_003;

const TABELAS = [
  "transactions",
  "financialAccounts",
  "transactionCategories",
  "userPreferences",
  "companyProfiles",
  "users",
] as const;
const DONOS = [ANA, BRUNO, CHEFE] as const;

async function contar(c: Connection, sql: string, valores: unknown[]) {
  const [linhas] = await c.query<(RowDataPacket & { n: number })[]>(sql, valores);
  return Number(linhas[0]!.n);
}

/** Uma empresa com um pouco de tudo: conta, categoria e dois lançamentos. */
async function semearEmpresa(c: Connection, dono: number, nome: string) {
  const [resultado] = await c.query<RowDataPacket[] & { insertId: number }>(
    "INSERT INTO companyProfiles (userId, legalName, tradeName) VALUES (?, ?, ?)",
    [dono, nome, nome],
  );
  const companyId = (resultado as unknown as { insertId: number }).insertId;
  await c.query(
    "INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, initialBalance) VALUES (?, ?, ?, ?, ?, ?)",
    [dono, companyId, `Conta de ${nome}`, "Banco", "corrente", "100.00"],
  );
  await c.query(
    "INSERT INTO transactionCategories (userId, companyId, name, type) VALUES (?, ?, ?, ?)",
    [dono, companyId, `Vendas de ${nome}`, "entrada"],
  );
  for (const [descricao, valor] of [["Venda", "50.00"], ["Aluguel", "-30.00"]] as const) {
    /* `category` e `account` são NOT NULL sem default: o INSERT tem que trazer as duas. */
    await c.query(
      "INSERT INTO transactions (userId, companyId, description, amount, transactionDate, type, status, category, account) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [dono, companyId, descricao, valor, "2026-09-01", valor.startsWith("-") ? "saida" : "entrada", "Pago", `Vendas de ${nome}`, `Conta de ${nome}`],
    );
  }
  return companyId;
}

describe.runIf(temBancoDeTeste())("as exclusões do admin", () => {
  let c: Connection;
  let empresaDaAna = 0;
  let outraDaAna = 0;
  let empresaDoBruno = 0;

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
    for (const [id, nome] of [[ANA, "Ana"], [BRUNO, "Bruno"], [CHEFE, "Chefe"]] as const) {
      await c.query("INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)", usuarioDeTeste(id, nome));
    }
    await c.query("UPDATE users SET role = 'admin' WHERE id = ?", [CHEFE]);
    await c.query("INSERT INTO userPreferences (userId) VALUES (?)", [ANA]);
    empresaDaAna = await semearEmpresa(c, ANA, "Padaria da Ana");
    outraDaAna = await semearEmpresa(c, ANA, "Consultoria da Ana");
    empresaDoBruno = await semearEmpresa(c, BRUNO, "Oficina do Bruno");
  });

  it("a prévia conta o que some e não apaga nada", async () => {
    const previa = await previaDaExclusaoDaConta(empresaDaAna);

    expect(previa.confirmacao).toBe("Padaria da Ana");
    expect(previa.total).toBe(4); // 2 lançamentos + 1 conta + 1 categoria
    expect(previa.linhas.find(l => l.rotulo === "Lançamentos")?.linhas).toBe(2);
    /* A Ana continua com a outra empresa depois desta. */
    expect(previa.empresasRestantes).toBe(1);
    expect(await contar(c, "SELECT COUNT(*) n FROM transactions WHERE companyId = ?", [empresaDaAna])).toBe(2);
  });

  it("a confirmação errada recusa, e nada é apagado", async () => {
    await expect(excluirConta({ id: empresaDaAna, confirmacao: "padaria da ana", ator: CHEFE }))
      .rejects.toThrow(/confirmação não bate/i);

    expect(await contar(c, "SELECT COUNT(*) n FROM companyProfiles WHERE id = ?", [empresaDaAna])).toBe(1);
    expect(await contar(c, "SELECT COUNT(*) n FROM transactions WHERE companyId = ?", [empresaDaAna])).toBe(2);
  });

  it("apagar a empresa leva o que é dela e não encosta na outra nem no Bruno", async () => {
    const resultado = await excluirConta({ id: empresaDaAna, confirmacao: "Padaria da Ana", ator: CHEFE });

    expect(resultado.total).toBe(4);
    expect(await contar(c, "SELECT COUNT(*) n FROM companyProfiles WHERE id = ?", [empresaDaAna])).toBe(0);
    for (const tabela of ["transactions", "financialAccounts", "transactionCategories"]) {
      expect(await contar(c, `SELECT COUNT(*) n FROM ${tabela} WHERE companyId = ?`, [empresaDaAna])).toBe(0);
      /* A outra empresa da mesma dona fica inteira — o WHERE é por empresa. */
      expect(await contar(c, `SELECT COUNT(*) n FROM ${tabela} WHERE companyId = ?`, [outraDaAna])).toBeGreaterThan(0);
      expect(await contar(c, `SELECT COUNT(*) n FROM ${tabela} WHERE companyId = ?`, [empresaDoBruno])).toBeGreaterThan(0);
    }
    /* O login da Ana não é apagado junto com a empresa dela. */
    expect(await contar(c, "SELECT COUNT(*) n FROM users WHERE id = ?", [ANA])).toBe(1);
  });

  it("o admin do sistema não é apagado pela tela", async () => {
    await expect(excluirUsuario({ id: CHEFE, confirmacao: `teste-${CHEFE}@t.local`, ator: ANA }))
      .rejects.toThrow(/admin do sistema/i);
    expect(await contar(c, "SELECT COUNT(*) n FROM users WHERE id = ?", [CHEFE])).toBe(1);
  });

  it("ninguém apaga o próprio login", async () => {
    await expect(excluirUsuario({ id: ANA, confirmacao: `teste-${ANA}@t.local`, ator: ANA }))
      .rejects.toThrow(/próprio login/i);
    expect(await contar(c, "SELECT COUNT(*) n FROM users WHERE id = ?", [ANA])).toBe(1);
  });

  it("apagar o login leva as empresas dele e deixa o Bruno intacto", async () => {
    const previa = await previaDaExclusaoDoUsuario(ANA);
    expect(previa.empresas.map(e => e.legalName).sort()).toEqual(["Consultoria da Ana", "Padaria da Ana"]);
    expect(previa.admin).toBe(false);

    await excluirUsuario({ id: ANA, confirmacao: `teste-${ANA}@t.local`, ator: CHEFE });

    expect(await contar(c, "SELECT COUNT(*) n FROM users WHERE id = ?", [ANA])).toBe(0);
    expect(await contar(c, "SELECT COUNT(*) n FROM userPreferences WHERE userId = ?", [ANA])).toBe(0);
    for (const tabela of ["companyProfiles", "transactions", "financialAccounts", "transactionCategories"]) {
      expect(await contar(c, `SELECT COUNT(*) n FROM ${tabela} WHERE userId = ?`, [ANA])).toBe(0);
      expect(await contar(c, `SELECT COUNT(*) n FROM ${tabela} WHERE userId = ?`, [BRUNO])).toBeGreaterThan(0);
    }
    expect(await contar(c, "SELECT COUNT(*) n FROM users WHERE id = ?", [BRUNO])).toBe(1);
  });

  it("a empresa que não existe recusa em vez de apagar o que estiver por perto", async () => {
    await expect(previaDaExclusaoDaConta(999_999_999)).rejects.toThrow(/não encontrada/i);
    await expect(excluirConta({ id: 999_999_999, confirmacao: "qualquer", ator: CHEFE })).rejects.toThrow(/não encontrada/i);
    expect(await contar(c, "SELECT COUNT(*) n FROM companyProfiles WHERE userId IN (?, ?)", [ANA, BRUNO])).toBe(3);
  });
});
