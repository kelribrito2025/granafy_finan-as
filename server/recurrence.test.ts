import { describe, expect, it } from "vitest";
import { addMonthsAnchored, buildRecurrenceDates, MAX_RECURRENCE_MONTHS } from "./recurrence";

describe("addMonthsAnchored", () => {
  it("soma meses no caso simples", () => {
    expect(addMonthsAnchored("2026-09-05", 1)).toBe("2026-10-05");
    expect(addMonthsAnchored("2026-09-05", 3)).toBe("2026-12-05");
  });

  it("atravessa a virada do ano", () => {
    expect(addMonthsAnchored("2026-11-10", 2)).toBe("2027-01-10");
    expect(addMonthsAnchored("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("encurta o dia quando o mês de destino é mais curto", () => {
    expect(addMonthsAnchored("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsAnchored("2026-03-31", 1)).toBe("2026-04-30");
    expect(addMonthsAnchored("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("respeita fevereiro em ano bissexto", () => {
    expect(addMonthsAnchored("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("volta ao dia original depois de passar por um mês curto", () => {
    // O ponto do âncora: 31/01 + 2 meses é 31/03, não 28/03.
    expect(addMonthsAnchored("2026-01-31", 2)).toBe("2026-03-31");
    expect(addMonthsAnchored("2026-01-30", 13)).toBe("2027-02-28");
  });
});

describe("buildRecurrenceDates", () => {
  it("gera a quantidade pedida começando na data escolhida", () => {
    expect(buildRecurrenceDates("2026-09-05", 3)).toEqual(["2026-09-05", "2026-10-05", "2026-11-05"]);
  });

  it("começa no mês seguinte quando pedido, mantendo o total", () => {
    expect(buildRecurrenceDates("2026-09-05", 3, "proximo_mes"))
      .toEqual(["2026-10-05", "2026-11-05", "2026-12-05"]);
  });

  it("não deixa a série escorregar de dia ao passar por fevereiro", () => {
    const dates = buildRecurrenceDates("2026-01-31", 4);
    expect(dates).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("nunca repete data e sempre avança no tempo", () => {
    const dates = buildRecurrenceDates("2026-01-31", 24);
    expect(new Set(dates).size).toBe(24);
    for (let index = 1; index < dates.length; index += 1) {
      expect(dates[index] > dates[index - 1]).toBe(true);
    }
  });

  it("limita ao teto e nunca gera menos de uma parcela", () => {
    expect(buildRecurrenceDates("2026-09-05", 999)).toHaveLength(MAX_RECURRENCE_MONTHS);
    expect(buildRecurrenceDates("2026-09-05", 0)).toEqual(["2026-09-05"]);
    expect(buildRecurrenceDates("2026-09-05", -5)).toEqual(["2026-09-05"]);
  });
});
