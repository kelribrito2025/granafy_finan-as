/*
 * A sentada da Fase 5: o aperto do `companyId`.
 *
 * Este script não decide nada. Ele lê os comandos do arquivo da migration —
 * `drizzle/0023_cuddly_sage.sql`, o mesmo que o ensaio aplicou no
 * `granafy_test` — e executa um bloco por vez, só quando pedido por nome. Sem
 * `--bloco`, ele apenas CONTA e não escreve nada.
 *
 * Os comandos não são redigitados aqui de propósito. É a lição da Fase 2: se o
 * que roda em produção divergir do que o teste ensaiou, o ensaio deixa de
 * provar o que a produção vai receber.
 *
 *   node scripts/sentada-fase5.mjs                  # só lê: contagens e estado
 *   node scripts/sentada-fase5.mjs --bloco backfill # adota as órfãs
 *   node scripts/sentada-fase5.mjs --bloco indices  # cria os 9 novos
 *   node scripts/sentada-fase5.mjs --bloco limpar   # remove os 10 antigos
 *   node scripts/sentada-fase5.mjs --bloco apertar  # os 13 NOT NULL
 *
 * A trava que importa: `--bloco apertar` se RECUSA a rodar se houver uma linha
 * órfã. Não é lembrete, é impedimento — apertar com órfã no banco derruba a
 * inserção do app, e quem descobre é o usuário tentando cadastrar uma conta.
 */
import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { EMPRESA_PADRAO_SQL, LOGINS_SEM_EMPRESA_SQL, TABELAS_COM_EMPRESA, backfillSql, donoCruzadoSql, nulosSql, totalSql } from "../server/backfillCompanies.ts";

const bloco = (() => {
  const i = process.argv.indexOf("--bloco");
  return i === -1 ? null : process.argv[i + 1];
})();

const MIGRATION = "drizzle/0023_cuddly_sage.sql";

/** Os comandos do arquivo da migration, separados por tipo. */
function comandosDaMigration() {
  const cru = readFileSync(MIGRATION, "utf8").replace(/\/\*[\s\S]*?\*\//, "");
  const todos = cru.split("--> statement-breakpoint").map(c => c.trim()).filter(Boolean);
  const add = todos.filter(c => c.includes("ADD CONSTRAINT"));
  const drop = todos.filter(c => c.includes("DROP INDEX"));
  const modif = todos.filter(c => c.includes("MODIFY COLUMN"));
  if (add.length + drop.length + modif.length !== todos.length) {
    throw new Error("comando de tipo inesperado na migration — não sei o que fazer com ele");
  }
  return { add, drop, modif, total: todos.length };
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

const url = new URL(env.TIDB_DATABASE_URL || env.DATABASE_URL);
const c = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { minVersion: "TLSv1.2" },
});

const um = async sql => Number((await c.query(sql))[0][0].n);

/** As contagens que aparecem antes e depois de cada bloco. */
async function conferir() {
  let total = 0, orfas = 0, cruzados = 0;
  console.log("  linhas  órfãs  cruz  tabela");
  for (const t of TABELAS_COM_EMPRESA) {
    const [n, o, x] = [await um(totalSql(t)), await um(nulosSql(t)), await um(donoCruzadoSql(t))];
    total += n; orfas += o; cruzados += x;
    const marca = o > 0 ? "  ← órfãs" : x > 0 ? "  ← DONO CRUZADO" : "";
    console.log(String(n).padStart(8), String(o).padStart(6), String(x).padStart(5), " " + t + marca);
  }
  console.log("-".repeat(52));
  console.log(String(total).padStart(8), String(orfas).padStart(6), String(cruzados).padStart(5), " TOTAL");

  const [semEmpresa] = await c.query(LOGINS_SEM_EMPRESA_SQL);
  console.log(`\nlogins sem empresa: ${semEmpresa.length}${semEmpresa.length ? " → " + semEmpresa.map(u => u.id).join(", ") : ""}`);

  const [colunas] = await c.query(
    "SELECT COUNT(*) n FROM information_schema.columns WHERE table_schema = DATABASE() AND column_name = 'companyId' AND is_nullable = 'NO'",
  );
  console.log(`colunas companyId já NOT NULL: ${colunas[0].n} de 13`);

  const [unicos] = await c.query(`
    SELECT index_name i FROM information_schema.statistics
     WHERE table_schema = DATABASE() AND non_unique = 0 AND index_name <> 'PRIMARY'
     GROUP BY table_name, index_name`);
  const nomes = unicos.map(u => u.i);
  const novos = nomes.filter(n => /_company_(name|date|fingerprint|uidx)/.test(n)).length;
  const antigos = nomes.filter(n => /company_profiles_user_uidx|_user_name_uidx|_user_fingerprint_uidx|_user_date_uidx|statement_balances_account_date_uidx|^reconciliation_periods_uidx$/.test(n)).length;
  console.log(`índices únicos: ${novos} novos de pé · ${antigos} antigos ainda existem`);
  return { orfas, cruzados };
}

/** Roda uma lista de comandos, um por vez, parando no primeiro erro. */
async function rodar(rotulo, comandos) {
  console.log(`\n${rotulo} — ${comandos.length} comandos\n`);
  for (const [i, sql] of comandos.entries()) {
    const curto = sql.replace(/\s+/g, " ").slice(0, 96);
    process.stdout.write(`  ${String(i + 1).padStart(2)}/${comandos.length}  ${curto} ... `);
    const [r] = await c.query(sql);
    console.log(r?.affectedRows !== undefined ? `ok (${r.affectedRows} linhas)` : "ok");
  }
}

console.log(`\nsentada da Fase 5 · ${url.hostname} · ${url.pathname.slice(1)}`);
console.log(bloco ? `bloco: ${bloco}\n` : "modo leitura — nada será escrito\n");

const estado = await conferir();

try {
  if (bloco === "backfill") {
    const [r] = await c.query(EMPRESA_PADRAO_SQL);
    console.log(`\nempresa padrão para quem não tinha: ${r.affectedRows} criadas`);
    await rodar("adoção das órfãs", TABELAS_COM_EMPRESA.map(backfillSql));
    console.log("\n── depois ──");
    const depois = await conferir();
    if (depois.orfas !== 0) console.error("\nATENÇÃO: ainda há órfãs. NÃO siga para o aperto.");
    if (depois.cruzados !== 0) console.error("\nPARADA: há linha com a empresa de OUTRO dono.");
  } else if (bloco === "indices") {
    await rodar("os índices novos, antes de os antigos sairem", comandosDaMigration().add);
    console.log("\n── depois ──"); await conferir();
  } else if (bloco === "limpar") {
    await rodar("os índices antigos", comandosDaMigration().drop);
    console.log("\n── depois ──"); await conferir();
  } else if (bloco === "apertar") {
    if (estado.orfas !== 0) {
      console.error(`\nRECUSADO: ${estado.orfas} linha(s) sem empresa.`);
      console.error("Apertar agora faz o banco recusar a inserção do app. Roda --bloco backfill primeiro.");
      process.exitCode = 1;
    } else {
      await rodar("as treze colunas", comandosDaMigration().modif);
      console.log("\n── depois ──"); await conferir();
    }
  } else if (bloco) {
    console.error(`\nbloco desconhecido: "${bloco}". São: backfill, indices, limpar, apertar.`);
    process.exitCode = 2;
  }
} finally {
  await c.end();
}
