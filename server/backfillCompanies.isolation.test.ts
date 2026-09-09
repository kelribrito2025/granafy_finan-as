import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  backfillSql,
  donoCruzadoSql,
  EMPRESA_PADRAO_SQL,
  LOGINS_SEM_EMPRESA_SQL,
  nulosSql,
  TABELAS_COM_EMPRESA,
} from "./backfillCompanies";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste } from "./testDatabase";

/*
 * O ensaio do backfill, versionado.
 *
 * Roda os MESMOS comandos que o ritual vai rodar em produção, contra um
 * espelho da forma dos dados: três donos, um com empresa e dois sem — a mesma
 * situação medida no banco real, onde 8.900 das 29.310 linhas pertencem a
 * logins que ainda não têm empresa nenhuma.
 *
 * O caso que este arquivo existe para travar é o do dono sem empresa. Ele não
 * faz o backfill falhar: o JOIN ignora as linhas dele, sem erro e sem aviso. É
 * a única forma de as 29 mil linhas serem adotadas pela metade e nada apitar.
 */

const COM_EMPRESA = 8_100_001;
const SEM_EMPRESA_COM_DADOS = 8_100_002;
const SEM_EMPRESA_VAZIO = 8_100_003;

async function semear(c: Connection) {
  await c.query(
    `INSERT INTO users (id, openId, email, name, loginMethod) VALUES
       (?, 'a', 'a@t.local', 'Com empresa', 'password'),
       (?, 'b', 'b@t.local', 'Sem empresa mas com dados', 'password'),
       (?, 'c', 'c@t.local', 'Sem empresa e sem lancamento', 'password')`,
    [COM_EMPRESA, SEM_EMPRESA_COM_DADOS, SEM_EMPRESA_VAZIO],
  );
  await c.query("INSERT INTO companyProfiles (id, userId, legalName) VALUES (700, ?, 'Empresa do primeiro')", [COM_EMPRESA]);

  /*
   * Lançamentos IDÊNTICOS entre os dois donos, como no arreio de empresas: se o
   * backfill cruzar donos, o erro não muda de aparência — só a coluna nova
   * denuncia. Por isso a invariante do dono cruzado é a prova, e não a
   * contagem.
   */
  for (const dono of [COM_EMPRESA, SEM_EMPRESA_COM_DADOS]) {
    await c.query(
      `INSERT INTO transactions (userId, type, transactionDate, description, category, account, amount, status)
         VALUES (?, 'entrada', '2026-09-01', 'Pix recebido', 'Vendas', 'Efi Bank', 100, 'Pago'),
                (?, 'saida', '2026-09-01', 'Tarifa Pix', 'Tarifas', 'Efi Bank', -1, 'Pago')`,
      [dono, dono],
    );
  }
  // O login "vazio" não é vazio: o cadastro já lhe deu categorias-padrão.
  for (const dono of [COM_EMPRESA, SEM_EMPRESA_COM_DADOS, SEM_EMPRESA_VAZIO]) {
    await c.query(
      "INSERT INTO transactionCategories (userId, name, type, isActive) VALUES (?, 'Vendas', 'entrada', true), (?, 'Tarifas', 'saida', true)",
      [dono, dono],
    );
  }
}

async function contar(c: Connection, sql: string) {
  const [linhas] = await c.query(sql);
  return Number((linhas as Array<{ n: number }>)[0]!.n);
}

describe.runIf(temBancoDeTeste())("ensaio do backfill de companyId", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
  }, 60_000);

  afterAll(async () => {
    await c?.query("DELETE FROM transactions");
    await c?.query("DELETE FROM transactionCategories");
    await c?.query("DELETE FROM companyProfiles");
    await c?.query("DELETE FROM users");
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, ["transactions", "transactionCategories", "companyProfiles", "users"]);
    await semear(c);
  });

  it("sem a empresa padrão, o backfill adota pela metade e não reclama", async () => {
    /*
     * O caso perigoso, travado por teste. Rodar o UPDATE antes de criar as
     * empresas faltantes não dá erro nenhum — só deixa linhas para trás. Se
     * alguém um dia inverter a ordem do ritual, este teste é o que avisa.
     */
    await c.query(backfillSql("transactions"));
    expect(await contar(c, nulosSql("transactions"))).toBe(2);
    expect(await contar(c, nulosSql("transactionCategories"))).toBe(6);
  });

  it("a empresa padrão cobre todo login que não tem nenhuma", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    const [faltantes] = await c.query(LOGINS_SEM_EMPRESA_SQL);
    expect(faltantes).toHaveLength(0);
    // Uma por login, nunca duas.
    expect(await contar(c, "SELECT COUNT(*) AS n FROM companyProfiles")).toBe(3);
  });

  it("rodar a empresa padrão duas vezes não cria duplicata", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    await c.query(EMPRESA_PADRAO_SQL);
    expect(await contar(c, "SELECT COUNT(*) AS n FROM companyProfiles")).toBe(3);
  });

  it("na ordem certa: zero órfãs e zero dono cruzado", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    for (const tabela of ["transactions", "transactionCategories"]) {
      await c.query(backfillSql(tabela));
      expect(await contar(c, nulosSql(tabela))).toBe(0);
      expect(await contar(c, donoCruzadoSql(tabela))).toBe(0);
    }
  });

  it("o UPDATE é repetível: a segunda passada não toca em nada", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    await c.query(backfillSql("transactions"));
    const [segunda] = await c.query(backfillSql("transactions"));
    expect((segunda as { affectedRows: number }).affectedRows).toBe(0);
    expect(await contar(c, donoCruzadoSql("transactions"))).toBe(0);
  });

  it("cada linha fica com a empresa do seu próprio dono", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    await c.query(backfillSql("transactions"));
    const [linhas] = await c.query(
      `SELECT x.userId, c.userId AS donoDaEmpresa FROM transactions x JOIN companyProfiles c ON c.id = x.companyId`,
    );
    for (const linha of linhas as Array<{ userId: number; donoDaEmpresa: number }>) {
      expect(linha.donoDaEmpresa).toBe(linha.userId);
    }
    expect(linhas).toHaveLength(4);
  });

  it("as treze tabelas do backfill existem no schema", async () => {
    /*
     * Um nome errado na lista só apareceria no meio do ritual, com o backup de
     * horas atrás. Aqui aparece agora.
     */
    for (const tabela of TABELAS_COM_EMPRESA) {
      await expect(c.query(nulosSql(tabela))).resolves.toBeDefined();
    }
  });
});
