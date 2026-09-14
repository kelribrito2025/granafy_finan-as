import { describe, expect, it } from "vitest";
import {
  hasMeaningfulTransactionDraft,
  parseTransactionDraft,
  TRANSACTION_DRAFT_MAX_AGE_MS,
  transactionDraftDefaults,
  transactionDraftKey,
} from "./transactionDraft";

describe("rascunho de novo lançamento", () => {
  it("separa o rascunho por usuário e empresa", () => {
    const base = transactionDraftKey(10, 20);
    expect(base).toBeTruthy();
    expect(transactionDraftKey(10, 21)).not.toBe(base);
    expect(transactionDraftKey(11, 20)).not.toBe(base);
    expect(transactionDraftKey(null, 20)).toBeNull();
    expect(transactionDraftKey(10, null)).toBeNull();
  });

  it("não considera os valores padrão um rascunho preenchido", () => {
    const values = transactionDraftDefaults("saida", "2026-09-14");
    expect(hasMeaningfulTransactionDraft(values, { type: "saida", transactionDate: "2026-09-14" })).toBe(false);
    expect(hasMeaningfulTransactionDraft({ ...values, amount: "" }, { type: "saida", transactionDate: "2026-09-14" })).toBe(false);
    expect(hasMeaningfulTransactionDraft({ ...values, amount: "-" }, { type: "saida", transactionDate: "2026-09-14" })).toBe(false);
    expect(hasMeaningfulTransactionDraft({ ...values, recurringMonths: 24, recurrenceStart: "proximo_mes" }, { type: "saida", transactionDate: "2026-09-14" })).toBe(false);
    expect(hasMeaningfulTransactionDraft({ ...values, description: "Fornecedor" }, { type: "saida", transactionDate: "2026-09-14" })).toBe(true);
    expect(hasMeaningfulTransactionDraft({ ...values, amount: "125,00" }, { type: "saida", transactionDate: "2026-09-14" })).toBe(true);
  });

  it("restaura somente o formato válido dentro do prazo", () => {
    const now = Date.UTC(2026, 8, 14, 18);
    const values = transactionDraftDefaults("entrada", "2026-09-14");
    const valid = JSON.stringify({ ...values, version: 1, updatedAt: now - 1_000, description: "Venda" });
    expect(parseTransactionDraft(valid, now)?.description).toBe("Venda");

    const expired = JSON.stringify({ ...values, version: 1, updatedAt: now - TRANSACTION_DRAFT_MAX_AGE_MS - 1 });
    expect(parseTransactionDraft(expired, now)).toBeNull();
    expect(parseTransactionDraft("{inválido", now)).toBeNull();
    expect(parseTransactionDraft(JSON.stringify({ ...values, version: 2, updatedAt: now }), now)).toBeNull();
  });
});
