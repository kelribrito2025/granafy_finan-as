import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "../drizzle/schema";
import { isCashFlow, summarize, transactionValuesSchema } from "./routers/transactions";

function record(amount: string, type: TransactionRecord["type"]): TransactionRecord {
  return {
    id: 1,
    userId: 1,
    type,
    transactionDate: "2026-09-07",
    description: "Teste",
    contact: "",
    category: type === "transferencia" ? "Transferência" : "Validação",
    amount,
    account: "Teste",
    accountId: 1,
    categoryId: null,
    costCenter: "",
    costCenterId: null,
    status: "Pago",
    recurring: false,
    recurringMonths: null,
    attachmentKey: null,
    attachmentName: null,
    transferGroupId: type === "transferencia" ? "grupo-1" : null,
    importBatchId: null,
    externalId: null,
    fingerprint: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

const base = {
  transactionDate: "2026-09-07",
  description: "Plano API",
  contact: "",
  amount: 2400,
  account: "Inter PJ",
  status: "Pendente" as const,
  recurring: false,
};

describe("isCashFlow", () => {
  it("trata entrada e saída como caixa e transferência como movimento interno", () => {
    expect(isCashFlow(record("100.00", "entrada"))).toBe(true);
    expect(isCashFlow(record("-100.00", "saida"))).toBe(true);
    expect(isCashFlow(record("-100.00", "transferencia"))).toBe(false);
  });
});

describe("summarize", () => {
  it("soma entradas e saídas normalmente", () => {
    const result = summarize([record("1000.00", "entrada"), record("-400.00", "saida")]);
    expect(result).toEqual({ incoming: 1000, outgoing: 400, balance: 600 });
  });

  it("não conta transferência como receita nem como despesa", () => {
    // As duas pernas de uma transferência de 500 entre contas próprias.
    const result = summarize([
      record("1000.00", "entrada"),
      record("-400.00", "saida"),
      record("-500.00", "transferencia"),
      record("500.00", "transferencia"),
    ]);
    expect(result).toEqual({ incoming: 1000, outgoing: 400, balance: 600 });
  });

  it("zera quando só há transferência", () => {
    expect(summarize([record("-500.00", "transferencia"), record("500.00", "transferencia")]))
      .toEqual({ incoming: 0, outgoing: 0, balance: 0 });
  });
});

describe("validação do lançamento", () => {
  it("exige categoria em entrada e saída", () => {
    expect(transactionValuesSchema.safeParse({ ...base, type: "entrada", category: "" }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...base, type: "entrada", category: "Receita" }).success).toBe(true);
  });

  it("dispensa categoria na transferência, mas exige as duas contas", () => {
    const transfer = { ...base, type: "transferencia" as const, category: "" };
    expect(transactionValuesSchema.safeParse(transfer).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...transfer, accountId: 1 }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...transfer, accountId: 1, destinationAccountId: 2 }).success).toBe(true);
  });

  it("recusa transferência para a mesma conta", () => {
    const result = transactionValuesSchema.safeParse({
      ...base, type: "transferencia", category: "", accountId: 7, destinationAccountId: 7,
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("diferente da origem");
  });

  it("exige prazo quando o lançamento é recorrente", () => {
    const recurring = { ...base, type: "entrada" as const, category: "Receita", recurring: true };
    expect(transactionValuesSchema.safeParse(recurring).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...recurring, recurringMonths: 12 }).success).toBe(true);
  });

  it("recusa prazo em lançamento que não é recorrente", () => {
    const result = transactionValuesSchema.safeParse({
      ...base, type: "entrada", category: "Receita", recurring: false, recurringMonths: 12,
    });
    expect(result.success).toBe(false);
  });

  it("limita o prazo a 120 meses", () => {
    const recurring = { ...base, type: "entrada" as const, category: "Receita", recurring: true };
    expect(transactionValuesSchema.safeParse({ ...recurring, recurringMonths: 120 }).success).toBe(true);
    expect(transactionValuesSchema.safeParse({ ...recurring, recurringMonths: 121 }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...recurring, recurringMonths: 0 }).success).toBe(false);
  });

  it("recusa anexo pela metade", () => {
    const entry = { ...base, type: "entrada" as const, category: "Receita" };
    expect(transactionValuesSchema.safeParse({ ...entry, attachmentKey: "a/b.pdf" }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...entry, attachmentName: "nota.pdf" }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...entry, attachmentKey: "a/b.pdf", attachmentName: "nota.pdf" }).success).toBe(true);
  });

  it("continua recusando valor zero ou negativo", () => {
    const entry = { ...base, type: "entrada" as const, category: "Receita" };
    expect(transactionValuesSchema.safeParse({ ...entry, amount: 0 }).success).toBe(false);
    expect(transactionValuesSchema.safeParse({ ...entry, amount: -10 }).success).toBe(false);
  });
});
