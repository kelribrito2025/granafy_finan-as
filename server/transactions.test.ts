import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "../drizzle/schema";
import { chunkTransactionIds, TRANSACTION_DELETE_CHUNK_SIZE } from "./db";
import { umLancamento } from "./fixtures";
import { bulkUpdateChangesSchema, isOpenInWindow, MAX_BULK_DELETE_IDS, MAX_BULK_UPDATE_IDS, periodBounds, rebaseSeriesDate, selectSeriesTargets, seriesDateForUpdate, seriesTargetsNeedNormalization, shouldMaterializeRecurrence, signedAmount, summarize } from "./routers/transactions";

function record(amount: string): TransactionRecord {
  return umLancamento({ amount, type: Number(amount) >= 0 ? "entrada" : "saida" });
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
      costCenter: "",
      status: "Pendente" as const,
      recurring: false,
      recurrenceStart: "este_mes" as const,
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

  it("splits 668 selected ids into safe database chunks", () => {
    const chunks = chunkTransactionIds(Array.from({ length: 668 }, (_, index) => index + 1));
    expect(TRANSACTION_DELETE_CHUNK_SIZE).toBe(500);
    expect(chunks).toHaveLength(2);
    expect(chunks.map(chunk => chunk.length)).toEqual([500, 168]);
    expect(MAX_BULK_DELETE_IDS).toBeGreaterThanOrEqual(668);
  });

  it("deduplicates selected ids before chunking", () => {
    expect(chunkTransactionIds([1, 2, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });

  it("accepts only meaningful bulk changes", () => {
    expect(bulkUpdateChangesSchema.safeParse({}).success).toBe(false);
    expect(bulkUpdateChangesSchema.parse({ status: "Pago" })).toEqual({ status: "Pago" });
    expect(bulkUpdateChangesSchema.parse({ transactionDate: "2026-09-07", recurring: true })).toEqual({ transactionDate: "2026-09-07", recurring: true });
    expect(bulkUpdateChangesSchema.safeParse({ transactionDate: "07/09/2026" }).success).toBe(false);
    expect(MAX_BULK_UPDATE_IDS).toBeGreaterThanOrEqual(668);
  });

  it("materializes future installments when an individual transaction becomes recurring", () => {
    expect(shouldMaterializeRecurrence(
      { recurrenceGroupId: null, transferGroupId: null },
      { recurring: true, recurringMonths: 12 },
    )).toBe(true);
    expect(shouldMaterializeRecurrence(
      { recurrenceGroupId: "existing-series", transferGroupId: null },
      { recurring: true, recurringMonths: 12 },
    )).toBe(false);
    expect(shouldMaterializeRecurrence(
      { recurrenceGroupId: null, transferGroupId: null },
      { recurring: false, recurringMonths: null },
    )).toBe(false);
    expect(shouldMaterializeRecurrence(
      { recurrenceGroupId: null, transferGroupId: "transfer" },
      { recurring: true, recurringMonths: 12 },
    )).toBe(false);
  });

  it("reanchors every following installment when the first date is corrected", () => {
    const clicked = umLancamento({ id: 10, transactionDate: "2026-11-05", recurrenceIndex: 1 });
    const second = umLancamento({ id: 11, transactionDate: "2026-12-05", recurrenceIndex: 2 });
    const third = umLancamento({ id: 12, transactionDate: "2027-01-05", recurrenceIndex: 3 });

    expect(rebaseSeriesDate(clicked, clicked, "2026-10-05")).toBe("2026-10-05");
    expect(rebaseSeriesDate(clicked, second, "2026-10-05")).toBe("2026-11-05");
    expect(rebaseSeriesDate(clicked, third, "2026-10-05")).toBe("2026-12-05");
  });

  it("preserves the anchor day while rebasing a series across shorter months", () => {
    const clicked = umLancamento({ id: 20, transactionDate: "2026-03-31", recurrenceIndex: 1 });
    const second = umLancamento({ id: 21, transactionDate: "2026-04-30", recurrenceIndex: 2 });
    const third = umLancamento({ id: 22, transactionDate: "2026-05-31", recurrenceIndex: 3 });

    expect(rebaseSeriesDate(clicked, second, "2026-01-31")).toBe("2026-02-28");
    expect(rebaseSeriesDate(clicked, third, "2026-01-31")).toBe("2026-03-31");
  });

  it("moves both legs of the clicked recurring transfer to the same date", () => {
    const clicked = umLancamento({ id: 25, transactionDate: "2026-11-05", recurrenceIndex: 1, transferGroupId: "pair-1" });
    const counterpart = umLancamento({ id: 26, transactionDate: "2026-11-05", recurrenceIndex: 1, transferGroupId: "pair-1" });

    expect(rebaseSeriesDate(clicked, counterpart, "2026-10-05")).toBe("2026-10-05");
  });

  it("selects following installments by recurrence index even when dates already contain a gap", () => {
    const groupId = "broken-series";
    const clicked = umLancamento({ id: 30, transactionDate: "2026-10-05", recurrenceGroupId: groupId, recurrenceIndex: 1 });
    const following = umLancamento({ id: 31, transactionDate: "2026-12-05", recurrenceGroupId: groupId, recurrenceIndex: 2 });
    const paid = umLancamento({ id: 32, transactionDate: "2027-01-05", recurrenceGroupId: groupId, recurrenceIndex: 3, status: "Pago" });

    expect(selectSeriesTargets([clicked, following, paid], clicked).map(item => item.id)).toEqual([30, 31]);
  });

  it("does not include a paid clicked installment in a following-series update", () => {
    const groupId = "paid-anchor";
    const clicked = umLancamento({ id: 40, transactionDate: "2026-10-05", recurrenceGroupId: groupId, recurrenceIndex: 1, status: "Pago" });
    const following = umLancamento({ id: 41, transactionDate: "2026-11-05", recurrenceGroupId: groupId, recurrenceIndex: 2 });

    expect(selectSeriesTargets([clicked, following], clicked).map(item => item.id)).toEqual([41]);
  });

  it("keeps installments after a paid barrier on their original dates", () => {
    const clicked = umLancamento({ id: 50, transactionDate: "2026-10-05", recurrenceIndex: 1 });
    const paid = umLancamento({ id: 51, transactionDate: "2026-11-05", recurrenceIndex: 2, status: "Pago" });
    const following = umLancamento({ id: 52, transactionDate: "2026-12-05", recurrenceIndex: 3 });

    expect(seriesDateForUpdate([clicked, paid, following], clicked, following, "2026-09-05"))
      .toBe("2026-12-05");
  });

  it("detects a missing month but accepts the normal shortening at the end of February", () => {
    const broken = [
      umLancamento({ transactionDate: "2026-10-05", recurrenceIndex: 1 }),
      umLancamento({ transactionDate: "2026-12-05", recurrenceIndex: 2 }),
    ];
    const monthEnd = [
      umLancamento({ transactionDate: "2026-01-31", recurrenceIndex: 1 }),
      umLancamento({ transactionDate: "2026-02-28", recurrenceIndex: 2 }),
      umLancamento({ transactionDate: "2026-03-31", recurrenceIndex: 3 }),
    ];

    expect(seriesTargetsNeedNormalization(broken, broken)).toBe(true);
    expect(seriesTargetsNeedNormalization(monthEnd, monthEnd)).toBe(false);
  });
});

describe("isOpenInWindow", () => {
  const janela = { start: "2026-09-01", end: "2026-10-01", todayIso: "2026-09-08" };
  const titulo = (values: Partial<TransactionRecord>) => ({ ...record("-100.00"), ...values });

  it("conta o que vence dentro do período", () => {
    expect(isOpenInWindow(titulo({ transactionDate: "2026-09-20" }), janela)).toBe(true);
  });

  it("conta o vencido de qualquer data, porque atraso continua sendo dívida", () => {
    expect(isOpenInWindow(titulo({ transactionDate: "2026-07-15" }), janela)).toBe(true);
  });

  it("deixa de fora a parcela futura fora do período", () => {
    expect(isOpenInWindow(titulo({ transactionDate: "2026-10-05" }), janela)).toBe(false);
    expect(isOpenInWindow(titulo({ transactionDate: "2027-08-05" }), janela)).toBe(false);
  });

  it("deixa de fora o que já foi pago", () => {
    expect(isOpenInWindow(titulo({ transactionDate: "2026-09-20", status: "Pago" }), janela)).toBe(false);
  });

  it("deixa de fora transferência", () => {
    expect(isOpenInWindow(titulo({ transactionDate: "2026-09-20", type: "transferencia" }), janela)).toBe(false);
  });
});
