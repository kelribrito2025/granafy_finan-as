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

const SCHEMA = readFileSync(path.resolve(import.meta.dirname, "../drizzle/schema.ts"), "utf8");

/**
 * `InsertFinancialAccount` → a tabela tem `companyId`? E qual é a chave dela.
 *
 * Sai do schema em vez de lista escrita à mão: tabela nova entra na rede sozinha.
 */
function chaveDaEmpresaPorTipo() {
  const mapa = new Map<string, "companyId" | "id" | null>();
  for (const [, tipo, tabela] of SCHEMA.matchAll(/export type Insert(\w+) = typeof (\w+)\.\$inferInsert/g)) {
    /*
     * O corpo termina no PRÓXIMO `export const`, não num `\n});`.
     * Tabela com índices fecha em `}, table => [ … ]);`, então procurar `\n});`
     * engolia as tabelas seguintes — e `userPreferences`, que não tem empresa,
     * herdava o `companyId` do `categoryRules` logo abaixo. Foi o teste de
     * baixo que pegou, e é para isso que ele existe.
     */
    const bloco = SCHEMA.slice(SCHEMA.indexOf(`export const ${tabela} = mysqlTable`) + 1);
    const fim = bloco.indexOf("\nexport const ");
    const corpo = fim === -1 ? bloco : bloco.slice(0, fim);
    /* Em `companyProfiles` não existe coluna `companyId`: a empresa é a linha, e a chave é o `id`. */
    mapa.set(`Insert${tipo}`, tabela === "companyProfiles" ? "id" : /\bcompanyId:/.test(corpo) ? "companyId" : null);
  }
  return mapa;
}

const chaveDaEmpresa = chaveDaEmpresaPorTipo();

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

  it("nenhum tipo aceito de fora admite a chave da empresa — é a leva 3 da Fase 6", () => {
    /*
     * A decisão da Fase 6 é que nada muda de empresa: quem errou apaga e
     * relança. Não existe botão de mover, mas a leva 3 achou duas funções cujo
     * TIPO deixava mover — `updatePatrimonialItem` aceitava `companyId` e o
     * `.set()` recebia o objeto do chamador inteiro, sem conferir.
     *
     * Não havia chamador abusando. O problema é que só o chamador impedia:
     * trocar o schema zod de um endpoint bastava para abrir o caminho, sem uma
     * linha de erro do compilador. Esta invariante move a tranca para o tipo.
     *
     * `Omit` é lista de proibição: a chave da empresa TEM que estar nela.
     * `Pick` é lista de permissão: a chave da empresa NÃO pode estar nela.
     * Tabela sem empresa (preferências do login, que é por login mesmo) fica
     * fora da exigência — e é o schema que diz qual é qual.
     */
    const frouxos: string[] = [];

    for (const f of funcoes) {
      for (const [, molde, tipo, lista] of f.assinatura.matchAll(/(Omit|Pick)<Insert(\w+),([^>]*)>/g)) {
        const chave = chaveDaEmpresa.get(`Insert${tipo}`);
        if (!chave) continue;
        const listada = new RegExp(`"${chave}"`).test(lista!);
        if (molde === "Omit" ? !listada : listada) {
          frouxos.push(`${f.nome}: ${molde}<Insert${tipo}> ${molde === "Omit" ? "não exclui" : "admite"} "${chave}"`);
        }
      }
    }

    expect(frouxos).toEqual([]);
  });

  it("os tipos derivados de Insert que a rede acima cobre não passam de zero por acidente", () => {
    /*
     * A mesma armadilha do primeiro teste deste arquivo: se a extração do
     * `Omit<Insert…>` parar de casar, a invariante acima vira decoração e
     * fecha verde sobre lista vazia.
     */
    const cobertos = funcoes.filter(f => /(Omit|Pick)<Insert\w+,/.test(f.assinatura)).length;
    expect(cobertos).toBeGreaterThanOrEqual(12);
    expect(chaveDaEmpresa.get("InsertPatrimonialItem")).toBe("companyId");
    expect(chaveDaEmpresa.get("InsertCompanyProfile")).toBe("id");
    /* Preferências são por login: a tabela não tem empresa, e a rede não inventa uma. */
    expect(chaveDaEmpresa.get("InsertUserPreferences")).toBe(null);
  });
});
