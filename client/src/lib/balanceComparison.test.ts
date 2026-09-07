import { describe, expect, it } from "vitest";
import { assetsChangePercent, findBaseline, netWorthChange } from "./balanceComparison";

const snapshot = (referenceDate: string, totalAssets: number, netWorth: number) => ({
  referenceDate,
  totalAssets,
  netWorth,
});

const history = [
  snapshot("2026-06-30", 800, 500),
  snapshot("2026-07-31", 900, 560),
  snapshot("2026-08-31", 1000, 600),
  snapshot("2026-09-07", 1200, 700),
];

describe("findBaseline", () => {
  it("pega o fechamento mais recente até a data-base", () => {
    expect(findBaseline(history, "2026-08-31")?.referenceDate).toBe("2026-08-31");
    expect(findBaseline(history, "2026-08-15")?.referenceDate).toBe("2026-07-31");
    expect(findBaseline(history, "2026-06-30")?.referenceDate).toBe("2026-06-30");
  });

  it("devolve null quando não há fechamento até a data-base", () => {
    expect(findBaseline(history, "2026-01-31")).toBeNull();
    expect(findBaseline([], "2026-08-31")).toBeNull();
  });

  it("nunca escolhe um fechamento posterior à data-base", () => {
    expect(findBaseline(history, "2026-09-06")?.referenceDate).toBe("2026-08-31");
  });
});

describe("assetsChangePercent", () => {
  it("calcula a variação sobre a base", () => {
    expect(assetsChangePercent(1200, snapshot("2026-08-31", 1000, 600))).toBeCloseTo(20);
    expect(assetsChangePercent(800, snapshot("2026-08-31", 1000, 600))).toBeCloseTo(-20);
  });

  it("não compara sem base", () => {
    expect(assetsChangePercent(1200, null)).toBeNull();
  });

  it("não divide por base zerada", () => {
    expect(assetsChangePercent(1200, snapshot("2026-08-31", 0, 0))).toBeNull();
  });
});

describe("netWorthChange", () => {
  it("devolve a diferença em reais, com sinal", () => {
    expect(netWorthChange(700, snapshot("2026-08-31", 1000, 600))).toBe(100);
    expect(netWorthChange(500, snapshot("2026-08-31", 1000, 600))).toBe(-100);
  });

  it("não compara sem base", () => {
    expect(netWorthChange(700, null)).toBeNull();
  });
});
