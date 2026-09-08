import { describe, expect, it } from "vitest";
import {
  breakEvenRevenue,
  buildDreStatement,
  dreBucketOf,
  marginOf,
  rootOf,
  variationHelpsProfit,
  variationOf,
  type DreRow,
} from "./dre";

function row(category: string, amount: number, extra: Partial<DreRow> = {}): DreRow {
  return {
    category,
    amount,
    type: amount >= 0 ? "entrada" : "saida",
    status: "Pago",
    ...extra,
  };
}

const lineOf = (statement: ReturnType<typeof buildDreStatement>, key: string) =>
  statement.lines.find(line => line.key === key);

describe("dreBucketOf", () => {
  it("mapeia cada raiz do plano padrão para a sua linha", () => {
    expect(dreBucketOf("Receitas Operacionais/Prestação de Serviços", "entrada")).toBe("receita_bruta");
    expect(dreBucketOf("Outras Receitas", "entrada")).toBe("receita_bruta");
    expect(dreBucketOf("Impostos sobre Vendas/Simples Nacional (DAS)", "saida")).toBe("deducoes");
    expect(dreBucketOf("Descontos e Abatimentos/Abatimentos", "saida")).toBe("deducoes");
    expect(dreBucketOf("Custos Operacionais/Mercadorias Compradas (CMV)", "saida")).toBe("custos");
    expect(dreBucketOf("Despesas Fixas/Salários e Pró-labore", "saida")).toBe("despesas_operacionais");
    expect(dreBucketOf("Despesas Variáveis/Comissões de Vendas", "saida")).toBe("despesas_operacionais");
    expect(dreBucketOf("Depreciação e Amortização", "saida")).toBe("depreciacao");
    expect(dreBucketOf("Receitas Financeiras", "entrada")).toBe("financeiro");
    expect(dreBucketOf("Despesas Financeiras/Tarifas Bancárias e de Cartão", "saida")).toBe("financeiro");
    expect(dreBucketOf("Impostos sobre Lucro/IRPJ", "saida")).toBe("impostos_lucro");
    expect(dreBucketOf("Despesas não Operacionais/Perda na Venda de Ativo", "saida")).toBe("nao_operacional");
  });

  it("tira do resultado o que é compra de ativo ou distribuição de lucro", () => {
    expect(dreBucketOf("Despesas com de ativos imobilizados/Compra de Equipamentos", "saida")).toBe("fora_do_resultado");
    expect(dreBucketOf("Distribuição de Lucros/Dividendos e Lucros Distribuídos", "saida")).toBe("fora_do_resultado");
  });

  it("ignora acento e caixa ao reconhecer a raiz", () => {
    expect(dreBucketOf("DESPESAS VARIAVEIS/Frete", "saida")).toBe("despesas_operacionais");
    expect(dreBucketOf("depreciacao e amortizacao", "saida")).toBe("depreciacao");
  });

  it("classifica categoria desconhecida pelo tipo do lançamento", () => {
    expect(dreBucketOf("Consultoria avulsa", "entrada")).toBe("receita_bruta");
    expect(dreBucketOf("Consultoria avulsa", "saida")).toBe("despesas_operacionais");
    expect(dreBucketOf("", "saida")).toBe("despesas_operacionais");
  });
});

describe("rootOf", () => {
  it("devolve o trecho antes da primeira barra", () => {
    expect(rootOf("Custos Operacionais/Insumos")).toBe("Custos Operacionais");
    expect(rootOf("Outras Receitas")).toBe("Outras Receitas");
    expect(rootOf("  ")).toBe("Sem categoria");
  });
});

