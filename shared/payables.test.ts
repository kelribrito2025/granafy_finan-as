import { describe, expect, it } from "vitest";
import { buildPayablesView, titleStatusOf, toTitle, type TitleRow } from "./payables";

const HOJE = "2026-09-15";

function row(values: Partial<TitleRow> & { transactionDate: string; amount: number }): TitleRow {
  return {
    id: 1,
    type: values.amount >= 0 ? "entrada" : "saida",
    description: "Título",
    contact: "",
    category: "Receitas Operacionais",
    account: "CloudWalk",
    status: "Pendente",
    ...values,
  };
}

describe("titleStatusOf", () => {
  it("classifica pelo vencimento e pelo status", () => {
    expect(titleStatusOf({ status: "Pendente", transactionDate: "2026-09-10" }, HOJE)).toBe("atrasado");
    expect(titleStatusOf({ status: "Pendente", transactionDate: HOJE }, HOJE)).toBe("vence_hoje");
    expect(titleStatusOf({ status: "Pendente", transactionDate: "2026-09-20" }, HOJE)).toBe("em_aberto");
  });

  it("o que já foi pago sai da fila, mesmo vencido", () => {
    expect(titleStatusOf({ status: "Pago", transactionDate: "2026-01-02" }, HOJE)).toBe("liquidado");
  });
});

describe("toTitle", () => {
  it("conta os dias de atraso", () => {
    expect(toTitle(row({ transactionDate: "2026-09-10", amount: -500 }), HOJE).daysLate).toBe(5);
  });

  it("não conta atraso em título no prazo", () => {
    expect(toTitle(row({ transactionDate: "2026-09-20", amount: -500 }), HOJE).daysLate).toBe(0);
  });

  it("separa o lado pelo sinal do valor", () => {
    expect(toTitle(row({ transactionDate: HOJE, amount: 900 }), HOJE).side).toBe("receber");
    expect(toTitle(row({ transactionDate: HOJE, amount: -900 }), HOJE).side).toBe("pagar");
  });
});

describe("buildPayablesView", () => {
  const rows: TitleRow[] = [
    row({ id: 1, transactionDate: "2026-09-02", amount: -3_180, description: "Twilio" }),
    row({ id: 2, transactionDate: "2026-09-04", amount: -1_000, description: "AWS" }),
    row({ id: 3, transactionDate: HOJE, amount: 8_740, description: "Assinaturas Pix" }),
    row({ id: 4, transactionDate: HOJE, amount: -890, description: "Contabilidade" }),
    row({ id: 5, transactionDate: "2026-09-18", amount: 9_480, description: "Repasse" }),
    row({ id: 6, transactionDate: "2026-09-29", amount: 6_020, description: "Comissões" }),
    row({ id: 7, transactionDate: "2026-09-08", amount: 5_000, description: "Recebido", status: "Pago" }),
    row({ id: 8, transactionDate: HOJE, amount: -20_000, description: "Entre contas", type: "transferencia" }),
  ];

  const view = buildPayablesView(rows, HOJE);

  it("deixa fora o que já foi pago e as transferências", () => {
    expect(view.open.map(title => title.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("ordena por vencimento", () => {
    expect(view.open.map(title => title.transactionDate)).toEqual([
      "2026-09-02", "2026-09-04", HOJE, HOJE, "2026-09-18", "2026-09-29",
    ]);
  });

  it("separa as duas pontas", () => {
    expect(view.receivables.map(title => title.id)).toEqual([3, 5, 6]);
    expect(view.payables.map(title => title.id)).toEqual([1, 2, 4]);
  });

  it("soma os totais das duas pontas e o saldo", () => {
    expect(view.totals.receivable).toBe(24_240);
    expect(view.totals.payable).toBe(-5_070);
    expect(view.totals.balance).toBe(19_170);
  });

  it("destaca o atraso e o que vence hoje", () => {
    expect(view.overdue.map(title => title.id)).toEqual([1, 2]);
    expect(view.totals.overdue).toBe(-4_180);
    expect(view.totals.overduePayable).toBe(-4_180);
    expect(view.totals.overdueReceivable).toBe(0);
    expect(view.dueToday.map(title => title.id)).toEqual([3, 4]);
    expect(view.totals.dueTodayReceivable).toBe(8_740);
  });

  it("separa as duas pontas dentro de um grupo misto", () => {
    const hoje = view.groups.find(group => group.key === "hoje");
    expect(hoje).toMatchObject({ receivable: 8_740, payable: -890, balance: 7_850 });
  });

  it("o atraso vermelho é só a dívida, não o líquido", () => {
    const comAtrasoDosDoisLados = buildPayablesView(
      [
        row({ id: 20, transactionDate: "2026-09-01", amount: 10_000 }),
        row({ id: 21, transactionDate: "2026-09-01", amount: -2_000 }),
      ],
      HOJE
    );
    expect(comAtrasoDosDoisLados.totals.overdue).toBe(8_000);
    expect(comAtrasoDosDoisLados.totals.overduePayable).toBe(-2_000);
    expect(comAtrasoDosDoisLados.totals.overdueReceivable).toBe(10_000);
  });

  it("agrupa por janela de vencimento", () => {
    expect(view.groups.map(group => [group.key, group.titles.length, group.balance])).toEqual([
      ["atrasados", 2, -4_180],
      ["hoje", 2, 7_850],
      ["proximos", 1, 9_480],
      ["depois", 1, 6_020],
    ]);
  });

  it("não devolve grupo vazio", () => {
    const semAtraso = buildPayablesView([row({ id: 9, transactionDate: "2026-09-20", amount: 100 })], HOJE);
    expect(semAtraso.groups.map(group => group.key)).toEqual(["proximos"]);
  });

  it("o sétimo dia ainda é 'próximos', o oitavo já é 'depois'", () => {
    const limite = buildPayablesView(
      [row({ id: 10, transactionDate: "2026-09-22", amount: 1 }), row({ id: 11, transactionDate: "2026-09-23", amount: 1 })],
      HOJE
    );
    expect(limite.groups.map(group => [group.key, group.titles.map(title => title.id)])).toEqual([
      ["proximos", [10]],
      ["depois", [11]],
    ]);
  });

  it("devolve tudo zerado quando não há título", () => {
    const vazio = buildPayablesView([], HOJE);
    expect(vazio.open).toEqual([]);
    expect(vazio.groups).toEqual([]);
    expect(vazio.totals).toEqual({
      receivable: 0,
      payable: 0,
      balance: 0,
      overdue: 0,
      overduePayable: 0,
      overdueReceivable: 0,
      dueTodayReceivable: 0,
    });
  });
});
