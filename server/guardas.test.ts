import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * A invariante estrutural das guardas de isolamento.
 *
 * Este arquivo existe por causa de um quase-acidente. Uma varredura de mutação
 * foi interrompida à força e deixou DUAS funções mutadas, cada uma com a guarda
 * de empresa apagada. O reparo manual achou uma. A outra ficou assim:
 *
 *     .where(and(eq(categoryRules.userId, escopo.userId), ))
 *
 * Vírgula sobrando antes do parêntese é sintaxe VÁLIDA em TypeScript, então o
 * `tsc` passou limpo. A varredura seguinte contou 18 ocorrências em vez de 19 e
 * fechou "0 não provadas" — boletim limpo sobre um arquivo com uma guarda a
 * menos. Nenhuma das redes existentes pegou: nem o compilador, nem os testes de
 * isolamento (que não exercitavam aquela função), nem o próprio varredor.
 *
 * A regra abaixo é simples e não depende de ninguém lembrar de olhar: toda
 * função que recebe `Escopo` filtra pelas DUAS chaves, sempre, na mesma
 * quantidade. Uma guarda de dono sem a guarda de empresa ao lado é um vazamento
 * esperando a Fase 6; uma de empresa sem a de dono é pior ainda.
 *
 * Custa milissegundos, não fala com banco nenhum, e roda em toda suíte.
 */

const CAMINHO = path.resolve(import.meta.dirname, "db.ts");
const FONTE = readFileSync(CAMINHO, "utf8");

/**
 * Cada função do `db.ts`, com o corpo até a próxima.
 *
 * Exportada ou não: `statsPorColuna` e `liquidadasNoMes` são internas e carregam
 * guarda de verdade — três e duas funções públicas delegam a elas. Enquanto a
 * extração só olhava para `export`, essas duas guardas ficavam fora da rede.
 */
function funcoesDe(fonte: string) {
  const achados = [...fonte.matchAll(/\n(?:export )?(?:async )?function (\w+)\(([^)]*)/g)];
  return achados.map((achado, indice) => ({
    nome: achado[1]!,
    assinatura: achado[2]!,
    corpo: fonte.slice(achado.index!, achados[indice + 1]?.index ?? fonte.length),
  }));
}

const funcoes = funcoesDe(FONTE);

describe("invariante das guardas de isolamento em db.ts", () => {
  it("encontra as funções do arquivo (a extração não pode falhar em silêncio)", () => {
    /*
     * Se a extração quebrar — uma mudança de formatação, por exemplo — todos os
     * testes abaixo passariam sobre uma lista vazia. Este é o que impede a rede
     * de virar decoração.
     */
    expect(funcoes.length).toBeGreaterThan(80);
    expect(funcoes.map(f => f.nome)).toContain("listFinancialAccounts");
  });

  it("toda função com Escopo filtra pelas duas chaves, na mesma quantidade", () => {
    const desbalanceadas = funcoes
      .filter(f => f.assinatura.includes("escopo: Escopo"))
      .map(f => ({
        nome: f.nome,
        dono: (f.corpo.match(/\.userId, escopo\.userId/g) ?? []).length,
        /*
         * Duas formas contam como guarda de empresa, e a segunda não é exceção:
         * é a tabela de EMPRESAS. Em `companyProfiles` a chave da empresa é o
         * próprio `id` — não existe coluna `companyId` numa tabela que é a
         * empresa. A paridade continua sendo exigida do mesmo jeito.
         */
        empresa: (f.corpo.match(/\.companyId, escopo\.companyId|companyProfiles\.id, escopo\.companyId/g) ?? []).length,
      }))
      .filter(f => f.dono !== f.empresa);

    expect(desbalanceadas).toEqual([]);
  });

  it("nenhuma função com Escopo deixou de usá-lo", () => {
    /*
     * Trocar a assinatura e esquecer o corpo deixaria a consulta sem guarda
     * nenhuma — e `tsc` só reclamaria se o nome antigo tivesse sumido.
     *
     * Repassar o escopo inteiro para um ajudante conta como usar: é o que
     * `getSettledTotals` faz com `liquidadasNoMes(escopo, …)`. O ajudante entra
     * na mesma lista e responde pelas próprias guardas.
     */
    const mudas = funcoes
      .filter(f => f.assinatura.includes("escopo: Escopo"))
      .filter(f => !/\bescopo\b/.test(f.corpo.slice(f.corpo.indexOf(")"))))
      .map(f => f.nome);

    expect(mudas).toEqual([]);
  });

  it("não sobrou vírgula órfã dentro de and() — o disfarce do acidente", () => {
    /*
     * `and(eq(...), )` compila. É exatamente a forma que uma guarda apagada por
     * varredura deixa para trás, e foi ela que passou despercebida.
     */
    /*
     * `,[ \t]+\)` e não `,\s*\)`: vírgula seguida de QUEBRA DE LINHA antes do
     * parêntese é estilo normal em lista multi-linha e aparece dezenas de vezes
     * neste arquivo. O sinal do acidente é a vírgula com espaço na mesma linha,
     * que é o que sobra quando um argumento some do meio de uma chamada.
     */
    const orfas = [...FONTE.matchAll(/,[ \t]+\)/g)].map(m => {
      const linha = FONTE.slice(0, m.index!).split("\n").length;
      return `db.ts:${linha}`;
    });
    expect(orfas).toEqual([]);
  });

  it("nenhuma guarda de isolamento mora em fragmento sql cru", () => {
    /*
     * A lição da precedência do OR: `and()` não parenteza fragmento cru, e um
     * `OR` lá dentro escapa da conjunção inteira. Foi assim que a consulta
     * passou a casar linhas de QUALQUER usuário, e só não virou incidente
     * porque dois usuários devolveram números idênticos.
     */
    const cruas = [...FONTE.matchAll(/sql`[^`]*\b(userId|companyId)\b[^`]*`/g)]
      .filter(m => /\bOR\b/i.test(m[0]))
      .map(m => `db.ts:${FONTE.slice(0, m.index!).split("\n").length}`);
    expect(cruas).toEqual([]);
  });
});
