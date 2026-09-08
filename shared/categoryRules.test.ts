import { describe, expect, it } from "vitest";
import { findMatchingRule, normalizeForMatch, ruleMatches, type CategoryRule } from "./categoryRules";

const regra = (over: Partial<CategoryRule> = {}): CategoryRule => ({
  id: 1,
  matchType: "descricao",
  matchValue: "twilio",
  categoryId: 10,
  category: "Custos de plataforma",
  costCenterId: null,
  costCenter: "",
  priority: 0,
  isActive: true,
  ...over,
});

const alvo = (over: Partial<{ description: string; contact: string; account: string }> = {}) => ({
  description: "Twilio · fatura agosto",
  contact: "Twilio Inc",
  account: "Inter PJ",
  ...over,
});

describe("normalizeForMatch", () => {
  it("tira acento e caixa", () => {
    expect(normalizeForMatch("Serviços")).toBe("servicos");
    expect(normalizeForMatch("  ÁGUA  ")).toBe("agua");
  });
});

describe("ruleMatches", () => {
  it("casa trecho da descrição, ignorando caixa e acento", () => {
    expect(ruleMatches(regra(), alvo())).toBe(true);
    expect(ruleMatches(regra({ matchValue: "TWILIO" }), alvo())).toBe(true);
    expect(ruleMatches(regra({ matchValue: "fatura" }), alvo())).toBe(true);
    expect(ruleMatches(regra({ matchValue: "servicos" }), alvo({ description: "Prestação de Serviços" }))).toBe(true);
  });

  it("não casa o que não está lá", () => {
    expect(ruleMatches(regra({ matchValue: "google" }), alvo())).toBe(false);
  });

  it("exige nome inteiro quando o critério é a conta", () => {
    expect(ruleMatches(regra({ matchType: "conta", matchValue: "Inter PJ" }), alvo())).toBe(true);
    // Trecho não basta: "Inter" não é a conta "Inter PJ".
    expect(ruleMatches(regra({ matchType: "conta", matchValue: "Inter" }), alvo())).toBe(false);
  });

  it("casa pelo contato", () => {
    expect(ruleMatches(regra({ matchType: "contato", matchValue: "twilio inc" }), alvo())).toBe(true);
    expect(ruleMatches(regra({ matchType: "contato", matchValue: "twilio" }), alvo({ contact: "" }))).toBe(false);
  });

  it("nunca casa com valor vazio", () => {
    // Valor vazio recategorizaria a base inteira de uma vez.
    expect(ruleMatches(regra({ matchValue: "" }), alvo())).toBe(false);
    expect(ruleMatches(regra({ matchValue: "   " }), alvo())).toBe(false);
  });

  it("ignora regra desativada", () => {
    expect(ruleMatches(regra({ isActive: false }), alvo())).toBe(false);
  });
});

describe("findMatchingRule", () => {
  it("devolve null quando nenhuma casa", () => {
    expect(findMatchingRule([regra({ matchValue: "google" })], alvo())).toBeNull();
  });

  it("respeita a prioridade", () => {
    const baixa = regra({ id: 1, priority: 10, category: "Baixa" });
    const alta = regra({ id: 2, priority: 1, category: "Alta" });
    expect(findMatchingRule([baixa, alta], alvo())?.category).toBe("Alta");
  });

  it("desempata pelo id, para a classificação ser sempre a mesma", () => {
    const a = regra({ id: 7, priority: 0, category: "Sete" });
    const b = regra({ id: 3, priority: 0, category: "Tres" });
    expect(findMatchingRule([a, b], alvo())?.category).toBe("Tres");
    // A ordem de entrada não pode mudar o resultado.
    expect(findMatchingRule([b, a], alvo())?.category).toBe("Tres");
  });

  it("não altera a lista recebida", () => {
    const lista = [regra({ id: 9, priority: 5 }), regra({ id: 2, priority: 1 })];
    const copia = lista.map(r => r.id);
    findMatchingRule(lista, alvo());
    expect(lista.map(r => r.id)).toEqual(copia);
  });

  it("pula as desativadas e pega a próxima que casa", () => {
    const desativada = regra({ id: 1, priority: 0, isActive: false, category: "Fora" });
    const ativa = regra({ id: 2, priority: 1, category: "Vale" });
    expect(findMatchingRule([desativada, ativa], alvo())?.category).toBe("Vale");
  });
});
