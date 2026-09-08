import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  buildDailyFlow,
  buildMonthlyFlow,
  runwayMonths,
  toWeeks,
  type FlowRow,
} from "./cashflow";

const HOJE = "2026-09-15";

function row(values: Partial<FlowRow> & { transactionDate: string; amount: number }): FlowRow {
  return {
    status: "Pago",
    type: values.amount >= 0 ? "entrada" : "saida",
    description: "Movimento",
    category: "Receitas Operacionais/Prestação de Serviços",
    ...values,
  };
}

const janela = { opening: 100_000, start: "2026-09-01", end: "2026-09-30", todayIso: HOJE };

describe("addDaysIso", () => {
  it("anda pelo calendário virando mês e ano", () => {
    expect(addDaysIso("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysIso("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
  });
});

describe("buildDailyFlow", () => {
  it("omite os dias sem movimento", () => {
    const flow = buildDailyFlow([row({ transactionDate: "2026-09-03", amount: 1_000 })], janela);
    expect(flow.days.map(day => day.date)).toEqual(["2026-09-03"]);
  });

  it("no passado o saldo conta só o que está pago", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-03", amount: 5_000 }),
        row({ transactionDate: "2026-09-04", amount: 9_000, status: "Pendente" }),
      ],
      janela
    );
    expect(flow.days.map(day => [day.date, day.balance])).toEqual([
      ["2026-09-03", 105_000],
      ["2026-09-04", 105_000],
    ]);
  });

  it("a projeção parte do saldo real e soma os pendentes", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-03", amount: 5_000 }),
        row({ transactionDate: "2026-09-20", amount: 7_000, status: "Pendente" }),
        row({ transactionDate: "2026-09-25", amount: -2_000, status: "Pendente" }),
      ],
      janela
    );
    expect(flow.days.map(day => [day.date, day.balance, day.realized])).toEqual([
      ["2026-09-03", 105_000, true],
      ["2026-09-20", 112_000, false],
      ["2026-09-25", 110_000, false],
    ]);
    expect(flow.closing).toBe(110_000);
  });

  it("o atrasado entra no primeiro dia projetado, não no passado", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-02", amount: -4_000, status: "Pendente" }),
        row({ transactionDate: "2026-09-20", amount: 1_000, status: "Pendente" }),
      ],
      janela
    );
    expect(flow.days.map(day => [day.date, day.balance])).toEqual([
      ["2026-09-02", 100_000],
      ["2026-09-20", 97_000],
    ]);
  });

  it("o pendente de hoje já conta como projeção", () => {
    const flow = buildDailyFlow([row({ transactionDate: HOJE, amount: 3_000, status: "Pendente" })], janela);
    expect(flow.days[0]).toMatchObject({ balance: 103_000, realized: true });
  });

  it("transferência entre contas não move o caixa total", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-03", amount: -8_000, type: "transferencia" }),
        row({ transactionDate: "2026-09-03", amount: 8_000, type: "transferencia" }),
      ],
      janela
    );
    expect(flow.days).toEqual([]);
    expect(flow.closing).toBe(100_000);
  });

  it("soma entradas e saídas do período", () => {
    const flow = buildDailyFlow(
      [row({ transactionDate: "2026-09-03", amount: 6_000 }), row({ transactionDate: "2026-09-04", amount: -2_500 })],
      janela
    );
    expect(flow.totals).toEqual({ incoming: 6_000, outgoing: 2_500 });
  });

  it("aponta o menor saldo, a maior entrada e o dia mais apertado", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-03", amount: -30_000 }),
        row({ transactionDate: "2026-09-08", amount: 17_930, description: "Assinaturas · lote 2" }),
        row({ transactionDate: "2026-09-22", amount: -32_580, status: "Pendente" }),
        row({ transactionDate: "2026-09-22", amount: 1_000, status: "Pendente" }),
      ],
      janela
    );
    expect(flow.lowest).toEqual({ date: "2026-09-22", balance: 56_350 });
    expect(flow.biggestIncome).toEqual({ date: "2026-09-08", description: "Assinaturas · lote 2", amount: 17_930 });
    expect(flow.tightestDay).toEqual({ date: "2026-09-22", amount: -31_580 });
  });

  it("ignora o que está fora da janela", () => {
    const flow = buildDailyFlow(
      [row({ transactionDate: "2026-08-31", amount: 9_999 }), row({ transactionDate: "2026-10-01", amount: 9_999 })],
      janela
    );
    expect(flow.days).toEqual([]);
    expect(flow.closing).toBe(100_000);
  });
});

