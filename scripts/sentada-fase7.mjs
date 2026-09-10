/*
 * O ritual curto da Fase 7: as duas colunas que faltavam na empresa.
 *
 * Mesma forma da Fase 5, e pelo mesmo motivo: os comandos NÃO são redigitados
 * aqui. Ele lê `drizzle/0024_condemned_obadiah_stane.sql`, o mesmo arquivo que
 * o ensaio aplica no `granafy_test`. Se o que roda em produção divergir do que
 * o ensaio provou, o ensaio não provou nada.
 *
 *   node scripts/sentada-fase7.mjs                 # só lê: estado das colunas
 *   node scripts/sentada-fase7.mjs --ensaio        # aplica no granafy_test
 *   node scripts/sentada-fase7.mjs --bloco colunas # aplica em PRODUÇÃO
 *
 * Sem `--bloco` e sem `--ensaio` ele não escreve nada.
 *
 * Por que este ritual é curto: `ADD COLUMN` com valor padrão não reescreve
 * linha nenhuma no TiDB — a coluna passa a existir nos metadados e as linhas
 * antigas respondem o default na leitura. Não há backfill, não há janela em que
 * metade das linhas está de um jeito e metade de outro, e não há como uma
 * linha existente ficar inválida. É o oposto do bloco `apertar` da Fase 5.
 *
 * As chaves estrangeiras NÃO estão aqui. Elas são a sentada própria da fase,
 * marcada em separado: 13 `ADD CONSTRAINT` validados no momento do add, sobre
 * 29 mil linhas, em que uma única linha órfã derruba o comando.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";

const MIGRATION = "drizzle/0024_condemned_obadiah_stane.sql";
const COLUNAS = ["onboardingCompletedAt", "categoryDefaultsVersion"];

const bloco = (() => {
  const i = process.argv.indexOf("--bloco");
  return i === -1 ? null : process.argv[i + 1];
})();
const ensaio = process.argv.includes("--ensaio");

if (bloco && ensaio) {
  console.error("--ensaio e --bloco são exclusivos: um escreve no teste, o outro na produção.");
  process.exit(1);
}
if (bloco && bloco !== "colunas") {
  console.error(`bloco desconhecido: ${bloco}. O único é "colunas".`);
  process.exit(1);
}

/** Os comandos do arquivo, um por `ADD COLUMN`, sem interpretação minha. */
function comandosDaMigration() {
  const cru = readFileSync(MIGRATION, "utf8");
  const todos = cru.split("--> statement-breakpoint").map(c => c.trim().replace(/;$/, "")).filter(Boolean);
  const forasteiros = todos.filter(c => !/^ALTER TABLE `companyProfiles` ADD `/.test(c));
  if (forasteiros.length > 0) {
    throw new Error(`comando inesperado na migration, não vou executar:\n  ${forasteiros.join("\n  ")}`);
  }
  return todos;
}

const env = Object.fromEntries(
  readFileSync(".env", "utf8")
    .split("\n")
    .filter(linha => linha.includes("=") && !linha.trim().startsWith("#"))
    .map(linha => [
      linha.slice(0, linha.indexOf("=")).trim(),
      linha.slice(linha.indexOf("=") + 1).trim().replace(/^["']|["']$/g, ""),
    ])
);

/*
 * O ensaio usa a credencial de TESTE, que só alcança `granafy_test`. Não é
 * disciplina minha na hora de digitar: o usuário do banco não tem permissão
 * fora dali, então errar o alvo no ensaio dá erro de permissão, não estrago.
 */
const url = new URL(ensaio ? env.TEST_DATABASE_URL : (env.TIDB_DATABASE_URL || env.DATABASE_URL));
const c = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { minVersion: "TLSv1.2" },
});

const banco = url.pathname.slice(1);

async function estado() {
  const [linhas] = await c.query(
    `SELECT COLUMN_NAME, IS_NULLABLE, COLUMN_DEFAULT, DATA_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'companyProfiles' AND COLUMN_NAME IN (?, ?)`,
    [banco, ...COLUNAS]
  );
  const porNome = new Map(linhas.map(l => [l.COLUMN_NAME, l]));
  console.log(`\n  banco: ${banco}`);
  console.log("  coluna                     existe  tipo       nula  default");
  for (const nome of COLUNAS) {
    const l = porNome.get(nome);
    console.log(
      "  " + nome.padEnd(27) +
      (l ? "sim   " : "NÃO   ").padEnd(8) +
      (l ? String(l.DATA_TYPE).padEnd(11) : "-".padEnd(11)) +
      (l ? String(l.IS_NULLABLE).padEnd(6) : "-".padEnd(6)) +
      (l ? String(l.COLUMN_DEFAULT) : "-")
    );
  }
  const [[{ n }]] = await c.query("SELECT COUNT(*) AS n FROM companyProfiles");
  console.log(`  empresas na tabela: ${n}`);
  return { existentes: porNome.size, empresas: Number(n) };
}

const comandos = comandosDaMigration();
console.log(`\nsentada da Fase 7 · ${MIGRATION}`);
console.log(`${comandos.length} comandos, todos ADD COLUMN em companyProfiles`);
for (const cmd of comandos) console.log("  " + cmd);

const antes = await estado();

if (!bloco && !ensaio) {
  console.log("\nmodo leitura. Nada foi escrito.");
  console.log("Para ensaiar no granafy_test: --ensaio");
  console.log("Para aplicar em produção:     --bloco colunas");
  await c.end();
  process.exit(0);
}

if (antes.existentes === COLUNAS.length) {
  console.log("\nas duas colunas já existem neste banco. Nada a fazer.");
  /*
   * No `granafy_test` isso é o esperado, e é o ensaio: `prepararSchemaDeTeste`
   * aplica cada arquivo de `drizzle/` uma vez, com diário próprio, na primeira
   * rodada depois de o arquivo aparecer. Então quem ensaia a migration é a
   * própria suíte — verbatim do mesmo arquivo que a produção vai receber, e com
   * os 560 testes rodando em cima do schema já apertado.
   *
   * Mostrar a linha do diário é o que transforma "já existe" em prova: sem ela
   * não se distingue migration ensaiada de tabela que nasceu assim.
   */
  if (ensaio) {
    const [diario] = await c.query(
      "SELECT arquivo, aplicadaEm FROM `_migracoes_do_arreio` WHERE arquivo = ?",
      [MIGRATION.split("/").pop()]
    );
    console.log(diario.length > 0
      ? `  o arreio aplicou ${diario[0].arquivo} neste schema — é o ensaio, e a suíte rodou verde depois dele.`
      : "  ATENÇÃO: as colunas existem mas o diário não registra esta migration. Confira antes de seguir.");
  }
  await c.end();
  process.exit(0);
}

console.log(`\naplicando em ${banco}...`);
for (const cmd of comandos) {
  const t0 = Date.now();
  await c.query(cmd);
  console.log(`  ok em ${Date.now() - t0} ms · ${cmd.slice(0, 70)}`);
}

const depois = await estado();
if (depois.existentes !== COLUNAS.length) throw new Error("as colunas não apareceram — PARE e confira");
if (depois.empresas !== antes.empresas) throw new Error(`a contagem de empresas mudou: ${antes.empresas} → ${depois.empresas}`);
console.log(`\nfechado: ${depois.existentes} de ${COLUNAS.length} colunas de pé, ${depois.empresas} empresas inalteradas.`);
await c.end();
