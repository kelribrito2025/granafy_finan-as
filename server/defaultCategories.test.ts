import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_CATALOG_VERSION,
  DEFAULT_CAPITAL_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_TRANSACTION_CATEGORIES,
  defaultCategoryUpgradeValues,
  defaultCategoryValues,
} from "./defaultCategories";

describe("default transaction categories", () => {
  it("keeps a versioned, unique catalog compatible with the database", () => {
    const names = DEFAULT_TRANSACTION_CATEGORIES.map(category => category.name);
    expect(DEFAULT_CATEGORY_CATALOG_VERSION).toBe(3);
    expect(names).toHaveLength(56);
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

  it("traz as raízes de aporte e empréstimo, que a DRE precisa separar da receita", () => {
    const names = new Set(DEFAULT_TRANSACTION_CATEGORIES.map(category => category.name));
    expect(names).toContain("Aportes de Capital/Aporte de Sócio");
    expect(names).toContain("Empréstimos e Financiamentos/Empréstimo Recebido");
    expect(names).toContain("Empréstimos e Financiamentos/Amortização de Principal");

    const emprestimo = DEFAULT_TRANSACTION_CATEGORIES.find(
      category => category.name === "Empréstimos e Financiamentos/Amortização de Principal"
    );
    // Recebe e devolve pela mesma raiz: travar num sentido esconderia o outro.
    expect(emprestimo?.type).toBe("ambos");
  });

  it("entrega as novas raízes a quem já estava na versão 2", () => {
    const values = defaultCategoryUpgradeValues(42, 700, 2);
    const names = values.map(category => category.name);
    expect(names).toContain("Aportes de Capital");
    expect(names).toContain("Empréstimos e Financiamentos");
    expect(names.some(name => name.startsWith("Receitas Operacionais"))).toBe(false);
  });

  it("binds the catalog to a user without sharing mutable records", () => {
    const values = defaultCategoryValues(42, 700);
    /*
     * O carimbo da empresa é o que impede o cadastro de continuar criando 50
     * linhas órfãs por conta nova — foi o vazamento que a Fase 2 fecha na
     * fonte.
     */
    expect(values.every(category => category.companyId === 700)).toBe(true);
    expect(values).toHaveLength(DEFAULT_TRANSACTION_CATEGORIES.length);
    expect(values.every(category => category.userId === 42 && category.isActive)).toBe(true);
  });

  it("entrega a uma conta na versão 1 só o que faltou desde então", () => {
    const values = defaultCategoryUpgradeValues(42, 700, 1);
    // As receitas da v2 mais o capital da v3 — nunca o catálogo inteiro de novo.
    expect(values).toHaveLength(DEFAULT_INCOME_CATEGORIES.length + DEFAULT_CAPITAL_CATEGORIES.length);
    expect(values.every(category => category.userId === 42 && category.isActive)).toBe(true);
    expect(values.length).toBeLessThan(DEFAULT_TRANSACTION_CATEGORIES.length);
  });

  it("não repete nada para quem já está na versão corrente", () => {
    expect(defaultCategoryUpgradeValues(42, 700, DEFAULT_CATEGORY_CATALOG_VERSION)).toEqual([]);
  });
});
