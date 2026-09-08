import { describe, expect, it } from "vitest";
import { roundCurrency } from "./currency";

describe("roundCurrency", () => {
  it("corta a deriva que o float acumula na soma", () => {
    // O caso clássico: sem arredondar, o CSV sairia com 0.30000000000000004.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(roundCurrency(0.1 + 0.2)).toBe(0.3);
  });

  it("fecha uma soma longa de centavos no valor exato", () => {
    const centavos = Array.from({ length: 420 }, () => 0.29);
    const cru = centavos.reduce((soma, valor) => soma + valor, 0);
    expect(cru).not.toBe(121.8);
    expect(roundCurrency(cru)).toBe(121.8);
  });

  it("não devolve zero negativo", () => {
    // Somar uma lista vazia de saídas cai aqui, e a tela escreveria "− R$ 0,00".
    expect(Object.is(roundCurrency(-0), 0)).toBe(true);
    expect(Object.is(roundCurrency(-0.001), 0)).toBe(true);
    expect(Object.is(roundCurrency(0), 0)).toBe(true);
  });

  it("arredonda o meio centavo para cima", () => {
    expect(roundCurrency(1.005)).toBe(1.01);
    expect(roundCurrency(2.675)).toBe(2.68);
  });

  it("deixa quem já está em centavo exatamente como está", () => {
    expect(roundCurrency(17_023.06)).toBe(17_023.06);
    expect(roundCurrency(-3_000)).toBe(-3_000);
    expect(roundCurrency(5_244.6)).toBe(5_244.6);
  });

  it("preserva o sinal de valor negativo de verdade", () => {
    expect(roundCurrency(-0.005 - 0.005)).toBe(-0.01);
    expect(roundCurrency(-58_546.939)).toBe(-58_546.94);
  });
});
