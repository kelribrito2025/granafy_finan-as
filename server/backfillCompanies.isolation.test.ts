import type { Connection } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  backfillSql,
  EMPRESA_PADRAO_SQL,
  LOGINS_SEM_EMPRESA_SQL,
  nulosSql,
  TABELAS_COM_EMPRESA,
} from "./backfillCompanies";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

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
const DONOS = [COM_EMPRESA, SEM_EMPRESA_COM_DADOS, SEM_EMPRESA_VAZIO] as const;
const TABELAS = ["transactions", "transactionCategories", "companyProfiles", "users"] as const;

/*
 * Toda contagem deste arquivo é DENTRO DA FAIXA, nunca do schema.
 *
 * A versão anterior contava `companyProfiles` e nulos do banco inteiro. Era a
 * única suíte que afirmava sobre estado global num schema compartilhado por
 * cinco arreios — e foi a única que falhou de forma intermitente, sempre nos
 * dois testes que faziam essa contagem.
 *
 * O que estes testes querem provar é "o backfill adota tudo e não duplica". O
 * universo que importa é o semeado aqui, não o schema; escopar não enfraquece a
 * prova, só a torna independente de quem mais está usando o banco.
 */
const naFaixa = (coluna = "userId") => `${coluna} IN (${DONOS.join(", ")})`;

async function semear(c: Connection) {
  const logins = [
    [COM_EMPRESA, "Com empresa"],
    [SEM_EMPRESA_COM_DADOS, "Sem empresa mas com dados"],
    [SEM_EMPRESA_VAZIO, "Sem empresa e sem lancamento"],
  ] as const;
  for (const [id, nome] of logins) {
    await c.query(
      "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
      usuarioDeTeste(id, nome),
    );
  }
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

async function um(c: Connection, sql: string) {
  const [linhas] = await c.query(sql);
  return Number((linhas as Array<{ n: number }>)[0]!.n);
}

/*
 * As contagens são escritas aqui, escopadas, em vez de reescrever por regex o
 * SQL do módulo — os construtores têm formas diferentes (com e sem apelido de
 * tabela) e um `replace` sobre eles quebraria em silêncio na próxima mudança.
 *
 * Que o SQL do módulo é exatamente o que o ritual roda já está provado em
 * `backfillCompanies.test.ts`, por asserção sobre o texto. Aqui se prova o
 * COMPORTAMENTO, dentro da faixa.
 */
const linhasSemEmpresa = (c: Connection, tabela: string) =>
  um(c, `SELECT COUNT(*) AS n FROM \`${tabela}\` WHERE companyId IS NULL AND ${naFaixa()}`);

const linhasComDonoCruzado = (c: Connection, tabela: string) =>
  um(c, `SELECT COUNT(*) AS n FROM \`${tabela}\` x
           JOIN companyProfiles cp ON cp.id = x.companyId
          WHERE cp.userId <> x.userId AND ${naFaixa("x.userId")}`);

const empresasDaFaixa = (c: Connection) =>
  um(c, `SELECT COUNT(*) AS n FROM companyProfiles WHERE ${naFaixa()}`);

describe.runIf(temBancoDeTeste())("ensaio do backfill de companyId", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await semear(c);
  });

  it("sem a empresa padrão, o backfill adota pela metade e não reclama", async () => {
    /*
     * O caso perigoso, travado por teste. Rodar o UPDATE antes de criar as
     * empresas faltantes não dá erro nenhum — só deixa linhas para trás. Se
     * alguém um dia inverter a ordem do ritual, este teste é o que avisa.
     */
    await c.query(backfillSql("transactions"));
    expect(await linhasSemEmpresa(c, "transactions")).toBe(2);
    expect(await linhasSemEmpresa(c, "transactionCategories")).toBe(6);
  });

  it("a empresa padrão cobre todo login que não tem nenhuma", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    const [faltantes] = await c.query(`${LOGINS_SEM_EMPRESA_SQL} AND ${naFaixa("u.id")}`);
    expect(faltantes).toHaveLength(0);
    // Uma por login, nunca duas.
    expect(await empresasDaFaixa(c)).toBe(3);
  });

  it("rodar a empresa padrão duas vezes não cria duplicata", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    await c.query(EMPRESA_PADRAO_SQL);
    expect(await empresasDaFaixa(c)).toBe(3);
  });

  it("na ordem certa: zero órfãs e zero dono cruzado", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    for (const tabela of ["transactions", "transactionCategories"]) {
      await c.query(backfillSql(tabela));
      expect(await linhasSemEmpresa(c, tabela)).toBe(0);
      expect(await linhasComDonoCruzado(c, tabela)).toBe(0);
    }
  });

  it("o UPDATE é repetível: a segunda passada não toca em nada", async () => {
    await c.query(EMPRESA_PADRAO_SQL);
    await c.query(backfillSql("transactions"));
    const [segunda] = await c.query(backfillSql("transactions"));
    expect((segunda as { affectedRows: number }).affectedRows).toBe(0);
    expect(await linhasComDonoCruzado(c, "transactions")).toBe(0);
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
