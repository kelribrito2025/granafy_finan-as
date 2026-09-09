import { describe, expect, it } from "vitest";
import { shouldShowOnboarding } from "./onboarding";

const ONTEM = new Date("2026-09-07T12:00:00Z");

describe("shouldShowOnboarding", () => {
  it("mostra para conta nova e vazia", () => {
    expect(shouldShowOnboarding({ completedAt: null, accountCount: 0, transactionCount: 0 })).toBe(true);
  });

  it("não mostra depois de concluído ou pulado", () => {
    // "Configurar depois" grava a data: pular é uma decisão, e vale para sempre.
    expect(shouldShowOnboarding({ completedAt: ONTEM, accountCount: 0, transactionCount: 0 })).toBe(false);
  });

  it("não mostra para quem já tem dados, mesmo com a coluna nula", () => {
    /*
     * O caso que a migration 0020 criou: a coluna nasceu nula para todos os
     * usuários que já existiam. Sem esta regra, quem tem 6.725 lançamentos
     * levaria um assistente de boas-vindas no login seguinte.
     */
    expect(shouldShowOnboarding({ completedAt: null, accountCount: 3, transactionCount: 6725 })).toBe(false);
  });

  it("uma conta cadastrada já basta para ficar de fora", () => {
    expect(shouldShowOnboarding({ completedAt: null, accountCount: 1, transactionCount: 0 })).toBe(false);
  });

  it("um lançamento cadastrado já basta para ficar de fora", () => {
    // Importar sem cadastrar conta não acontece hoje, mas a regra não depende disso.
    expect(shouldShowOnboarding({ completedAt: null, accountCount: 0, transactionCount: 1 })).toBe(false);
  });
});
