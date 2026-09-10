import { describe, expect, it } from "vitest";
import { shouldShowOnboarding } from "./onboarding";

const ONTEM = new Date("2026-09-07T12:00:00Z");
const ANTES = new Date("2026-09-01T12:00:00Z");
const DEPOIS = new Date("2026-09-09T12:00:00Z");

/* A empresa antiga é o caso de quem já usava o sistema antes de haver empresa. */
const antiga = { companyCreatedAt: ANTES };

describe("shouldShowOnboarding", () => {
  it("mostra para conta nova e vazia", () => {
    expect(shouldShowOnboarding({ completedAt: null, ...antiga, accountCount: 0, transactionCount: 0 })).toBe(true);
  });

  it("não mostra depois de concluído ou pulado", () => {
    // "Configurar depois" grava a data: pular é uma decisão, e vale para sempre.
    expect(shouldShowOnboarding({ completedAt: ONTEM, ...antiga, accountCount: 0, transactionCount: 0 })).toBe(false);
  });

  it("não mostra para quem já tem dados, mesmo com a coluna nula", () => {
    /*
     * O caso que a migration 0020 criou: a coluna nasceu nula para todos os
     * usuários que já existiam. Sem esta regra, quem tem 6.725 lançamentos
     * levaria um assistente de boas-vindas no login seguinte.
     */
    expect(shouldShowOnboarding({ completedAt: null, ...antiga, accountCount: 3, transactionCount: 6725 })).toBe(false);
  });

  it("uma conta cadastrada já basta para ficar de fora", () => {
    expect(shouldShowOnboarding({ completedAt: null, ...antiga, accountCount: 1, transactionCount: 0 })).toBe(false);
  });

  it("um lançamento cadastrado já basta para ficar de fora", () => {
    // Importar sem cadastrar conta não acontece hoje, mas a regra não depende disso.
    expect(shouldShowOnboarding({ completedAt: null, ...antiga, accountCount: 0, transactionCount: 1 })).toBe(false);
  });

  // ── a empresa nova de um login veterano ───────────────────────────────────

  it("mostra na empresa criada DEPOIS de o login já ter concluído o fluxo", () => {
    /*
     * O caso que a Fase 6 criou e que antes não existia: a segunda empresa está
     * vazia, mas o `completedAt` do dono foi gravado na primeira. Sem esta
     * regra, criar uma empresa levaria direto ao painel vazio.
     */
    expect(shouldShowOnboarding({
      completedAt: ONTEM, companyCreatedAt: DEPOIS, accountCount: 0, transactionCount: 0,
    })).toBe(true);
  });

  it("não mostra na empresa anterior à conclusão — é a proteção de quem apagou tudo", () => {
    /*
     * A distinção que faz a regra valer: empresa velha e vazia é conta que
     * limpou os dados, não empresa nova. Se esta condição caísse, quem
     * esvaziasse a conta veria o assistente de volta.
     */
    expect(shouldShowOnboarding({
      completedAt: DEPOIS, companyCreatedAt: ANTES, accountCount: 0, transactionCount: 0,
    })).toBe(false);
  });

  it("empresa nova com dado dentro não mostra: quem já lançou não precisa", () => {
    expect(shouldShowOnboarding({
      completedAt: ONTEM, companyCreatedAt: DEPOIS, accountCount: 1, transactionCount: 0,
    })).toBe(false);
  });

  it("sem data de criação da empresa, não arrisca mostrar", () => {
    /* Contexto sem empresa ativa não deveria chegar aqui; se chegar, não invade a tela. */
    expect(shouldShowOnboarding({
      completedAt: ONTEM, companyCreatedAt: null, accountCount: 0, transactionCount: 0,
    })).toBe(false);
  });
});
