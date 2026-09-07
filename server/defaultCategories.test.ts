import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_CATALOG_VERSION,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSACTION_CATEGORIES,
  defaultCategoryUpgradeValues,
  defaultCategoryValues,
} from "./defaultCategories";

describe("default transaction categories", () => {
  it("keeps a versioned, unique catalog compatible with the database", () => {
    const names = DEFAULT_TRANSACTION_CATEGORIES.map(category => category.name);
    expect(DEFAULT_CATEGORY_CATALOG_VERSION).toBe(2);
    expect(names).toHaveLength(50);
    expect(new Set(names).size).toBe(names.length);
    expect(Math.max(...names.map(name => name.length))).toBeLessThanOrEqual(120);
  });

  it("registers compatible categories for both revenues and expenses", () => {
    expect(DEFAULT_TRANSACTION_CATEGORIES.some(category => category.type === "entrada")).toBe(true);
    expect(DEFAULT_TRANSACTION_CATEGORIES.some(category => category.type === "saida")).toBe(true);
  });

  it("includes the supplied operational, fixed, financial and tax hierarchy", () => {
    const names = new Set(DEFAULT_TRANSACTION_CATEGORIES.map(category => category.name));
    expect(names).toContain("Custos Operacionais/Custo do Serviço Prestado (CSP)");
    expect(names).toContain("Receitas Operacionais/Prestação de Serviços");
    expect(names).toContain("Despesas Fixas/Salários e Pró-labore");
    expect(names).toContain("Despesas Financeiras/Tarifas Bancárias e de Cartão");
    expect(names).toContain("Impostos sobre Vendas/Simples Nacional (DAS)");
  });

  it("binds the catalog to a user without sharing mutable records", () => {
    const values = defaultCategoryValues(42);
    expect(values).toHaveLength(DEFAULT_TRANSACTION_CATEGORIES.length);
    expect(values.every(category => category.userId === 42 && category.isActive)).toBe(true);
  });

  it("adds only the new revenue categories when upgrading a version 1 account", () => {
    const values = defaultCategoryUpgradeValues(42, 1);
    expect(values).toHaveLength(DEFAULT_INCOME_CATEGORIES.length);
    expect(values.every(category => category.userId === 42 && category.type === "entrada")).toBe(true);
    expect(defaultCategoryUpgradeValues(42, 2)).toEqual([]);
  });
});
