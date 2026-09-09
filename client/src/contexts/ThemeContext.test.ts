import { describe, expect, it } from "vitest";
import { resolveTheme } from "./ThemeContext";

describe("resolveTheme", () => {
  it("escolha explícita ignora o sistema", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("no automático, quem manda é o sistema", () => {
    expect(resolveTheme("auto", true)).toBe("dark");
    expect(resolveTheme("auto", false)).toBe("light");
  });

  it("o automático muda de resultado quando o sistema muda", () => {
    // É o caso que dá sentido ao modo: a janela aberta ao anoitecer acompanha.
    const antes = resolveTheme("auto", false);
    const depois = resolveTheme("auto", true);
    expect(antes).toBe("light");
    expect(depois).toBe("dark");
    expect(antes).not.toBe(depois);
  });
});
