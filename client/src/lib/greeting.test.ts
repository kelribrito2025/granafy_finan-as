import { describe, expect, it } from "vitest";
import { brasiliaHour, greetingFor } from "./greeting";

// Brasília é UTC−3 o ano todo.
const utc = (iso: string) => new Date(iso);

describe("brasiliaHour", () => {
  it("converte de UTC para o relógio de Brasília", () => {
    expect(brasiliaHour(utc("2026-09-07T12:00:00Z"))).toBe(9);
    expect(brasiliaHour(utc("2026-09-07T15:00:00Z"))).toBe(12);
  });

  it("devolve 0 na meia-noite, não 24", () => {
    // 03:00Z é meia-noite em Brasília: com hour12:false alguns navegadores
    // devolvem "24" e a saudação cairia fora de todas as faixas.
    expect(brasiliaHour(utc("2026-09-08T03:00:00Z"))).toBe(0);
  });

  it("atravessa a virada do dia", () => {
    // 02:00Z do dia 7 ainda é 23h do dia 6 em Brasília.
    expect(brasiliaHour(utc("2026-09-07T02:00:00Z"))).toBe(23);
  });

  it("não depende do fuso da máquina", () => {
    // O mesmo instante, escrito com outro deslocamento, dá a mesma hora.
    expect(brasiliaHour(utc("2026-09-07T12:00:00Z"))).toBe(brasiliaHour(utc("2026-09-07T09:00:00-03:00")));
    expect(brasiliaHour(utc("2026-09-07T12:00:00Z"))).toBe(brasiliaHour(utc("2026-09-07T14:00:00+02:00")));
  });
});

describe("greetingFor", () => {
  it("saúda pela manhã entre 5h e 11h59", () => {
    expect(greetingFor(utc("2026-09-07T08:00:00Z"))).toBe("Bom dia"); // 05:00
    expect(greetingFor(utc("2026-09-07T14:59:00Z"))).toBe("Bom dia"); // 11:59
  });

  it("saúda à tarde entre 12h e 17h59", () => {
    expect(greetingFor(utc("2026-09-07T15:00:00Z"))).toBe("Boa tarde"); // 12:00
    expect(greetingFor(utc("2026-09-07T20:59:00Z"))).toBe("Boa tarde"); // 17:59
  });

  it("saúda à noite entre 18h e 4h59", () => {
    expect(greetingFor(utc("2026-09-07T21:00:00Z"))).toBe("Boa noite"); // 18:00
    expect(greetingFor(utc("2026-09-08T03:00:00Z"))).toBe("Boa noite"); // 00:00
    expect(greetingFor(utc("2026-09-08T07:59:00Z"))).toBe("Boa noite"); // 04:59
  });

  it("cobre as 24 horas sem buraco", () => {
    const saudacoes = new Set<string>();
    for (let hour = 0; hour < 24; hour += 1) {
      // 03:00Z é 00h em Brasília; somando horas percorremos o dia inteiro.
      const instant = new Date(Date.UTC(2026, 8, 8, 3 + hour, 30));
      saudacoes.add(greetingFor(instant));
    }
    expect(saudacoes).toEqual(new Set(["Bom dia", "Boa tarde", "Boa noite"]));
  });
});
