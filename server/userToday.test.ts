import { DEFAULT_PREFERENCES, todayIn } from "@shared/preferences";
import { describe, expect, it } from "vitest";
import { resolveTimeZone } from "./userToday";

describe("resolveTimeZone", () => {
  it("mantém o fuso salvo quando ele existe de verdade", () => {
    expect(resolveTimeZone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(resolveTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
    expect(resolveTimeZone("UTC")).toBe("UTC");
  });

  it("cai no padrão quando não há nada salvo", () => {
    expect(resolveTimeZone(null)).toBe(DEFAULT_PREFERENCES.timeZone);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_PREFERENCES.timeZone);
    expect(resolveTimeZone("")).toBe(DEFAULT_PREFERENCES.timeZone);
  });

  it("cai no padrão em vez de deixar o fuso inválido derrubar a tela", () => {
    // O schema de preferências aceita qualquer texto aqui, então isto chega.
    expect(resolveTimeZone("banana")).toBe(DEFAULT_PREFERENCES.timeZone);
    expect(resolveTimeZone("America/Nao_Existe")).toBe(DEFAULT_PREFERENCES.timeZone);
    expect(() =>
      todayIn({ ...DEFAULT_PREFERENCES, timeZone: resolveTimeZone("banana") })
    ).not.toThrow();
  });
});

describe("o dia que o servidor via antes", () => {
  /*
   * Às 21h de Brasília o UTC já virou. Estes casos são o motivo do 2.4: é a
   * diferença entre o que o servidor respondia e o que a pessoa via no relógio.
   */
  const vinteEUmaEmBrasilia = new Date("2026-09-09T00:30:00.000Z");

  it("no fuso do usuário ainda é o dia anterior", () => {
    expect(vinteEUmaEmBrasilia.toISOString().slice(0, 10)).toBe("2026-09-09");
    expect(
      todayIn({ ...DEFAULT_PREFERENCES, timeZone: resolveTimeZone("America/Sao_Paulo") }, vinteEUmaEmBrasilia)
    ).toBe("2026-09-08");
  });

  it("quem escolheu outro fuso vê o dia daquele fuso, não o de Brasília", () => {
    expect(
      todayIn({ ...DEFAULT_PREFERENCES, timeZone: resolveTimeZone("Asia/Tokyo") }, vinteEUmaEmBrasilia)
    ).toBe("2026-09-09");
  });
});
