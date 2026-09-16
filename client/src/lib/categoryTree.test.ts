import { describe, expect, it } from "vitest";
import { buildCategoryTree, categoryOptionIndent, flattenCategoryTree, type FlatCategory } from "./categoryTree";

let proximoId = 1;
const cat = (name: string, total = 0, count = 0, type: FlatCategory["type"] = "saida"): FlatCategory => ({
  id: proximoId++,
  name,
  type,
  color: "#4C6355",
  transactionCount: count,
  total,
  isActive: true,
});

describe("buildCategoryTree", () => {
  it("mantém categoria sem barra na raiz", () => {
    const arvore = buildCategoryTree([cat("Marketing", 100, 2)]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0].label).toBe("Marketing");
    expect(arvore[0].children).toHaveLength(0);
    expect(arvore[0].subtotal).toBe(100);
  });

  it("aninha o filho sob o pai cadastrado", () => {
    const arvore = buildCategoryTree([
      cat("Custos Operacionais", 50, 1),
      cat("Custos Operacionais/Insumos", 200, 4),
    ]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0].label).toBe("Custos Operacionais");
    expect(arvore[0].children.map(c => c.label)).toEqual(["Insumos"]);
  });

  it("soma o filho no subtotal do pai", () => {
    const arvore = buildCategoryTree([
      cat("Custos Operacionais", 50, 1),
      cat("Custos Operacionais/Insumos", 200, 4),
      cat("Custos Operacionais/Frete", 30, 2),
    ]);
    expect(arvore[0].subtotal).toBe(280);
    expect(arvore[0].subtotalCount).toBe(7);
  });

  it("cria pai de agrupamento quando ele não está cadastrado", () => {
    const arvore = buildCategoryTree([cat("Impostos/ISS", 90, 3)]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0].label).toBe("Impostos");
    expect(arvore[0].category).toBeNull();
    expect(arvore[0].subtotal).toBe(90);
    expect(arvore[0].children[0].label).toBe("ISS");
  });

  it("suporta mais de dois níveis", () => {
    const arvore = buildCategoryTree([cat("A/B/C", 10, 1)]);
    expect(arvore[0].label).toBe("A");
    expect(arvore[0].children[0].label).toBe("B");
    expect(arvore[0].children[0].children[0].label).toBe("C");
    expect(arvore[0].subtotal).toBe(10);
  });

  it("ordena por peso, do maior para o menor", () => {
    const arvore = buildCategoryTree([
      cat("Pequena", 10),
      cat("Grande", 900),
      cat("Média", 300),
    ]);
    expect(arvore.map(n => n.label)).toEqual(["Grande", "Média", "Pequena"]);
  });

  it("ordena por peso também entre irmãos", () => {
    const arvore = buildCategoryTree([
      cat("Raiz/Menor", 5),
      cat("Raiz/Maior", 800),
    ]);
    expect(arvore[0].children.map(n => n.label)).toEqual(["Maior", "Menor"]);
  });

  it("usa o valor absoluto para ordenar, já que despesa é negativa", () => {
    const arvore = buildCategoryTree([cat("Pequena", -5), cat("Grande", -900)]);
    expect(arvore.map(n => n.label)).toEqual(["Grande", "Pequena"]);
  });

  it("tolera espaços em volta da barra", () => {
    const arvore = buildCategoryTree([cat("Pai / Filho", 10)]);
    expect(arvore[0].label).toBe("Pai");
    expect(arvore[0].children[0].label).toBe("Filho");
  });

  it("ignora nome vazio e barras soltas", () => {
    expect(buildCategoryTree([cat(""), cat("///")])).toHaveLength(0);
  });

  it("soma cadastros repetidos no mesmo nó, em vez de perder um", () => {
    const arvore = buildCategoryTree([cat("Igual", 100, 2), cat("Igual", 40, 1)]);
    expect(arvore).toHaveLength(1);
    expect(arvore[0].subtotal).toBe(140);
    expect(arvore[0].subtotalCount).toBe(3);
  });

  it("não perde nenhuma categoria pelo caminho", () => {
    const entrada = [
      cat("A", 1), cat("A/B", 2), cat("A/B/C", 3),
      cat("D/E", 4), cat("F", 5),
    ];
    const contar = (nos: ReturnType<typeof buildCategoryTree>): number =>
      nos.reduce((soma, no) => soma + (no.category ? 1 : 0) + contar(no.children), 0);
    expect(contar(buildCategoryTree(entrada))).toBe(entrada.length);
  });

  it("o total da raiz fecha com a soma de tudo que está embaixo", () => {
    const arvore = buildCategoryTree([
      cat("Raiz", 10), cat("Raiz/Um", 20), cat("Raiz/Dois", 30), cat("Raiz/Dois/Fundo", 40),
    ]);
    expect(arvore[0].subtotal).toBe(100);
  });
});

