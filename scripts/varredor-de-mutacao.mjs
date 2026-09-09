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

/*
 * A restauração vem ANTES de exigir qualquer outro argumento.
 *
 * Quem chega aqui está recuperando de uma varredura que morreu — e não tem à
 * mão o `--padrao` e o `--testes` da rodada que não terminou. A primeira versão
 * lia os três argumentos no topo, então o comando de recuperação que a própria
 * documentação prometia morria em "Falta --padrao", com o arquivo mutado no
 * disco. Caminho de recuperação que depende de lembrar de coisa não é caminho
 * de recuperação.
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

const padrao = new RegExp(argumento("padrao"), "g");
const testes = argumento("testes");
const rotulo = argumento("rotulo", false) ?? padrao.source;
/** Quanto uma mutação pode levar antes de ser considerada travada. */
const tempoLimite = Number(argumento("tempo-limite", false) ?? 240_000);
/*
 * De qual ocorrência começar, 1-based.
 *
 * Uma varredura de 33 guardas leva quarenta minutos, e o sistema matou a
 * primeira por falta de memória na de número nove. Sem retomada, um kill custa
 * a rodada inteira — e a tentação de "deixa pra lá, as outras devem estar boas"
 * é exatamente o que a parada obrigatória existe para não permitir.
 */
const comecarEm = Number(argumento("comecar-em", false) ?? 1);
/*
 * Quantas ocorrências provar, sorteadas do total. Sem isto, prova todas.
 *
 * O censo completo é a prova forte, e continua sendo o que uma guarda crítica
 * merece — mas custa uma rodada de teste por guarda, e nas levas grandes isso
 * são dezenas de minutos parados. A amostra é o modo padrão: barata, aleatória
 * e honesta sobre o que NÃO provou.
 *
 * A honestidade é a parte que importa. O pior modo de falha já visto neste
 * projeto foi um boletim limpo sobre um censo incompleto, então o rodapé e o
 * cabeçalho dizem "amostra de N de M" em todo lugar onde antes se lia um total,
 * e a semente vai impressa para a rodada ser refazível.
 */
const amostra = Number(argumento("amostra", false) ?? 0);
const semente = Number(argumento("semente", false) ?? Date.now() % 1_000_000);

/** PRNG determinístico: a mesma semente sorteia a mesma amostra. */
function sorteio(estado) {
  return () => {
    estado = (estado + 0x6d2b79f5) | 0;
    let t = Math.imul(estado ^ (estado >>> 15), 1 | estado);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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
 *
 * E para retomar de onde parou, sem refazer o que já fechou vermelho:
 *   node scripts/varredor-de-mutacao.mjs ... --comecar-em 9
 *
 * O modo padrão de uso é a AMOSTRA, não o censo — censo completo de dezenas de
 * guardas custa dezenas de minutos, e a amostra pega o defeito de molde, que é
 * o que aparece em bloco:
 *   node scripts/varredor-de-mutacao.mjs ... --amostra 5
 */
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

const todas = [...original.matchAll(padrao)];
if (todas.length === 0) {
  console.error(`Nenhuma ocorrência de ${padrao} em ${arquivo}. O padrão está certo?`);
  process.exit(2);
}

/** As sorteadas, em ordem de arquivo — ou todas, quando não há --amostra. */
const ocorrencias = (() => {
  if (!amostra || amostra >= todas.length) return todas;
  const proximo = sorteio(semente);
  const restantes = todas.map((_, i) => i);
  const escolhidos = [];
  for (let n = 0; n < amostra; n++) {
    escolhidos.push(...restantes.splice(Math.floor(proximo() * restantes.length), 1));
  }
  return escolhidos.sort((a, b) => a - b).map(i => todas[i]);
})();
const ehAmostra = ocorrencias.length < todas.length;

/** Em que função do arquivo a ocorrência cai — é o que dá nome à linha da tabela. */
function funcaoEm(texto, posicao) {
  const antes = texto.slice(0, posicao);
  const achados = [...antes.matchAll(/\n(?:export )?(?:async )?function (\w+)/g)];
  return achados.at(-1)?.[1] ?? "(topo do arquivo)";
}

console.log(`\nvarredor de mutação · ${arquivo} · ${rotulo}`);
console.log(ehAmostra
  ? `AMOSTRA de ${ocorrencias.length} de ${todas.length} ocorrências · semente ${semente} · testes: ${testes}\n`
  : `${todas.length} ocorrências (censo completo) · testes: ${testes}\n`);
console.log(`${"#".padStart(3)}  ${"função".padEnd(40)} ${"linha".padStart(6)}  resultado`);
console.log("─".repeat(78));

const sobreviventes = [];
for (const [indice, achado] of ocorrencias.entries()) {
  if (indice + 1 < comecarEm) continue;
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
const rodadas = ocorrencias.length - (comecarEm - 1);
console.log(`${rodadas} mutações · ${rodadas - sobreviventes.length} pegas · ${sobreviventes.length} sobreviveram`
  + (comecarEm > 1 ? ` · ${comecarEm - 1} puladas por --comecar-em` : ""));
if (ehAmostra) {
  console.log(`AMOSTRA: ${todas.length - rodadas} das ${todas.length} guardas NÃO foram provadas nesta rodada.`);
  console.log(`Para repetir exatamente esta amostra: --amostra ${amostra} --semente ${semente}`);
}

if (sobreviventes.length > 0) {
  console.error("\nPARADA OBRIGATÓRIA. Mutação que sobrevive é guarda sem prova:");
  for (const s of sobreviventes) console.error(`  [${s.estado.replace(" (!!)", "")}] ${arquivo}:${s.linha}  ${s.nome}\n    ${s.trecho}`);
  process.exit(1);
}
console.log("nenhuma sobrevivente ✓");
