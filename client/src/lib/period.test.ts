import { describe, expect, it } from "vitest";
import { lastDayOfMonth, periodBaseline } from "./period";

describe("lastDayOfMonth", () => {
  it("resolve meses de 31, 30 e 28 dias", () => {
    expect(lastDayOfMonth(2026, 1)).toBe("2026-01-31");
    expect(lastDayOfMonth(2026, 4)).toBe("2026-04-30");
    expect(lastDayOfMonth(2026, 2)).toBe("2026-02-28");
  });

  it("reconhece fevereiro em ano bissexto", () => {
    expect(lastDayOfMonth(2028, 2)).toBe("2028-02-29");
  });

  it("trata mês 0 como 31/12 do ano anterior", () => {
    expect(lastDayOfMonth(2026, 0)).toBe("2025-12-31");
  });
});

describe("periodBaseline", () => {
  it("compara o mês com o fechamento do mês anterior", () => {
    expect(periodBaseline("mensal", "2026-09-07")).toBe("2026-08-31");
    expect(periodBaseline("mensal", "2026-03-01")).toBe("2026-02-28");
  });

  it("compara o trimestre com o fechamento do trimestre anterior", () => {
    expect(periodBaseline("trimestral", "2026-09-07")).toBe("2026-06-30");
    expect(periodBaseline("trimestral", "2026-07-01")).toBe("2026-06-30");
    expect(periodBaseline("trimestral", "2026-05-20")).toBe("2026-03-31");
    expect(periodBaseline("trimestral", "2026-12-31")).toBe("2026-09-30");
  });

  it("compara o ano com 31/12 do ano anterior", () => {
    expect(periodBaseline("anual", "2026-09-07")).toBe("2025-12-31");
    expect(periodBaseline("anual", "2026-01-01")).toBe("2025-12-31");
  });

  it("atravessa a virada do ano sem quebrar", () => {
    expect(periodBaseline("mensal", "2026-01-10")).toBe("2025-12-31");
    expect(periodBaseline("trimestral", "2026-01-10")).toBe("2025-12-31");
    expect(periodBaseline("anual", "2026-01-10")).toBe("2025-12-31");
  });

  it("nunca devolve uma base igual ou posterior à referência", () => {
    for (let month = 1; month <= 12; month += 1) {
      const reference = `2026-${String(month).padStart(2, "0")}-15`;
      for (const period of ["mensal", "trimestral", "anual"] as const) {
        expect(periodBaseline(period, reference) < reference).toBe(true);
      }
    }
  });
});
