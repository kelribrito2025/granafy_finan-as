import { describe, expect, it } from "vitest";
import type {
  FinancialAccountRecord,
  PatrimonialItemRecord,
  TransactionRecord,
} from "../drizzle/schema";
import {
  calculateFinancialPositions,
  summarizeAccountPositions,
  calculateItemBookValue,
  calculatePatrimonialItems,
  summarizeBalanceSheet,
} from "./balanceSheet";
import { umaConta, umBem, umLancamento } from "./fixtures";
import { patrimonialItemValuesSchema } from "./routers/balanceSheet";

function patrimonialItem(overrides: Partial<PatrimonialItemRecord> = {}): PatrimonialItemRecord {
  return umBem({
    name: "Veículo operacional",
    acquisitionDate: "2025-01-15",
    acquisitionValue: "12000.00",
    currentValue: "12000.00",
    ...overrides,
  });
}

function account(
  id: number,
  type: FinancialAccountRecord["accountType"],
  initialBalance: string
): FinancialAccountRecord {
  return umaConta({ id, name: `Conta ${id}`, institution: "Teste", accountType: type, initialBalance });
}

function transaction(
  id: number,
  accountId: number,
  amount: string,
  status: TransactionRecord["status"] = "Pago"
): TransactionRecord {
  return umLancamento({
    id,
    accountId,
    amount,
    status,
    type: Number(amount) >= 0 ? "entrada" : "saida",
    description: "Teste patrimonial",
  });
}

