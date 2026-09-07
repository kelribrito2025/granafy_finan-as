import { describe, expect, it } from "vitest";
import {
  buildMovementRow,
  contributionsOf,
  monthLabel,
  monthlyDepreciationOf,
  movementLabelOf,
  type MovementItem,
} from "./patrimonyMovement";

const servidor: MovementItem = {
  name: "Servidor Dell",
  isActive: true,
  acquisitionDate: "2026-03-07",
  acquisitionValueNumber: 94800,
  residualValueNumber: 9480,
  usefulLifeMonths: 60,
  valuationMethod: "depreciacao_linear",
};

describe("monthLabel", () => {
  it("abrevia mês e ano", () => {
    expect(monthLabel("2026-09")).toBe("set/26");
    expect(monthLabel("2025-01")).toBe("jan/25");
    expect(monthLabel("2026-12")).toBe("dez/26");
  });
});

describe("monthlyDepreciationOf", () => {
  it("não cobra no mês da aquisição", () => {
    expect(monthlyDepreciationOf(servidor, "2026-03")).toBe(0);
  });

  it("cobra a partir do mês seguinte", () => {
    expect(monthlyDepreciationOf(servidor, "2026-04")).toBeCloseTo(1422);
    expect(monthlyDepreciationOf(servidor, "2026-09")).toBeCloseTo(1422);
  });

  it("cobra a última parcela e para", () => {
    // 60 meses a partir de 03/2026 termina em 03/2031.
    expect(monthlyDepreciationOf(servidor, "2031-03")).toBeCloseTo(1422);
    expect(monthlyDepreciationOf(servidor, "2031-04")).toBe(0);
    expect(monthlyDepreciationOf(servidor, "2040-01")).toBe(0);
  });

  it("não cobra antes da aquisição", () => {
    expect(monthlyDepreciationOf(servidor, "2026-02")).toBe(0);
    expect(monthlyDepreciationOf(servidor, "2020-01")).toBe(0);
  });

  it("ignora item inativo, sem depreciação ou sem vida útil", () => {
    expect(monthlyDepreciationOf({ ...servidor, isActive: false }, "2026-09")).toBe(0);
    expect(monthlyDepreciationOf({ ...servidor, valuationMethod: "manual" }, "2026-09")).toBe(0);
    expect(monthlyDepreciationOf({ ...servidor, usefulLifeMonths: null }, "2026-09")).toBe(0);
    expect(monthlyDepreciationOf({ ...servidor, acquisitionDate: null }, "2026-09")).toBe(0);
  });

  it("corta o residual maior que o valor de aquisição", () => {
    expect(monthlyDepreciationOf({ ...servidor, residualValueNumber: 999999 }, "2026-09")).toBe(0);
  });

  it("a soma das parcelas devolve exatamente o valor depreciável", () => {
    let total = 0;
    for (let index = 1; index <= 60; index += 1) {
      const year = 2026 + Math.floor((2 + index) / 12);
      const month = ((2 + index) % 12) + 1;
      total += monthlyDepreciationOf(servidor, `${year}-${String(month).padStart(2, "0")}`);
    }
    expect(total).toBeCloseTo(94800 - 9480, 6);
  });
});

describe("contributionsOf e movementLabelOf", () => {
  const outro: MovementItem = { ...servidor, name: "Notebook", acquisitionValueNumber: 8000, acquisitionDate: "2026-03-20" };
  const terceiro: MovementItem = { ...servidor, name: "Impressora", acquisitionValueNumber: 1200, acquisitionDate: "2026-03-25" };

  it("soma só o que foi adquirido no mês", () => {
    expect(contributionsOf([servidor, outro], "2026-03")).toBe(102800);
    expect(contributionsOf([servidor, outro], "2026-04")).toBe(0);
  });

  it("ignora item inativo", () => {
    expect(contributionsOf([{ ...servidor, isActive: false }], "2026-03")).toBe(0);
  });

  it("descreve o mês sem inventar movimento", () => {
    expect(movementLabelOf([servidor], "2026-04")).toBe("Sem movimentação de bens");
    expect(movementLabelOf([servidor], "2026-03")).toBe("Aquisição de Servidor Dell");
    expect(movementLabelOf([servidor, outro], "2026-03")).toBe("Aquisição de Servidor Dell e mais 1 bem");
    expect(movementLabelOf([servidor, outro, terceiro], "2026-03")).toBe("Aquisição de Servidor Dell e mais 2 bens");
  });
});

describe("buildMovementRow", () => {
  it("junta rótulo, movimento, aportes e depreciação", () => {
    expect(buildMovementRow([servidor], "2026-03")).toEqual({
      monthKey: "2026-03",
      label: "mar/26",
      movement: "Aquisição de Servidor Dell",
      contributions: 94800,
      depreciation: 0,
    });
  });

  it("mês sem aquisição só tem depreciação", () => {
    const row = buildMovementRow([servidor], "2026-09");
    expect(row.contributions).toBe(0);
    expect(row.depreciation).toBeCloseTo(1422);
    expect(row.movement).toBe("Sem movimentação de bens");
  });
});
