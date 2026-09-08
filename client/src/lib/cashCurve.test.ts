import { describe, expect, it } from "vitest";
import { buildCashCurve } from "./cashCurve";

describe("buildCashCurve", () => {
  it("mantém o estado vazio quando não há movimentação", () => {
    expect(buildCashCurve([])).toBeNull();
    expect(buildCashCurve([0, 0, 0])).toBeNull();
  });

  it("desenha a evolução do saldo acumulado dentro da área disponível", () => {
    const curve = buildCashCurve([100, -25, 75], 380, 80, 8, 8);

    expect(curve).not.toBeNull();
    expect(curve?.linePoints).toBe("0,50.67 190,72 380,8");
    expect(curve?.areaPoints).toBe("0,50.67 190,72 380,8 380,80 0,80");
    expect(curve?.lastPoint).toEqual({ x: 380, y: 8 });
  });

  it("cria uma linha horizontal visível quando existe apenas um ponto", () => {
    const curve = buildCashCurve([250], 380, 80, 8, 8);

    expect(curve?.linePoints).toBe("0,40 380,40");
    expect(curve?.lastPoint).toEqual({ x: 380, y: 40 });
  });

  it("ignora valores não finitos em vez de gerar coordenadas inválidas", () => {
    const curve = buildCashCurve([100, Number.NaN, 50], 380, 80, 8, 8);

    expect(curve?.linePoints).not.toContain("NaN");
    expect(curve?.linePoints).not.toContain("Infinity");
  });
});
