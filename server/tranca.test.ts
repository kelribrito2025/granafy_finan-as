import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A invariante da tranca de escrita — Fase B do acesso do contador.
 *
 * A tranca é uma linha por mutação: `escritaProcedure` no lugar de
 * `protectedProcedure`. Uma linha é fácil de escrever e igualmente fácil de
 * esquecer, e o esquecimento não dá erro em lugar nenhum: a mutação continua
 * compilando, continua passando nos testes, continua funcionando para o dono.
 * Só falha no único caso que a fase existe para cobrir — o contador gravando na
 * empresa do cliente —, e esse caso não aparece em nenhuma tela até a Fase C.
 *
 * É a mesma forma do `guardas.test.ts`, pela mesma razão: uma regra estrutural
 * que ninguém precisa lembrar de conferir. Toda `.mutation(` dos routers de
 * empresa passa pela tranca, ou consta abaixo com o motivo escrito.
 *
 * Não fala com banco, não sobe servidor, roda em milissegundos.
 */

const DIR = path.resolve(import.meta.dirname, "routers");

/**
 * Mutações que NÃO são escrita na empresa do cliente.
 *
 * Lista FECHADA e justificada, uma por linha. Acrescentar algo aqui é uma
 * decisão de segurança, não um ajuste de teste: se a justificativa não couber
 * na linha, a mutação provavelmente é escrita e o lugar dela é na tranca.
 */
const FORA_DA_TRANCA: Record<string, Record<string, string>> = {
  "acessos.ts": {
    aceitar: "grava o vínculo do PRÓPRIO ator; a empresa vem do convite, não da ativa — e o e-mail tem que bater",
    aceitarCriandoConta: "pública por definição: quem aceita ainda não tem login; o e-mail é o do convite",
    registrarExportacao: "anota o que o PRÓPRIO ator declarou ter exportado; o contador exporta, e não escreve dado da empresa",
  },
  "admin.ts": {
    "*": "router inteiro é adminProcedure — o admin olha o sistema, não a janela de uma empresa",
  },
  "companies.ts": {
    create: "cria a empresa do PRÓPRIO ator (ctx.user.id), nunca a do cliente",
    open: "troca a empresa aberta; é navegação, e o contador precisa dela para entrar",
    rename: "recebe a empresa ALVO por parâmetro — guarda própria por alvo em escopoDoAlvo",
    setArchived: "recebe a empresa ALVO por parâmetro — guarda própria por alvo em escopoDoAlvo",
  },
  "imports.ts": {
    preview: "não grava nada: é leitura com corpo grande demais para uma query",
  },
  "settings.ts": {
    savePreferences: "preferências pessoais do ator (moeda, barra lateral), não dado da empresa",
  },
};

/** Cada `nome: xProcedure … .mutation(` de um arquivo, com o procedimento que abre a cadeia. */
function mutacoesDe(fonte: string) {
  const achadas: { nome: string; procedure: string }[] = [];
  let nome: string | null = null;
  let procedure: string | null = null;

  for (const linha of fonte.split("\n")) {
    const abertura = /^\s*(\w+):\s*(\w*[Pp]rocedure)\b/.exec(linha);
    if (abertura) {
      nome = abertura[1]!;
      procedure = abertura[2]!;
    }
    if (linha.includes(".mutation(") && nome && procedure) {
      achadas.push({ nome, procedure });
    }
  }
  return achadas;
}

const ARQUIVOS = readdirSync(DIR).filter(nome => nome.endsWith(".ts") && !nome.endsWith(".test.ts"));

describe("a tranca da escrita", () => {
  it("encontra os routers — um glob que não acha nada passaria vazio e provaria nada", () => {
    expect(ARQUIVOS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(ARQUIVOS)("%s: toda mutação passa pela tranca ou consta na lista", arquivo => {
    const mutacoes = mutacoesDe(readFileSync(path.join(DIR, arquivo), "utf8"));
    const isentas = FORA_DA_TRANCA[arquivo] ?? {};
    const todoArquivoIsento = isentas["*"] !== undefined;

    const destrancadas = mutacoes.filter(m =>
      m.procedure !== "escritaProcedure"
      && !todoArquivoIsento
      && isentas[m.nome] === undefined
    );

    expect(destrancadas.map(m => `${m.nome} (${m.procedure})`)).toEqual([]);
  });

  /*
   * O outro lado da lista: uma isenção que sobra é tão ruim quanto uma que
   * falta. Se `imports.preview` virar escrita um dia e alguém migrar a linha, a
   * isenção fica aqui apontando para uma mutação que já está trancada — e a
   * próxima pessoa a ler a lista aprende algo falso sobre o código.
   */
  it("nenhuma isenção está sobrando", () => {
    const sobrando: string[] = [];
    for (const [arquivo, isentas] of Object.entries(FORA_DA_TRANCA)) {
      if (isentas["*"] !== undefined) continue;
      const mutacoes = mutacoesDe(readFileSync(path.join(DIR, arquivo), "utf8"));
      for (const nome of Object.keys(isentas)) {
        const achada = mutacoes.find(m => m.nome === nome);
        if (!achada) sobrando.push(`${arquivo}:${nome} não existe mais`);
        else if (achada.procedure === "escritaProcedure") sobrando.push(`${arquivo}:${nome} já está trancada`);
      }
    }
    expect(sobrando).toEqual([]);
  });

  it("a tranca cobre a maior parte das mutações — uma lista de isenções que cresce é a fase se desfazendo", () => {
    const todas = ARQUIVOS.flatMap(arquivo => mutacoesDe(readFileSync(path.join(DIR, arquivo), "utf8"))
      .map(m => ({ ...m, arquivo })));
    const trancadas = todas.filter(m => m.procedure === "escritaProcedure");
    expect(trancadas.length).toBeGreaterThanOrEqual(44);
  });
});
