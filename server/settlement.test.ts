import { describe, expect, it } from "vitest";
import { settlementDateFor } from "./settlement";

const HOJE = "2026-09-08";

describe("settlementDateFor", () => {
  it("marcar como pago sem informar data assume hoje", () => {
    expect(settlementDateFor({ status: "Pago", todayIso: HOJE })).toBe(HOJE);
  });

  it("a data informada no formulário manda", () => {
    expect(settlementDateFor({ status: "Pago", informed: "2026-09-03", todayIso: HOJE })).toBe("2026-09-03");
  });

  it("editar outro campo não move a liquidação para hoje", () => {
    // A data que está lá é um fato, não o reflexo da última vez que alguém salvou.
    expect(settlementDateFor({ status: "Pago", existing: "2026-08-28", todayIso: HOJE })).toBe("2026-08-28");
  });

  it("a data informada vence a que já estava gravada", () => {
    expect(settlementDateFor({
      status: "Pago", informed: "2026-09-01", existing: "2026-08-28", todayIso: HOJE,
    })).toBe("2026-09-01");
  });

  it("voltar para pendente é o estorno: a liquidação some", () => {
    expect(settlementDateFor({ status: "Pendente", existing: "2026-08-28", todayIso: HOJE })).toBeNull();
    expect(settlementDateFor({ status: "Pendente", informed: "2026-08-28", todayIso: HOJE })).toBeNull();
    expect(settlementDateFor({ status: "Pendente", todayIso: HOJE })).toBeNull();
  });

  it("texto vazio não conta como data informada", () => {
    // O formulário manda "" quando o campo fica em branco, e "" gravado viraria
    // uma data inválida no banco.
    expect(settlementDateFor({ status: "Pago", informed: "", todayIso: HOJE })).toBe(HOJE);
    expect(settlementDateFor({ status: "Pago", informed: "", existing: "2026-08-28", todayIso: HOJE })).toBe("2026-08-28");
  });

  it("liquidação anterior ao vencimento é aceita, e é o caso do pagamento adiantado", () => {
    expect(settlementDateFor({ status: "Pago", informed: "2026-09-01", todayIso: HOJE })).toBe("2026-09-01");
  });
});
