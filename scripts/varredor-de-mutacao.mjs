#!/usr/bin/env node
/*
 * O varredor de mutação.
 *
 * A disciplina do projeto é: quebrar o código de propósito e confirmar que um
 * teste fica vermelho. Feito à mão isso escala até umas dez mutações. A fase
 * das guardas tem 87, e "rodei umas mutações" não é prova de nada — prova é
 * saber, guarda por guarda, qual teste cai quando ela some.
 *
 * Este script apaga UMA ocorrência por vez, roda só o arquivo de teste do
 * domínio, registra vermelho ou verde, e devolve o arquivo ao original. No fim
 * imprime a tabela que vai na mensagem do commit.
 *
 * Uso:
 *   node scripts/varredor-de-mutacao.mjs \
 *     --arquivo server/db.ts \
 *     --padrao 'eq\(\w+\.companyId, [^)]*\),?' \
 *     --testes server/cadastros.isolation.test.ts
 *
 * Regras que o script segue, e que valem mais que a comodidade:
 *
 *   - Uma ocorrência por vez, pelo deslocamento no arquivo. Trocar por texto
 *     mutaria todas as iguais de uma vez e o resultado não diria nada sobre
 *     qual guarda protege o quê.
 *   - O original volta SEMPRE, inclusive se o processo levar Ctrl-C. Um
 *     varredor que deixa o código mutado é pior que varredor nenhum.
 *   - Sobrevivente não é nota de rodapé: o script sai com código 1 se alguma
 *     mutação passar, para não dar para seguir sem olhar.
 */

import { execSync } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

function argumento(nome, obrigatorio = true) {
  const i = process.argv.indexOf(`--${nome}`);
  if (i === -1 || !process.argv[i + 1]) {
    if (obrigatorio) {
      console.error(`Falta --${nome}`);
      process.exit(2);
    }
    return null;
  }
  return process.argv[i + 1];
}

const arquivo = argumento("arquivo");
const padrao = new RegExp(argumento("padrao"), "g");
const testes = argumento("testes");
const rotulo = argumento("rotulo", false) ?? padrao.source;
/** Quanto uma mutação pode levar antes de ser considerada travada. */
const tempoLimite = Number(argumento("tempo-limite", false) ?? 240_000);

/*
 * A cópia de segurança vai para o DISCO, não só para a memória.
 *
 * A primeira versão guardava o original numa variável e restaurava num handler
 * de sinal. Não bastou: um `pkill` que casou o shell em volta, e não o node,
 * matou o processo sem passar por handler nenhum — e o arquivo ficou mutado,
 * com uma guarda de isolamento a menos, exatamente o cenário que este script
 * existe para nunca criar.
 *
 * Com a cópia em disco, mesmo um `kill -9` deixa recuperação possível:
 *   node scripts/varredor-de-mutacao.mjs --arquivo <arq> --restaurar
 */
const COPIA = `${arquivo}.varredor-backup`;

if (process.argv.includes("--restaurar")) {
  if (!existsSync(COPIA)) {
    console.error(`Não há cópia de segurança em ${COPIA}.`);
    process.exit(2);
  }
  writeFileSync(arquivo, readFileSync(COPIA, "utf8"));
  unlinkSync(COPIA);
  console.log(`${arquivo} restaurado a partir de ${COPIA}.`);
  process.exit(0);
}

if (existsSync(COPIA)) {
  console.error(`Já existe ${COPIA}: uma varredura anterior não terminou.`);
  console.error(`Restaure antes de rodar de novo: --arquivo ${arquivo} --restaurar`);
  process.exit(2);
}

const original = readFileSync(arquivo, "utf8");
writeFileSync(COPIA, original);

const restaurar = () => {
  try {
    if (readFileSync(arquivo, "utf8") !== original) writeFileSync(arquivo, original);
    if (existsSync(COPIA)) unlinkSync(COPIA);
  } catch {}
};
process.on("exit", restaurar);
for (const sinal of ["SIGINT", "SIGTERM", "SIGHUP", "uncaughtException"]) {
  process.on(sinal, () => { restaurar(); process.exit(130); });
}

const ocorrencias = [...original.matchAll(padrao)];
if (ocorrencias.length === 0) {
  console.error(`Nenhuma ocorrência de ${padrao} em ${arquivo}. O padrão está certo?`);
  process.exit(2);
}

/** Em que função do arquivo a ocorrência cai — é o que dá nome à linha da tabela. */
function funcaoEm(texto, posicao) {
  const antes = texto.slice(0, posicao);
  const achados = [...antes.matchAll(/\n(?:export )?(?:async )?function (\w+)/g)];
  return achados.at(-1)?.[1] ?? "(topo do arquivo)";
}

console.log(`\nvarredor de mutação · ${arquivo} · ${rotulo}`);
console.log(`${ocorrencias.length} ocorrências · testes: ${testes}\n`);
console.log(`${"#".padStart(3)}  ${"função".padEnd(40)} ${"linha".padStart(6)}  resultado`);
console.log("─".repeat(78));

const sobreviventes = [];
for (const [indice, achado] of ocorrencias.entries()) {
  const inicio = achado.index;
  const fim = inicio + achado[0].length;
  const linha = original.slice(0, inicio).split("\n").length;
  const nome = funcaoEm(original, inicio);

  writeFileSync(arquivo, original.slice(0, inicio) + original.slice(fim));

  /*
   * Tempo limite por mutação. Uma rodada travou dez minutos numa varredura e
   * parou tudo — e travamento não é verde nem vermelho, é inconclusivo. Conta
   * como bloqueio, porque guarda sem prova é guarda sem prova, seja porque o
   * teste passou ou porque o teste nunca terminou.
   */
  let estado = "vermelho ✓";
  try {
    execSync(`npx vitest run ${testes}`, { stdio: "pipe", encoding: "utf8", timeout: tempoLimite });
    estado = "SOBREVIVEU (!!)";
  } catch (erro) {
    if (erro?.signal === "SIGTERM" || erro?.code === "ETIMEDOUT") estado = "TRAVOU (!!)";
  }
  writeFileSync(arquivo, original);

  if (estado !== "vermelho ✓") sobreviventes.push({ nome, linha, estado, trecho: achado[0].trim() });
  console.log(
    `${String(indice + 1).padStart(3)}  ${nome.padEnd(40)} ${String(linha).padStart(6)}  ${estado}`,
  );
}

console.log("─".repeat(78));
console.log(`${ocorrencias.length} mutações · ${ocorrencias.length - sobreviventes.length} pegas · ${sobreviventes.length} não provadas`);

if (sobreviventes.length > 0) {
  console.error("\nPARADA OBRIGATÓRIA. Mutação que sobrevive é guarda sem prova:");
  for (const s of sobreviventes) console.error(`  [${s.estado.replace(" (!!)", "")}] ${arquivo}:${s.linha}  ${s.nome}\n    ${s.trecho}`);
  process.exit(1);
}
console.log("nenhuma sobrevivente ✓");
