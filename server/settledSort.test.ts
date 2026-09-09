import { describe, expect, it } from "vitest";
import { buildSettledDayGroups, sortSettled } from "../client/src/lib/settledSort";

const linhas = [
  { id: 1, settledAt: "2026-09-06", description: "Tarifa Pix", amount: -4 },
  { id: 2, settledAt: "2026-09-02", description: "aluguel da sala", amount: 100 },
  { id: 3, settledAt: "2026-09-05", description: "Boleto Energia", amount: -50 },
];

describe("ordenação de pagas e recebidas", () => {
  it("ordena o valor pelo módulo, nos dois sentidos", () => {
    expect(sortSettled(linhas, "amount", "desc").map(l => l.id)).toEqual([2, 3, 1]);
    expect(sortSettled(linhas, "amount", "asc").map(l => l.id)).toEqual([1, 3, 2]);
  });

  it("ordena o título ignorando maiúsculas e acentos", () => {
    expect(sortSettled(linhas, "description", "asc").map(l => l.description)).toEqual([
      "aluguel da sala",
      "Boleto Energia",
      "Tarifa Pix",
    ]);
    expect(sortSettled(linhas, "description", "desc").map(l => l.id)).toEqual([1, 3, 2]);
  });

  it("trata maiúscula e minúscula como a mesma letra no título", () => {
    /*
     * "Pix" e "pix" são o mesmo título para quem lê. Sem `sensitivity: "base"`
     * eles comparam diferente, e a lista trocaria os dois de lugar cada vez que
     * a pessoa inverte a coluna — ruído puro numa tela de conferência.
     */
    const mesmaPalavra = [
      { id: 9, settledAt: "2026-09-01", description: "pix recebido", amount: 10 },
      { id: 5, settledAt: "2026-09-01", description: "Pix recebido", amount: 20 },
    ];
    expect(sortSettled(mesmaPalavra, "description", "asc").map(l => l.id)).toEqual([5, 9]);
    expect(sortSettled(mesmaPalavra, "description", "desc").map(l => l.id)).toEqual([5, 9]);
  });

  it("ordena a data de liquidação nos dois sentidos", () => {
    expect(sortSettled(linhas, "settledAt", "asc").map(l => l.settledAt)).toEqual([
      "2026-09-02",
      "2026-09-05",
      "2026-09-06",
    ]);
    expect(sortSettled(linhas, "settledAt", "desc").map(l => l.id)).toEqual([1, 3, 2]);
  });

  it("joga o título sem data para o fim, nos dois sentidos", () => {
    const comNulo = [...linhas, { id: 4, settledAt: null, description: "Sem data", amount: 7 }];
    expect(sortSettled(comNulo, "settledAt", "asc").at(-1)?.id).toBe(4);
    expect(sortSettled(comNulo, "settledAt", "desc").at(0)?.id).toBe(4);
  });

  it("desempata pelo id sem inverter junto com a direção", () => {
    const mesmoValor = [
      { id: 9, settledAt: "2026-09-01", description: "B", amount: 10 },
      { id: 5, settledAt: "2026-09-01", description: "A", amount: -10 },
    ];
    expect(sortSettled(mesmoValor, "amount", "asc").map(l => l.id)).toEqual([5, 9]);
    expect(sortSettled(mesmoValor, "amount", "desc").map(l => l.id)).toEqual([5, 9]);
  });

  it("não mexe no array recebido", () => {
    const original = [...linhas];
    sortSettled(linhas, "amount", "desc");
    expect(linhas).toEqual(original);
  });

  it("com ordenação, vira um grupo só e o dia some do cabeçalho", () => {
    const grupos = buildSettledDayGroups(linhas, { key: "amount", direction: "desc" });
    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.date).toBeNull();
    expect(grupos[0]?.linhas.map(l => [l.id, l.settledAt])).toEqual([
      [2, "2026-09-02"],
      [3, "2026-09-05"],
      [1, "2026-09-06"],
    ]);
    // O líquido do grupo único é o do recorte inteiro: 100 − 50 − 4.
    expect(grupos[0]?.liquido).toBe(46);
  });

  it("sem ordenação, agrupa por dia na ordem de chegada e soma o líquido de cada um", () => {
    const doMesmoDia = [...linhas, { id: 4, settledAt: "2026-09-06", description: "Pix recebido", amount: 30 }];
    const grupos = buildSettledDayGroups(doMesmoDia, null);
    expect(grupos.map(g => [g.date, g.linhas.length, g.liquido])).toEqual([
      ["2026-09-06", 2, 26],
      ["2026-09-02", 1, 100],
      ["2026-09-05", 1, -50],
    ]);
  });
});
