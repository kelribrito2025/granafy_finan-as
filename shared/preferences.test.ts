import { describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  fiscalYearRange,
  formatDateWith,
  formatMoneyWith,
  todayIn,
  type Preferences,
} from "./preferences";

const prefs = (over: Partial<Preferences> = {}): Preferences => ({ ...DEFAULT_PREFERENCES, ...over });

describe("formatMoneyWith", () => {
  it("usa símbolo e separadores de cada moeda", () => {
    expect(formatMoneyWith(prefs(), 1234.56)).toContain("1.234,56");
    expect(formatMoneyWith(prefs({ currency: "USD" }), 1234.56)).toContain("1,234.56");
    expect(formatMoneyWith(prefs({ currency: "EUR" }), 1234.56)).toContain("1.234,56");
  });

  it("não converte valor: o número é o mesmo em qualquer moeda", () => {
    const soNumeros = (texto: string) => texto.replace(/[^\d]/g, "");
    expect(soNumeros(formatMoneyWith(prefs({ currency: "USD" }), 100))).toBe("10000");
    expect(soNumeros(formatMoneyWith(prefs({ currency: "BRL" }), 100))).toBe("10000");
  });

  it("mantém o sinal negativo", () => {
    expect(formatMoneyWith(prefs(), -50)).toContain("-");
  });
});

describe("formatDateWith", () => {
  it("respeita cada formato", () => {
    expect(formatDateWith(prefs(), "2026-09-07")).toBe("07/09/2026");
    expect(formatDateWith(prefs({ dateFormat: "mdy" }), "2026-09-07")).toBe("09/07/2026");
    expect(formatDateWith(prefs({ dateFormat: "iso" }), "2026-09-07")).toBe("2026-09-07");
  });

  it("aceita data com hora e ignora a parte da hora", () => {
    expect(formatDateWith(prefs(), "2026-09-07T03:00:00.000Z")).toBe("07/09/2026");
  });

  it("não muda o dia por causa do fuso da máquina", () => {
    // O bug clássico: new Date("2026-09-07") em UTC-3 vira dia 6.
    expect(formatDateWith(prefs(), "2026-09-01")).toBe("01/09/2026");
    expect(formatDateWith(prefs(), "2026-01-01")).toBe("01/01/2026");
  });
});

describe("todayIn", () => {
  it("devolve o dia no fuso escolhido", () => {
    // 02:00Z do dia 8 ainda é dia 7 em São Paulo.
    expect(todayIn(prefs(), new Date("2026-09-08T02:00:00Z"))).toBe("2026-09-07");
    expect(todayIn(prefs({ timeZone: "UTC" }), new Date("2026-09-08T02:00:00Z"))).toBe("2026-09-08");
    expect(todayIn(prefs({ timeZone: "Asia/Tokyo" }), new Date("2026-09-07T20:00:00Z"))).toBe("2026-09-08");
  });
});

describe("fiscalYearRange", () => {
  it("com início em janeiro é o ano civil", () => {
    expect(fiscalYearRange(prefs(), "2026-09-07")).toEqual({ start: "2026-01-01", endExclusive: "2027-01-01" });
    expect(fiscalYearRange(prefs(), "2026-01-01")).toEqual({ start: "2026-01-01", endExclusive: "2027-01-01" });
    expect(fiscalYearRange(prefs(), "2026-12-31")).toEqual({ start: "2026-01-01", endExclusive: "2027-01-01" });
  });

  it("com início em abril, fevereiro pertence ao exercício anterior", () => {
    const abril = prefs({ fiscalYearStartMonth: 4 });
    expect(fiscalYearRange(abril, "2026-02-15")).toEqual({ start: "2025-04-01", endExclusive: "2026-04-01" });
    expect(fiscalYearRange(abril, "2026-04-01")).toEqual({ start: "2026-04-01", endExclusive: "2027-04-01" });
    expect(fiscalYearRange(abril, "2026-03-31")).toEqual({ start: "2025-04-01", endExclusive: "2026-04-01" });
  });

  it("o exercício sempre tem 12 meses", () => {
    for (let startMonth = 1; startMonth <= 12; startMonth += 1) {
      const { start, endExclusive } = fiscalYearRange(prefs({ fiscalYearStartMonth: startMonth }), "2026-06-15");
      const [sy, sm] = start.split("-").map(Number);
      const [ey, em] = endExclusive.split("-").map(Number);
      expect((ey - sy) * 12 + (em - sm)).toBe(12);
    }
  });

  it("a data de referência sempre cai dentro do exercício", () => {
    for (let startMonth = 1; startMonth <= 12; startMonth += 1) {
      for (const referencia of ["2026-01-05", "2026-06-15", "2026-12-28"]) {
        const { start, endExclusive } = fiscalYearRange(prefs({ fiscalYearStartMonth: startMonth }), referencia);
        expect(referencia >= start && referencia < endExclusive).toBe(true);
      }
    }
  });

  it("tolera mês fora da faixa", () => {
    expect(fiscalYearRange(prefs({ fiscalYearStartMonth: 0 }), "2026-06-15").start).toBe("2026-01-01");
    expect(fiscalYearRange(prefs({ fiscalYearStartMonth: 99 }), "2026-06-15").start).toBe("2025-12-01");
  });
});