describe("flattenCategoryTree", () => {
  /*
   * A ordem é o que o `<select>` tem para mostrar hierarquia: pai antes,
   * filhas logo depois, e só então o próximo pai. Se o achatador puser as
   * filhas de um pai depois do outro pai, o menu mente sobre quem é de quem.
   */
  it("põe cada pai seguido das próprias filhas, em profundidade", () => {
    const linhas = flattenCategoryTree(buildCategoryTree([
      cat("Despesas Fixas"),
      cat("Despesas Fixas/Aluguel"),
      cat("Despesas Fixas/Salários"),
      cat("Despesas Variáveis"),
      cat("Despesas Variáveis/Comissões"),
    ]));
    expect(linhas.map(l => `${l.depth}:${l.label}`)).toEqual([
      "0:Despesas Fixas", "1:Aluguel", "1:Salários",
      "0:Despesas Variáveis", "1:Comissões",
    ]);
  });

  it("mostra só o último trecho do nome, não o caminho inteiro", () => {
    const [pai, filha] = flattenCategoryTree(buildCategoryTree([
      cat("Custos Operacionais"),
      cat("Custos Operacionais/Matéria-Prima e Insumos"),
    ]));
    expect(pai.label).toBe("Custos Operacionais");
    expect(filha.label).toBe("Matéria-Prima e Insumos");
    // O caminho inteiro continua disponível para quem precisar dele.
    expect(filha.path).toBe("Custos Operacionais/Matéria-Prima e Insumos");
  });

  /*
   * O pai não cadastrado vira uma linha sem categoria — rótulo, não escolha.
   * Descartá-lo deixaria a filha recuada sob nada; promovê-la à raiz
   * esconderia a hierarquia que o próprio nome dela declara.
   */
  it("mantém o pai não cadastrado como rótulo sem categoria, com a filha recuada", () => {
    const linhas = flattenCategoryTree(buildCategoryTree([cat("Descontos/Abatimentos")]));
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({ depth: 0, label: "Descontos", category: null });
    expect(linhas[1]).toMatchObject({ depth: 1, label: "Abatimentos" });
    expect(linhas[1].category).not.toBeNull();
  });

  it("desce mais de um nível", () => {
    const linhas = flattenCategoryTree(buildCategoryTree([
      cat("A"), cat("A/B"), cat("A/B/C"),
    ]));
    expect(linhas.map(l => l.depth)).toEqual([0, 1, 2]);
  });
});

describe("categoryOptionIndent", () => {
  it("raiz não recua e cada nível soma três espaços não separáveis", () => {
    expect(categoryOptionIndent(0)).toBe("");
    expect(categoryOptionIndent(1)).toBe("   ");
    expect(categoryOptionIndent(2)).toHaveLength(6);
  });

  /*
   * O motivo de existir: espaço comum na frente de um `<option>` o navegador
   * joga fora. Se alguém "simplificar" para " ".repeat, o recuo some da tela
   * e nenhum outro teste percebe.
   */
  it("usa o espaço não separável, não o comum", () => {
    expect(categoryOptionIndent(1)).not.toContain(" ");
  });
});