describe("buildDreStatement", () => {
  const rows: DreRow[] = [
    row("Receitas Operacionais/Prestação de Serviços", 80_000),
    row("Receitas Operacionais/Venda de Produtos", 20_000),
    row("Outras Receitas", 5_000),
    row("Impostos sobre Vendas/Simples Nacional (DAS)", -6_000),
    row("Descontos e Abatimentos/Abatimentos", -1_000),
    row("Custos Operacionais/Matéria-Prima e Insumos", -30_000),
    row("Despesas Fixas/Salários e Pró-labore", -18_000),
    row("Despesas Variáveis/Marketing e Publicidade", -7_000),
    row("Depreciação e Amortização", -2_000),
    row("Receitas Financeiras", 1_500),
    row("Despesas Financeiras/Tarifas Bancárias e de Cartão", -500),
    row("Impostos sobre Lucro/IRPJ", -3_000),
  ];

  it("soma cada degrau da demonstração", () => {
    const { totals } = buildDreStatement(rows, { regime: "competencia" });
    expect(totals.receitaBruta).toBe(105_000);
    expect(totals.deducoes).toBe(-7_000);
    expect(totals.receitaLiquida).toBe(98_000);
    expect(totals.custos).toBe(-30_000);
    expect(totals.margemContribuicao).toBe(68_000);
    expect(totals.despesasOperacionais).toBe(-25_000);
    expect(totals.ebitda).toBe(43_000);
    expect(totals.depreciacao).toBe(-2_000);
    expect(totals.financeiro).toBe(1_000);
    expect(totals.impostosLucro).toBe(-3_000);
    expect(totals.lucroLiquido).toBe(39_000);
  });

  it("separa despesa fixa de despesa variável dentro das operacionais", () => {
    const { totals } = buildDreStatement(rows, { regime: "competencia" });
    expect(totals.despesasFixas).toBe(-18_000);
    expect(totals.despesasOperacionais).toBe(-25_000);
  });

  it("monta grupo, item e subitem na ordem da demonstração", () => {
    const { lines } = buildDreStatement(rows, { regime: "competencia" });
    const receita = lines.slice(0, 5).map(line => [line.kind, line.label, line.value]);
    expect(receita).toEqual([
      ["grupo", "Receita bruta", 105_000],
      ["item", "Receitas Operacionais", 100_000],
      ["subitem", "Prestação de Serviços", 80_000],
      ["subitem", "Venda de Produtos", 20_000],
      ["item", "Outras Receitas", 5_000],
    ]);
    expect(lines[lines.length - 1]).toMatchObject({ kind: "resultado", label: "Lucro líquido", value: 39_000 });
  });

  it("detalha o resultado financeiro quando há mais de uma raiz", () => {
    const { lines } = buildDreStatement(rows, { regime: "competencia" });
    const detalhes = lines.filter(line => line.key.startsWith("financeiro/"));
    expect(detalhes.map(line => [line.label, line.value])).toEqual([
      ["Receitas Financeiras", 1_500],
      ["Despesas Financeiras", -500],
    ]);
  });

  it("não repete a linha de depreciação como subitem quando ela tem uma raiz só", () => {
    const { lines } = buildDreStatement(rows, { regime: "competencia" });
    expect(lines.filter(line => line.key.startsWith("depreciacao/"))).toEqual([]);
  });

  it("deixa transferência fora do resultado", () => {
    const comTransferencia = [
      ...rows,
      row("Transferência entre contas", -50_000, { type: "transferencia" }),
      row("Transferência entre contas", 50_000, { type: "transferencia" }),
    ];
    expect(buildDreStatement(comTransferencia, { regime: "competencia" }).totals.lucroLiquido).toBe(39_000);
  });

  it("no regime de caixa considera só o que está pago", () => {
    const comPendente = [
      ...rows,
      row("Receitas Operacionais/Prestação de Serviços", 40_000, { status: "Pendente" }),
    ];
    expect(buildDreStatement(comPendente, { regime: "competencia" }).totals.receitaBruta).toBe(145_000);
    expect(buildDreStatement(comPendente, { regime: "caixa" }).totals.receitaBruta).toBe(105_000);
  });

  it("mantém compra de ativo e distribuição de lucro fora do lucro, mas visíveis", () => {
    const comCapex = [
      ...rows,
      row("Despesas com de ativos imobilizados/Compra de Equipamentos", -12_000),
      row("Distribuição de Lucros/Dividendos e Lucros Distribuídos", -8_000),
    ];
    const { totals } = buildDreStatement(comCapex, { regime: "competencia" });
    expect(totals.lucroLiquido).toBe(39_000);
    expect(totals.foraDoResultado).toBe(-20_000);
  });

  it("soma a depreciação dos bens do balanço à linha e mostra a origem", () => {
    const statement = buildDreStatement(rows, { regime: "competencia", assetDepreciation: 1_200 });
    expect(statement.totals.depreciacao).toBe(-3_200);
    expect(statement.totals.lucroLiquido).toBe(37_800);
    expect(lineOf(statement, "depreciacao/bens")).toMatchObject({ kind: "subitem", value: -1_200 });
  });

  it("ignora depreciação de bens negativa", () => {
    const statement = buildDreStatement(rows, { regime: "competencia", assetDepreciation: -900 });
    expect(statement.totals.depreciacao).toBe(-2_000);
    expect(lineOf(statement, "depreciacao/bens")).toBeUndefined();
  });

  it("só mostra a linha não operacional quando ela existe", () => {
    expect(lineOf(buildDreStatement(rows, { regime: "competencia" }), "nao_operacional")).toBeUndefined();
    const comPerda = [...rows, row("Despesas não Operacionais/Perda na Venda de Ativo", -4_000)];
    const statement = buildDreStatement(comPerda, { regime: "competencia" });
    expect(lineOf(statement, "nao_operacional")).toMatchObject({ value: -4_000 });
    expect(statement.totals.lucroLiquido).toBe(35_000);
  });

  it("devolve a demonstração zerada quando não há lançamento", () => {
    const { totals, lines } = buildDreStatement([], { regime: "competencia" });
    expect(totals.receitaBruta).toBe(0);
    expect(totals.lucroLiquido).toBe(0);
    expect(lines.filter(line => line.kind === "resultado")).toHaveLength(1);
  });

  it("junta categorias iguais em vez de repetir a linha", () => {
    const repetidas = [
      row("Custos Operacionais/Insumos", -100),
      row("Custos Operacionais/Insumos", -250),
    ];
    const { lines } = buildDreStatement(repetidas, { regime: "competencia" });
    const insumos = lines.filter(line => line.label === "Insumos");
    expect(insumos).toHaveLength(1);
    expect(insumos[0].value).toBe(-350);
  });

  it("arredonda os centavos em vez de arrastar erro de ponto flutuante", () => {
    const centavos = [row("Receitas Operacionais/A", 0.1), row("Receitas Operacionais/B", 0.2)];
    expect(buildDreStatement(centavos, { regime: "competencia" }).totals.receitaBruta).toBe(0.3);
  });
});