describe("toWeeks", () => {
  it("junta os dias em blocos de sete a partir do início da janela", () => {
    const flow = buildDailyFlow(
      [
        row({ transactionDate: "2026-09-01", amount: 1_000 }),
        row({ transactionDate: "2026-09-05", amount: 2_000 }),
        row({ transactionDate: "2026-09-09", amount: -500 }),
      ],
      janela
    );
    const weeks = toWeeks(flow, janela.start);
    expect(weeks.map(week => [week.date, week.incoming, week.outgoing, week.balance])).toEqual([
      ["2026-09-01", 3_000, 0, 103_000],
      ["2026-09-08", 0, 500, 102_500],
    ]);
  });

  it("a semana só é realizada se todos os dias dela forem", () => {
    const flow = buildDailyFlow(
      [row({ transactionDate: "2026-09-15", amount: 100 }), row({ transactionDate: "2026-09-17", amount: 100, status: "Pendente" })],
      janela
    );
    expect(toWeeks(flow, janela.start).map(week => week.realized)).toEqual([false]);
  });
});

describe("buildMonthlyFlow", () => {
  const meses = [
    { year: 2026, month: 8 },
    { year: 2026, month: 9 },
    { year: 2026, month: 10 },
  ];

  const rows = [
    row({ transactionDate: "2026-08-10", amount: 50_000 }),
    row({ transactionDate: "2026-08-20", amount: -20_000, category: "Despesas Fixas/Salários e Pró-labore" }),
    row({ transactionDate: "2026-09-10", amount: 80_000 }),
    row({ transactionDate: "2026-09-20", amount: -30_000, category: "Despesas Fixas/Salários e Pró-labore" }),
    row({ transactionDate: "2026-10-05", amount: 40_000, status: "Pendente" }),
  ];

  it("encadeia o saldo de um mês para o outro", () => {
    const columns = buildMonthlyFlow(rows, { opening: 100_000, months: meses, todayIso: HOJE });
    expect(columns.map(column => [column.label, column.opening, column.result, column.closing])).toEqual([
      ["ago", 100_000, 30_000, 130_000],
      ["set", 130_000, 50_000, 180_000],
      ["out", 180_000, 40_000, 220_000],
    ]);
  });

  it("marca como projeção o mês que ainda não começou", () => {
    const columns = buildMonthlyFlow(rows, { opening: 0, months: meses, todayIso: HOJE });
    expect(columns.map(column => column.projected)).toEqual([false, false, true]);
  });

  it("abre entradas e saídas pela raiz da categoria", () => {
    const [agosto] = buildMonthlyFlow(rows, { opening: 0, months: [meses[0]], todayIso: HOJE });
    expect(agosto.incomingByRoot).toEqual([{ label: "Receitas Operacionais", value: 50_000 }]);
    expect(agosto.outgoingByRoot).toEqual([{ label: "Despesas Fixas", value: 20_000 }]);
  });

  it("ordena as naturezas da maior para a menor", () => {
    const columns = buildMonthlyFlow(
      [
        row({ transactionDate: "2026-09-02", amount: -1_000, category: "Despesas Variáveis/Marketing" }),
        row({ transactionDate: "2026-09-03", amount: -9_000, category: "Despesas Fixas/Aluguel" }),
      ],
      { opening: 0, months: [meses[1]], todayIso: HOJE }
    );
    expect(columns[0].outgoingByRoot.map(root => root.label)).toEqual(["Despesas Fixas", "Despesas Variáveis"]);
  });

  it("mês sem saída mostra zero, não zero negativo", () => {
    const [mes] = buildMonthlyFlow([row({ transactionDate: "2026-09-05", amount: 1_000 })], {
      opening: 0,
      months: [{ year: 2026, month: 9 }],
      todayIso: HOJE,
    });
    expect(Object.is(mes.outgoing, -0)).toBe(false);
    expect(mes.outgoing).toBe(0);
  });

  it("mês sem lançamento carrega o saldo adiante", () => {
    const columns = buildMonthlyFlow([], { opening: 42_000, months: meses, todayIso: HOJE });
    expect(columns.map(column => column.closing)).toEqual([42_000, 42_000, 42_000]);
  });
});

describe("runwayMonths", () => {
  it("divide o caixa pela saída média", () => {
    expect(runwayMonths(84_000, 10_000)).toBe(8.4);
  });

  it("sem despesa ou sem caixa não existe prazo", () => {
    expect(runwayMonths(84_000, 0)).toBeNull();
    expect(runwayMonths(0, 10_000)).toBeNull();
    expect(runwayMonths(-500, 10_000)).toBeNull();
  });
});
