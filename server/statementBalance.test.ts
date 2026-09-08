import { describe, expect, it } from "vitest";
import { pickDeclaredBalance, type DeclaredBalance } from "./statementBalance";

const arquivo = (asOf: string, balance: number): DeclaredBalance => ({ balance, asOf, origin: "arquivo" });
const manual = (asOf: string, balance: number): DeclaredBalance => ({ balance, asOf, origin: "manual" });

describe("qual saldo declarado vale", () => {
  it("sem nenhum, não inventa zero", () => {
    expect(pickDeclaredBalance(null, null)).toBeNull();
  });

  it("usa o do arquivo quando é o único", () => {
    expect(pickDeclaredBalance(arquivo("2026-09-30", 100), null)?.origin).toBe("arquivo");
  });

  it("usa o informado quando é o único — o caso de quem importou CSV", () => {
    expect(pickDeclaredBalance(null, manual("2026-09-30", 100))?.origin).toBe("manual");
  });

  it("o mais recente ganha, venha de onde vier", () => {
    expect(pickDeclaredBalance(arquivo("2026-09-30", 100), manual("2026-08-31", 90))?.origin).toBe("arquivo");
    expect(pickDeclaredBalance(arquivo("2026-08-31", 90), manual("2026-09-30", 100))?.origin).toBe("manual");
  });

  it("no empate de data vale o informado: quem digitou depois estava corrigindo", () => {
    const escolhido = pickDeclaredBalance(arquivo("2026-09-30", 100), manual("2026-09-30", 137));
    expect(escolhido?.origin).toBe("manual");
    expect(escolhido?.balance).toBe(137);
  });
});