describe("marginOf", () => {
  it("calcula a margem sobre a receita líquida", () => {
    expect(marginOf(39_000, 98_000)).toBe(39.8);
  });

  it("não inventa margem sem receita", () => {
    expect(marginOf(1_000, 0)).toBeNull();
    expect(marginOf(1_000, -500)).toBeNull();
  });
});

describe("variationOf", () => {
  it("compara com o período anterior", () => {
    expect(variationOf(110, 100)).toBe(10);
    expect(variationOf(90, 100)).toBe(-10);
  });

  it("lê o tamanho da linha: despesa que cresce aparece como aumento", () => {
    expect(variationOf(-120, -100)).toBe(20);
    expect(variationOf(-80, -100)).toBe(-20);
  });

  it("quando o sinal vira, usa a diferença com sinal", () => {
    expect(variationOf(-50, 100)).toBe(-150);
    expect(variationOf(50, -100)).toBe(150);
  });

  it("diz se a mudança ajudou o lucro", () => {
    expect(variationHelpsProfit(110, 100)).toBe(true);
    expect(variationHelpsProfit(-120, -100)).toBe(false);
    expect(variationHelpsProfit(-80, -100)).toBe(true);
  });

  it("não compara contra zero", () => {
    expect(variationOf(500, 0)).toBeNull();
  });
});

describe("breakEvenRevenue", () => {
  it("divide o custo fixo pelo índice de margem de contribuição", () => {
    expect(breakEvenRevenue({ despesasFixas: -18_000, margemContribuicao: 68_000, receitaLiquida: 98_000 })).toBe(25_941.18);
  });

  it("não existe ponto de equilíbrio sem custo fixo, sem receita ou com margem negativa", () => {
    expect(breakEvenRevenue({ despesasFixas: 0, margemContribuicao: 68_000, receitaLiquida: 98_000 })).toBeNull();
    expect(breakEvenRevenue({ despesasFixas: -18_000, margemContribuicao: 68_000, receitaLiquida: 0 })).toBeNull();
    expect(breakEvenRevenue({ despesasFixas: -18_000, margemContribuicao: -2_000, receitaLiquida: 98_000 })).toBeNull();
  });
});
