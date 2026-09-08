import { describe, expect, it } from "vitest";
import { assetDepreciationIn, breakEvenDay, lastDayOf, shiftMonth } from "./routers/dre";

type Item = Parameters<typeof assetDepreciationIn>[0][number];

function asset(values: Partial<Item> = {}): Item {
  return {
    id: 1,
    userId: 1,
    name: "Notebook",
    balanceGroup: "ativo_nao_circulante",
    itemType: "bem",
    acquisitionDate: "2026-01-15",
    acquisitionValue: "12000.00",
    currentValue: "12000.00",
    valuationMethod: "depreciacao_linear",
    usefulLifeMonths: 24,
    residualValue: "0.00",
    notes: "",
    assetCategory: "equipamentos",
    costCenter: "",
    costCenterId: null,
    sourceAccount: "",
    sourceAccountId: null,
    attachmentKey: null,
    attachmentName: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
  } as Item;
}

type Row = Parameters<typeof breakEvenDay>[0][number];

function entry(transactionDate: string, amount: string, values: Partial<Row> = {}): Row {
  return {
    id: 1,
    userId: 1,
    type: "entrada",
    transactionDate,
    description: "Venda",
    contact: "",
    category: "Receitas Operacionais/Venda de Produtos",
    amount,
    account: "CloudWalk",
    accountId: 1,
    categoryId: null,
    costCenter: "",
    costCenterId: null,
    importBatchId: null,
    status: "Pago",
    recurring: false,
    recurringMonths: null,
    recurrenceGroupId: null,
    recurrenceIndex: null,
    attachmentKey: null,
    attachmentName: null,
    transferGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...values,
  } as Row;
}

describe("shiftMonth", () => {
  it("anda para trás e para a frente virando o ano", () => {
    expect(shiftMonth(2026, 1, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth(2026, 12, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth(2026, 9, -5)).toEqual({ year: 2026, month: 4 });
  });
});

describe("lastDayOf", () => {
  it("acerta fevereiro bissexto e os meses de 30 dias", () => {
    expect(lastDayOf(2026, 2)).toBe("2026-02-28");
    expect(lastDayOf(2028, 2)).toBe("2028-02-29");
    expect(lastDayOf(2026, 4)).toBe("2026-04-30");
    expect(lastDayOf(2026, 12)).toBe("2026-12-31");
  });
});

describe("assetDepreciationIn", () => {
  it("cobra uma parcela da vida útil por mês", () => {
    expect(assetDepreciationIn([asset()], 2026, 5)).toBe(500);
  });

  it("não deprecia antes da aquisição", () => {
    expect(assetDepreciationIn([asset({ acquisitionDate: "2026-06-10" })], 2026, 5)).toBe(0);
  });

  it("para de depreciar quando a vida útil acaba", () => {
    expect(assetDepreciationIn([asset({ usefulLifeMonths: 3 })], 2026, 9)).toBe(0);
  });

  it("ignora bem avaliado manualmente", () => {
    expect(assetDepreciationIn([asset({ valuationMethod: "manual" })], 2026, 5)).toBe(0);
  });

  it("ignora bem inativo", () => {
    expect(assetDepreciationIn([asset({ isActive: false })], 2026, 5)).toBe(0);
  });

  it("respeita o valor residual", () => {
    const item = asset({ acquisitionValue: "12000.00", residualValue: "6000.00", usefulLifeMonths: 12 });
    expect(assetDepreciationIn([item], 2026, 5)).toBe(500);
  });

  it("soma os bens do período", () => {
    expect(assetDepreciationIn([asset(), asset({ id: 2 })], 2026, 5)).toBe(1_000);
  });

  /*
   * Bem comprado no dia 31 deprecia irregular: os meses de 30 dias fecham antes
   * do aniversário e a parcela cai no mês seguinte. É o mesmo `elapsedMonths` do
   * balanço, e o acumulado do ano continua exato — o teste abaixo fixa isso para
   * a irregularidade não passar por engano se o cálculo mudar.
   */
  it("acumula a parcela do mês seguinte quando o bem foi comprado dia 31", () => {
    const dia31 = asset({ acquisitionDate: "2026-01-31" });
    expect(assetDepreciationIn([dia31], 2026, 4)).toBe(0);
    expect(assetDepreciationIn([dia31], 2026, 5)).toBe(1_000);
  });

  it("o ano inteiro soma doze parcelas, mês a mês", () => {
    const item = asset({ acquisitionDate: "2025-12-15" });
    const total = Array.from({ length: 12 }, (_, index) => assetDepreciationIn([item], 2026, index + 1))
      .reduce((sum, value) => sum + value, 0);
    expect(total).toBe(6_000);
  });
});

describe("breakEvenDay", () => {
  const rows = [
    entry("2026-09-03", "10000.00"),
    entry("2026-09-10", "10000.00"),
    entry("2026-09-18", "10000.00"),
    entry("2026-09-25", "10000.00"),
  ];

  it("devolve o dia em que a receita acumulada cobre o alvo", () => {
    expect(breakEvenDay(rows, 25_000, "competencia")).toBe("2026-09-18");
  });

  it("devolve null quando o mês termina sem alcançar", () => {
    expect(breakEvenDay(rows, 90_000, "competencia")).toBeNull();
  });

  it("sem alvo não há dia", () => {
    expect(breakEvenDay(rows, null, "competencia")).toBeNull();
    expect(breakEvenDay(rows, 0, "competencia")).toBeNull();
  });

  it("no regime de caixa ignora o que está pendente", () => {
    const comPendente = [
      entry("2026-09-03", "10000.00"),
      entry("2026-09-05", "20000.00", { status: "Pendente" }),
      entry("2026-09-28", "20000.00"),
    ];
    expect(breakEvenDay(comPendente, 25_000, "competencia")).toBe("2026-09-05");
    expect(breakEvenDay(comPendente, 25_000, "caixa")).toBe("2026-09-28");
  });

  it("não conta saída nem transferência como receita", () => {
    const misturado = [
      entry("2026-09-02", "-40000.00", { type: "saida" }),
      entry("2026-09-04", "30000.00", { type: "transferencia" }),
      entry("2026-09-20", "30000.00"),
    ];
    expect(breakEvenDay(misturado, 25_000, "competencia")).toBe("2026-09-20");
  });

  it("soma o dia inteiro antes de decidir", () => {
    const mesmoDia = [entry("2026-09-07", "12000.00"), entry("2026-09-07", "14000.00")];
    expect(breakEvenDay(mesmoDia, 25_000, "competencia")).toBe("2026-09-07");
  });
});
