import { describe, expect, it } from "vitest";
import { compareOpeningBalance, derivedOpeningBalance, openingMismatchReason } from "./openingBalance";

describe("derivedOpeningBalance", () => {
  it("reproduz a conta que desvendou o Efi Bank", () => {
    /*
     * O arquivo de 07/09 fechou em 17.023,06 e somava +5.244,60 de movimento.
     * A abertura era 11.778,46 — que somada ao que já havia na conta explicou a
     * diferença de R$ 13.498,12 da conciliação.
     */
    expect(derivedOpeningBalance(17_023.06, [5_244.60])).toBe(11_778.46);
  });

  it("soma entradas e saídas antes de subtrair", () => {
    // Fecha em 96.210,42 depois de +24.180,00 e −14.739,58: abriu em 86.770,00.
    expect(derivedOpeningBalance(96_210.42, [24_180, -14_739.58])).toBe(86_770);
  });

  it("arquivo sem movimento nenhum abre onde fechou", () => {
    expect(derivedOpeningBalance(1_000, [])).toBe(1_000);
  });

  it("não deixa a soma derivar em float", () => {
    const centavos = Array.from({ length: 3 }, () => 0.1);
    expect(derivedOpeningBalance(1, centavos)).toBe(0.7);
  });

  it("aceita conta que fecha negativa", () => {
    expect(derivedOpeningBalance(-500, [-200])).toBe(-300);
  });
});

describe("compareOpeningBalance", () => {
  it("bate quando os dois números são iguais", () => {
    const r = compareOpeningBalance(86_770, 86_770);
    expect(r.agree).toBe(true);
    expect(r.difference).toBe(0);
  });

  it("um centavo de folga ainda bate — é arredondamento do banco", () => {
    expect(compareOpeningBalance(86_770.01, 86_770).agree).toBe(true);
    expect(compareOpeningBalance(86_769.99, 86_770).agree).toBe(true);
  });

  it("dois centavos já não batem", () => {
    expect(compareOpeningBalance(86_770.02, 86_770).agree).toBe(false);
  });

  it("a diferença tem sinal: positiva quando o digitado é maior", () => {
    expect(compareOpeningBalance(90_000, 86_770).difference).toBe(3_230);
    expect(compareOpeningBalance(80_000, 86_770).difference).toBe(-6_770);
  });

  it("o caso clássico: a pessoa digitou o saldo de hoje em vez do de abertura", () => {
    // Digitar o saldo final como se fosse o inicial é o erro que dobra o caixa.
    const r = compareOpeningBalance(96_210.42, 86_770);
    expect(r.agree).toBe(false);
    expect(r.difference).toBe(9_440.42);
  });
});

describe("openingMismatchReason", () => {
  it("não dá motivo quando os números batem", () => {
    expect(openingMismatchReason(compareOpeningBalance(86_770, 86_770), 96_210.42)).toBeNull();
  });

  it("reconhece quem digitou o saldo de hoje", () => {
    // O digitado é exatamente o saldo final do arquivo: é o erro que dobra o caixa.
    const r = compareOpeningBalance(96_210.42, 86_770);
    expect(openingMismatchReason(r, 96_210.42)).toBe("saldo_de_hoje");
  });

  it("nos outros casos só diz para que lado está a diferença", () => {
    expect(openingMismatchReason(compareOpeningBalance(90_000, 86_770), 96_210.42)).toBe("digitado_maior");
    expect(openingMismatchReason(compareOpeningBalance(80_000, 86_770), 96_210.42)).toBe("digitado_menor");
  });
});
