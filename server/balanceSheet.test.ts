import { describe, expect, it } from "vitest";
import type {
  FinancialAccountRecord,
  PatrimonialItemRecord,
  TransactionRecord,
} from "../drizzle/schema";
import {
  calculateFinancialPositions,
  calculateItemBookValue,
  calculatePatrimonialItems,
  summarizeBalanceSheet,
} from "./balanceSheet";
import { patrimonialItemValuesSchema } from "./routers/balanceSheet";

function patrimonialItem(
  overrides: Partial<PatrimonialItemRecord> = {}
): PatrimonialItemRecord {
  return {
    id: 1,
    userId: 1,
    name: "Veículo operacional",
    balanceGroup: "ativo_nao_circulante",
    itemType: "bem",
    acquisitionDate: "2025-01-15",
    acquisitionValue: "12000.00",
    currentValue: "12000.00",
    valuationMethod: "manual",
    usefulLifeMonths: null,
    residualValue: "0.00",
    notes: "",
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function account(
  id: number,
  type: FinancialAccountRecord["accountType"],
  initialBalance: string
): FinancialAccountRecord {
  return {
    id,
    userId: 1,
    name: `Conta ${id}`,
    institution: "Teste",
    accountType: type,
    color: "#12B85C",
    initialBalance,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function transaction(
  id: number,
  accountId: number,
  amount: string,
  status: TransactionRecord["status"] = "Pago"
): TransactionRecord {
  return {
    id,
    userId: 1,
    type: Number(amount) >= 0 ? "entrada" : "saida",
    transactionDate: "2026-09-07",
    description: "Teste patrimonial",
    contact: "",
    category: "Teste",
    amount,
    account: `Conta ${accountId}`,
    accountId,
    categoryId: null,
    status,
    recurring: false,
    importBatchId: null,
    externalId: null,
    fingerprint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
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
