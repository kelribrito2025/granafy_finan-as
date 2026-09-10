import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  esquecerBancoDeTeste,
  getAccountImportSummary,
  listImportBatches,
  usarBancoDeTesteEm,
} from "./db";
import { attachmentPrefix, ownsAttachment } from "./attachments";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * A importação em duas dimensões — a última sub-leva da fase.
 *
 * Sobraram duas guardas em `transactionImportBatches`: o histórico de lotes e o
 * resumo por conta. As outras da tabela entraram na sub-leva 3, porque viviam
 * dentro de `createImportBatch` e de `getStatementBalance` e não fazia sentido
 * deixar meia função convertida.
 *
 * Mesma regra dos outros arreios:
 *
 *   DUAS CONTAS DIFERENTES PROVAM A GUARDA DE USUÁRIO.
 *   SÓ DUAS EMPRESAS DO MESMO DONO PROVAM A GUARDA DE EMPRESA.
 *
 * O terceiro item do plano desta sub-leva era o prefixo dos anexos. Ele NÃO
 * muda, e o último teste deste arquivo diz por quê.
 */

const ANA = 6_500_001;
const BRUNO = 6_500_002;
const EMPRESA_A = 6501; // da Ana, com linha em companyProfiles
const EMPRESA_B = 6502; // da Ana também — sem linha, pelo único da Fase 5
const EMPRESA_C = 6503; // do Bruno

const anaA = { userId: ANA, companyId: EMPRESA_A };
const anaB = { userId: ANA, companyId: EMPRESA_B };
const brunoC = { userId: BRUNO, companyId: EMPRESA_C };

const TABELAS = ["transactionImportBatches", "financialAccounts", "companyProfiles", "users"] as const;
/** A faixa desta suíte. Nada fora dela é lido nem apagado por este arquivo. */
const DONOS = [ANA, BRUNO] as const;

const EMPRESAS = [
  { userId: ANA, companyId: EMPRESA_A, sufixo: "A", lotes: 2 },
  { userId: ANA, companyId: EMPRESA_B, sufixo: "B", lotes: 5 },
  { userId: BRUNO, companyId: EMPRESA_C, sufixo: "C", lotes: 3 },
] as const;

/** A conta de cada empresa, por `companyId`. */
let contas: Map<number, number>;

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
  await c.query(
    `INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance)
       VALUES ${marcas(EMPRESAS.length, 7)}`,
    EMPRESAS.flatMap(e => [e.userId, e.companyId, `Conta ${e.sufixo}`, "Banco", "corrente", "#12B85C", "0"]),
  );

  contas = new Map();
  const [linhas] = await c.query<(RowDataPacket & { id: number; companyId: number })[]>(
    "SELECT id, companyId FROM financialAccounts WHERE userId IN (?, ?)", [ANA, BRUNO],
  );
  for (const linha of linhas) contas.set(linha.companyId, linha.id);

  /*
   * Uma quantidade DIFERENTE de lotes por empresa. É o que faz a contagem ser
   * prova: se a guarda cair, a empresa A passa a enxergar sete lotes em vez de
   * dois, e não há como o número coincidir por acaso.
   */
  const lotes = EMPRESAS.flatMap(e =>
    Array.from({ length: e.lotes }, (_, i) => [
      `lote-${e.sufixo}-${i}`, e.userId, e.companyId, `extrato-${i}.ofx`, "ofx",
      contas.get(e.companyId), 10, 0,
    ]).flat());
  await c.query(
    `INSERT INTO transactionImportBatches (id, userId, companyId, fileName, format, accountId, importedCount, duplicateCount)
       VALUES ${marcas(EMPRESAS.reduce((n, e) => n + e.lotes, 0), 8)}`,
    lotes,
  );
}

describe.runIf(temBancoDeTeste())("isolamento da importação entre empresas", () => {
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

  it("o histórico de lotes é o da empresa pedida, e não a soma das duas", async () => {
    const daA = await listImportBatches(anaA);
    expect(daA).toHaveLength(2);
    for (const lote of daA) expect(lote.companyId).toBe(EMPRESA_A);

    expect(await listImportBatches(anaB)).toHaveLength(5);
  });

  it("o resumo por conta não conta o que foi importado na outra empresa", async () => {
    const daA = await getAccountImportSummary(anaA);
    expect([...daA.entries()]).toEqual([[contas.get(EMPRESA_A), expect.objectContaining({ batchCount: 2 })]]);

    const daB = await getAccountImportSummary(anaB);
    expect([...daB.entries()]).toEqual([[contas.get(EMPRESA_B), expect.objectContaining({ batchCount: 5 })]]);
  });

  it("nada do Bruno aparece para a Ana, e o escopo cruzado não devolve nada", async () => {
    expect(await listImportBatches(brunoC)).toHaveLength(3);

    /* Empresa do Bruno com o userId da Ana: prova que a guarda de dono continua de pé. */
    const cruzado = { userId: ANA, companyId: EMPRESA_C };
    expect(await listImportBatches(cruzado)).toEqual([]);
    expect([...(await getAccountImportSummary(cruzado)).entries()]).toEqual([]);
  });

  it("o prefixo de anexo continua sendo do DONO, e é assim que tem que ser", () => {
    /*
     * O terceiro item planejado para esta sub-leva era pôr a empresa no caminho
     * do anexo. Não foi feito, e a decisão vale mais registrada do que
     * silenciosa.
     *
     * Duas razões. A primeira é custo: o prefixo é o caminho FÍSICO do arquivo
     * no storage. Mudá-lo obriga a mover todo anexo já gravado — migração de
     * storage, não de banco — e um arquivo que não for movido vira um anexo
     * que some da tela sem ninguém saber por quê.
     *
     * A segunda é que ele não melhora o pior caso, que é o critério desta fase
     * inteira. Com o prefixo por dono, uma chave vazada alcança no máximo outro
     * anexo DA MESMA PESSOA — "vi minha empresa errada". Pôr a empresa no
     * caminho protegeria contra o mesmo dono, que é quem já pode ver os dois.
     * Contra outra pessoa, quem protege é o prefixo do dono, e ele está de pé.
     *
     * O caminho pelo qual alguém chega a uma chave continua guardado pelas
     * guardas de `financialTransactions` e `patrimonialItems`: a tela só
     * entrega a chave de um anexo que o escopo já podia ver.
     */
    expect(attachmentPrefix(ANA, "lancamentos")).toBe(`lancamentos/${ANA}/`);
    expect(attachmentPrefix(ANA, "bens")).toBe(`bens/${ANA}/`);

    // O que ele protege, e é o que importa: o anexo de outra PESSOA.
    expect(ownsAttachment(ANA, `lancamentos/${BRUNO}/comprovante.pdf`)).toBe(false);
    expect(ownsAttachment(ANA, `lancamentos/${ANA}/comprovante.pdf`)).toBe(true);
  });
});
