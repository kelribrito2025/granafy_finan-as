import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "../drizzle/schema";
import { periodBounds, signedAmount, summarize } from "./routers/transactions";

function record(amount: string): TransactionRecord {
  return {
    id: 1,
    userId: 1,
    type: Number(amount) >= 0 ? "entrada" : "saida",
    transactionDate: "2026-09-07",
    description: "Teste",
    contact: "",
    category: "Validação",
    amount,
    account: "Teste",
    status: "Pendente",
    recurring: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("transactions helpers", () => {
  it("calculates exact month boundaries across years", () => {
    expect(periodBounds(2026, 9)).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(periodBounds(2026, 12)).toEqual({ start: "2026-12-01", end: "2027-01-01" });
  });

  it("normalizes amounts according to transaction type", () => {
    const base = {
      transactionDate: "2026-09-07",
      description: "Teste",
      contact: "",
      category: "Validação",
      amount: 123.45,
      account: "Teste",
      status: "Pendente" as const,
      recurring: false,
    };
    expect(signedAmount({ ...base, type: "entrada" })).toBe(123.45);
    expect(signedAmount({ ...base, type: "saida" })).toBe(-123.45);
  });

  it("summarizes incoming, outgoing and balance without mocks", () => {
    expect(summarize([record("350.00"), record("-120.50"), record("-29.50")])).toEqual({
      incoming: 350,
      outgoing: 150,
      balance: 200,
    });
  });
});
