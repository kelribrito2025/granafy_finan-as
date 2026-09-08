/*
 * Cria a movimentação bancária que faltava para cada lançamento importado.
 *
 * Antes da conciliação, a importação de OFX/CSV gravava a linha do extrato
 * direto no razão. Os dois lados eram a mesma linha, e sem os dois lados não há
 * o que conciliar. Este script gera a movimentação que corresponde a cada
 * lançamento importado e já registra o vínculo entre eles — o passado nasce
 * conciliado, que é o que ele de fato é.
 *
 * Roda em SQL puro (INSERT ... SELECT) para não trazer 8.762 linhas até aqui só
 * para devolvê-las. É idempotente: o LEFT JOIN deixa de fora o que já existe,
 * então rodar de novo não duplica nada.
 *
 *   node scripts/backfill-bank-movements.mjs --dry-run
 *   node scripts/backfill-bank-movements.mjs
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const seco = process.argv.includes("--dry-run");

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter(linha => linha.includes("=") && !linha.trim().startsWith("#"))
    .map(linha => [
      linha.slice(0, linha.indexOf("=")).trim(),
      linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

const url = new URL(env.TIDB_DATABASE_URL || env.DATABASE_URL);
const conexao = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { minVersion: "TLSv1.2" },
});

const contar = async sql => (await conexao.query(sql))[0][0].n;

const ELEGIVEIS = `
  FROM transactions t
  LEFT JOIN bankMovements b ON b.userId = t.userId AND b.fingerprint = t.fingerprint
  WHERE t.importBatchId IS NOT NULL
    AND t.accountId IS NOT NULL
    AND t.fingerprint IS NOT NULL
    AND b.id IS NULL`;

console.log(seco ? "== simulação, nada será gravado ==" : "== gravando ==");
console.log("antes:",
  await contar("SELECT COUNT(*) n FROM transactions"), "lançamentos ·",
  await contar("SELECT COUNT(*) n FROM bankMovements"), "movimentações ·",
  await contar("SELECT COUNT(*) n FROM reconciliationLinks"), "vínculos");
console.log("movimentações a criar:", await contar(`SELECT COUNT(*) n ${ELEGIVEIS}`));

if (seco) {
  await conexao.end();
  process.exit(0);
}

/*
 * Em lotes de 500. Uma transação única com 8.762 linhas derrubou a conexão com
 * o TiDB no primeiro teste; como o LEFT JOIN já exclui o que existe, repetir a
 * mesma consulta até ela não achar mais nada é seguro e retomável.
 */
const LOTE = 500;

async function emLotes(rotulo, sql) {
  let total = 0;
  for (;;) {
    const [resultado] = await conexao.query(`${sql} LIMIT ${LOTE}`);
    if (resultado.affectedRows === 0) break;
    total += resultado.affectedRows;
    process.stdout.write(`\r${rotulo}: ${total}`);
  }
  process.stdout.write(`\r${rotulo}: ${total}\n`);
  return total;
}

await emLotes("movimentações criadas", `
  INSERT INTO bankMovements
    (userId, accountId, movementDate, description, contact, amount, status,
     importBatchId, externalId, fingerprint, reconciledAt, createdAt, updatedAt)
  SELECT t.userId, t.accountId, t.transactionDate, t.description, t.contact, t.amount,
         'conciliado', t.importBatchId, t.externalId, t.fingerprint,
         t.createdAt, t.createdAt, t.createdAt
  ${ELEGIVEIS}`);

await emLotes("vínculos criados", `
  INSERT INTO reconciliationLinks (userId, movementId, transactionId, amount, origin, createdAt)
  SELECT t.userId, b.id, t.id, t.amount, 'importacao', t.createdAt
  FROM transactions t
  JOIN bankMovements b ON b.userId = t.userId AND b.fingerprint = t.fingerprint
  LEFT JOIN reconciliationLinks r ON r.movementId = b.id AND r.transactionId = t.id
  WHERE t.importBatchId IS NOT NULL AND r.id IS NULL`);

console.log("depois:",
  await contar("SELECT COUNT(*) n FROM transactions"), "lançamentos ·",
  await contar("SELECT COUNT(*) n FROM bankMovements"), "movimentações ·",
  await contar("SELECT COUNT(*) n FROM reconciliationLinks"), "vínculos");
console.log("sobrou sem par:", await contar(`SELECT COUNT(*) n ${ELEGIVEIS}`));
console.log("movimentação sem vínculo:", await contar(`
  SELECT COUNT(*) n FROM bankMovements b
  LEFT JOIN reconciliationLinks r ON r.movementId = b.id
  WHERE r.id IS NULL`));

await conexao.end();