describe("balance sheet calculations", () => {
  it("uses the explicit current value for manual valuation", () => {
    expect(calculateItemBookValue(
      patrimonialItem({ currentValue: "9876.54" }),
      "2026-09-07"
    )).toBe(9876.54);
  });

  it("calculates linear depreciation down to the residual value", () => {
    const item = patrimonialItem({
      valuationMethod: "depreciacao_linear",
      usefulLifeMonths: 12,
      residualValue: "2000.00",
    });
    expect(calculateItemBookValue(item, "2025-07-15")).toBe(7000);
    expect(calculateItemBookValue(item, "2027-01-15")).toBe(2000);
  });

  it("excludes inactive and not-yet-acquired items from the position", () => {
    expect(calculateItemBookValue(
      patrimonialItem({ isActive: false }),
      "2026-09-07"
    )).toBe(0);
    expect(calculateItemBookValue(
      patrimonialItem({ acquisitionDate: "2027-01-01" }),
      "2026-09-07"
    )).toBe(0);
  });

  it("separates positive bank balances from card and overdraft liabilities", () => {
    const positions = calculateFinancialPositions(
      [account(1, "corrente", "1000.00"), account(2, "cartao", "0.00")],
      [
        transaction(1, 1, "500.00"),
        transaction(2, 2, "-250.00"),
        transaction(3, 1, "-100.00", "Pendente"),
      ],
      "2026-09-07"
    );
    expect(positions).toEqual({ cashAndEquivalents: 1500, currentLiabilities: 250 });
  });

  it("chega ao mesmo resultado partindo do movimento já somado por conta", () => {
    const accounts = [account(1, "corrente", "1000.00"), account(2, "cartao", "0.00")];
    const pelaLista = calculateFinancialPositions(
      accounts,
      [transaction(1, 1, "500.00"), transaction(2, 2, "-250.00")],
      "2026-09-07"
    );
    const peloAgregado = summarizeAccountPositions(accounts, new Map([[1, 500], [2, -250]]));
    expect(peloAgregado).toEqual(pelaLista);
    expect(peloAgregado).toEqual({ cashAndEquivalents: 1500, currentLiabilities: 250 });
  });

  it("ignora movimento de conta que não está na lista", () => {
    expect(summarizeAccountPositions([account(1, "corrente", "100.00")], new Map([[9, 5000]])))
      .toEqual({ cashAndEquivalents: 100, currentLiabilities: 0 });
  });

  it("cartão com saldo positivo não vira caixa", () => {
    // Crédito sobrando no cartão é limite, não dinheiro em conta.
    expect(summarizeAccountPositions(
      [account(1, "corrente", "1000.00"), account(2, "cartao", "300.00")],
      new Map()
    )).toEqual({ cashAndEquivalents: 1000, currentLiabilities: 0 });
  });

  it("conta sem movimento fica com o saldo inicial", () => {
    expect(summarizeAccountPositions([account(1, "corrente", "250.00")], new Map()))
      .toEqual({ cashAndEquivalents: 250, currentLiabilities: 0 });
  });

  it("summarizes assets, liabilities, net worth and accounting indicators", () => {
    const items = calculatePatrimonialItems([
      patrimonialItem({ id: 1, name: "Estoque", balanceGroup: "ativo_circulante", currentValue: "5000.00" }),
      patrimonialItem({ id: 2, name: "Imobilizado", balanceGroup: "ativo_nao_circulante", currentValue: "20000.00" }),
      patrimonialItem({ id: 3, name: "Fornecedores", balanceGroup: "passivo_circulante", currentValue: "4000.00" }),
      patrimonialItem({ id: 4, name: "Financiamento", balanceGroup: "passivo_nao_circulante", currentValue: "1000.00" }),
      patrimonialItem({ id: 5, name: "Capital", balanceGroup: "patrimonio_liquido", currentValue: "18000.00" }),
    ], "2026-09-07");

    expect(summarizeBalanceSheet(items, 1500, 250)).toEqual({
      cashAndEquivalents: 1500,
      financialCurrentLiabilities: 250,
      manualCurrentAssets: 5000,
      currentAssets: 6500,
      nonCurrentAssets: 20000,
      currentLiabilities: 4250,
      nonCurrentLiabilities: 1000,
      declaredEquity: 18000,
      totalAssets: 26500,
      totalLiabilities: 5250,
      netWorth: 21250,
      balanceDifference: 3250,
      liquidityRatio: 1.53,
      debtRatio: 19.81,
    });
  });

  it("rejects future acquisitions and incomplete linear depreciation", () => {
    const base = {
      name: "Bem validado",
      balanceGroup: "ativo_nao_circulante" as const,
      itemType: "bem" as const,
      acquisitionDate: "2999-01-01",
      acquisitionValue: 12000,
      currentValue: 12000,
      valuationMethod: "depreciacao_linear" as const,
      usefulLifeMonths: null,
      residualValue: 15000,
      notes: "",
    };
    const result = patrimonialItemValuesSchema.safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map(issue => issue.path[0])).toEqual(
        expect.arrayContaining(["acquisitionDate", "usefulLifeMonths", "residualValue"])
      );
    }
  });
});

describe("saldo inicial com data, no caminho em memória", () => {
  it("lançamentos até a data do saldo inicial não somam — a mesma regra do SUM do banco", () => {
    const conta = umaConta({ id: 1, accountType: "corrente", initialBalance: "10000.00", initialBalanceDate: "2026-09-15" });
    const lancamentos = [
      umLancamento({ id: 1, accountId: 1, status: "Pago", transactionDate: "2026-09-10", amount: "5000.00" }),
      umLancamento({ id: 2, accountId: 1, status: "Pago", transactionDate: "2026-09-15", amount: "-200.00" }),
      umLancamento({ id: 3, accountId: 1, status: "Pago", transactionDate: "2026-09-16", amount: "300.00" }),
    ];
    expect(calculateFinancialPositions([conta], lancamentos, "2026-09-30").cashAndEquivalents).toBe(10_300);
    // Sem data, tudo soma: é o comportamento das contas que já existiam.
    const semData = umaConta({ id: 1, accountType: "corrente", initialBalance: "10000.00", initialBalanceDate: null });
    expect(calculateFinancialPositions([semData], lancamentos, "2026-09-30").cashAndEquivalents).toBe(15_100);
  });
});
