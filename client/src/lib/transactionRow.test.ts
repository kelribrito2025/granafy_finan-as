import { describe, expect, it } from "vitest";
import { daysBetween, monogram, monogramSource, rowStatus } from "./transactionRow";

const hoje = "2026-09-07";

describe("daysBetween", () => {
  it("conta dias inteiros", () => {
    expect(daysBetween("2026-09-01", "2026-09-07")).toBe(6);
    expect(daysBetween("2026-09-07", "2026-09-07")).toBe(0);
  });

  it("atravessa mês e ano", () => {
    expect(daysBetween("2026-08-31", "2026-09-01")).toBe(1);
    expect(daysBetween("2025-12-31", "2026-01-01")).toBe(1);
  });

  it("é negativo para datas futuras", () => {
    expect(daysBetween("2026-09-10", hoje)).toBe(-3);
  });
});

describe("rowStatus", () => {
  it("marca pago como positivo", () => {
    expect(rowStatus({ type: "saida", status: "Pago", transactionDate: "2026-09-01" }, hoje))
      .toEqual({ label: "Pago", tone: "positive" });
  });

  it("chama de atrasado o pendente já vencido", () => {
    const status = rowStatus({ type: "saida", status: "Pendente", transactionDate: "2026-09-02" }, hoje);
    expect(status.label).toBe("Atrasado");
    expect(status.tone).toBe("negative");
    expect(status.daysLate).toBe(5);
  });

  it("não chama de atrasado o que vence hoje", () => {
    expect(rowStatus({ type: "saida", status: "Pendente", transactionDate: hoje }, hoje))
      .toEqual({ label: "Em aberto", tone: "neutral" });
  });

  it("não chama de atrasado o que vence no futuro", () => {
    expect(rowStatus({ type: "saida", status: "Pendente", transactionDate: "2026-10-01" }, hoje).label)
      .toBe("Em aberto");
  });

  it("mantém a transferência em tom neutro, paga ou não", () => {
    expect(rowStatus({ type: "transferencia", status: "Pago", transactionDate: "2026-09-01" }, hoje))
      .toEqual({ label: "Concluída", tone: "neutral" });
    // Vencida, mas ainda assim neutra: não é despesa em atraso.
    expect(rowStatus({ type: "transferencia", status: "Pendente", transactionDate: "2026-08-01" }, hoje))
      .toEqual({ label: "Em aberto", tone: "neutral" });
  });
});

describe("monogram", () => {
  it("usa as iniciais das duas primeiras palavras", () => {
    expect(monogram("Google Ads campanha")).toBe("GA");
    expect(monogram("Contabilidade Vieira")).toBe("CV");
  });

  it("ignora conectivos", () => {
    expect(monogram("Pix recebido via QR Code")).toBe("PR");
    expect(monogram("Taxa do gateway")).toBe("TG");
  });

  it("usa duas letras quando só há uma palavra", () => {
    expect(monogram("Twilio")).toBe("TW");
  });

  it("tira acento", () => {
    expect(monogram("Água Ártica")).toBe("AA");
  });

  it("não quebra com texto vazio ou só pontuação", () => {
    expect(monogram("")).toBe("—");
    expect(monogram("··· ---")).toBe("—");
  });
});

describe("monogramSource", () => {
  it("prefere o contato quando existe", () => {
    expect(monogramSource("Pix recebido via QR Code: Ana Lima", "Loja Oneclick")).toBe("Loja Oneclick");
  });

  it("usa o nome depois dos dois-pontos quando não há contato", () => {
    expect(monogramSource("Pix recebido via QR Code: Ana Lima", "")).toBe("Ana Lima");
    expect(monogram(monogramSource("Pix recebido via QR Code: Ana Lima", ""))).toBe("AL");
  });

  it("não deixa duas descrições de Pix virarem o mesmo monograma", () => {
    const primeiro = monogram(monogramSource("Pix recebido via QR Code: Ana Lima", ""));
    const segundo = monogram(monogramSource("Pix recebido via QR Code: Bruno Souza", ""));
    expect(primeiro).not.toBe(segundo);
  });

  it("cai na descrição quando não há contato nem nome útil", () => {
    expect(monogramSource("Twilio fatura", "")).toBe("Twilio fatura");
    expect(monogramSource("Taxa:", "")).toBe("Taxa:");
  });

  it("ignora contato curto demais", () => {
    expect(monogramSource("Google Ads", "A")).toBe("Google Ads");
  });
});
