import { describe, expect, it, vi } from "vitest";

/*
 * O alerta de contas atrasadas, sem banco e sem Resend.
 *
 * O que se prova aqui é a REGRA: a hora no fuso da pessoa, o carimbo por dia,
 * o e-mail que só sai quando há atraso, e o carimbo que volta quando o envio
 * falha. O que o banco responde é simulado; o que importa é o que o
 * agendador faz com a resposta.
 */

const listarDestinatariosDeAlerta = vi.fn();
const listCompanies = vi.fn();
const listarContasAtrasadas = vi.fn();
const registrarEnvioDeAlerta = vi.fn();
const desfazerEnvioDeAlerta = vi.fn();
const sendOverdueAlert = vi.fn();

vi.mock("./db", () => ({
  listarDestinatariosDeAlerta: (...a: unknown[]) => listarDestinatariosDeAlerta(...a),
  listCompanies: (...a: unknown[]) => listCompanies(...a),
  listarContasAtrasadas: (...a: unknown[]) => listarContasAtrasadas(...a),
  registrarEnvioDeAlerta: (...a: unknown[]) => registrarEnvioDeAlerta(...a),
  desfazerEnvioDeAlerta: (...a: unknown[]) => desfazerEnvioDeAlerta(...a),
  getUserPreferences: vi.fn(),
}));
vi.mock("./email", () => ({ sendOverdueAlert: (...a: unknown[]) => sendOverdueAlert(...a) }));

const { diasEntre, enviarAlertasDoDia, horaLocal, montarContas } = await import("./alertas");

const ANA = { userId: 1, email: "ana@example.com", name: "Ana", timeZone: "America/Sao_Paulo" };
const PADARIA = { id: 10, userId: 1, legalName: "Padaria", tradeName: "", isActive: true };
const ATRASADA = { description: "Aluguel", contact: "Imobiliária", transactionDate: "2026-09-10", amount: "-1500.00" };

/** 2026-09-16 às 11:30 em São Paulo (UTC−3) = 14:30Z. */
const MEIO_DA_MANHA = new Date("2026-09-16T14:30:00Z");
/** 06:00 em São Paulo = 09:00Z. */
const CEDO = new Date("2026-09-16T09:00:00Z");

function limpar() {
  for (const f of [listarDestinatariosDeAlerta, listCompanies, listarContasAtrasadas, registrarEnvioDeAlerta, desfazerEnvioDeAlerta, sendOverdueAlert]) f.mockReset();
  listarDestinatariosDeAlerta.mockResolvedValue([ANA]);
  listCompanies.mockResolvedValue([PADARIA]);
  registrarEnvioDeAlerta.mockResolvedValue(true);
  sendOverdueAlert.mockResolvedValue(true);
}

describe("horaLocal e diasEntre", () => {
  it("lê a hora no fuso da pessoa, não no do servidor", () => {
    expect(horaLocal(MEIO_DA_MANHA, "America/Sao_Paulo")).toBe(11);
    expect(horaLocal(MEIO_DA_MANHA, "UTC")).toBe(14);
    expect(horaLocal(CEDO, "America/Sao_Paulo")).toBe(6);
  });

  it("conta os dias de atraso em dias inteiros", () => {
    expect(diasEntre("2026-09-10", "2026-09-16")).toBe(6);
    expect(diasEntre("2026-09-16", "2026-09-16")).toBe(0);
    expect(diasEntre("2026-08-31", "2026-09-01")).toBe(1);
  });

  it("monta a lista com valor positivo e total arredondado", () => {
    const { contas, total } = montarContas([ATRASADA, { ...ATRASADA, description: "Luz", amount: "-0.10" }], "2026-09-16");
    expect(contas[0]).toEqual({ descricao: "Aluguel", contato: "Imobiliária", vencimento: "2026-09-10", diasDeAtraso: 6, valor: 1500 });
    expect(total).toBe(1500.1);
  });
});

describe("enviarAlertasDoDia", () => {
  it("manda um e-mail por empresa com atraso, e carimba o dia antes de mandar", async () => {
    limpar();
    listarContasAtrasadas.mockResolvedValue([ATRASADA]);
    const resumo = await enviarAlertasDoDia(MEIO_DA_MANHA);

    expect(resumo).toMatchObject({ enviados: 1, semAtraso: 0, foraDaHora: 0, jaEnviados: 0, falhas: 0 });
    expect(registrarEnvioDeAlerta).toHaveBeenCalledWith(1, { companyId: 10, kind: "contas_atrasadas", sentOn: "2026-09-16" });
    expect(sendOverdueAlert).toHaveBeenCalledOnce();
    const enviado = sendOverdueAlert.mock.calls[0]![0] as { to: string; empresa: string; total: number; contas: unknown[] };
    expect(enviado.to).toBe("ana@example.com");
    expect(enviado.empresa).toBe("Padaria");
    expect(enviado.total).toBe(1500);
    expect(enviado.contas).toHaveLength(1);
    // A ordem: o carimbo antes do envio — é ele que segura a rodada concorrente.
    expect(registrarEnvioDeAlerta.mock.invocationCallOrder[0]!).toBeLessThan(sendOverdueAlert.mock.invocationCallOrder[0]!);
  });

  it("antes das 8h no fuso da pessoa, não manda nem consulta", async () => {
    limpar();
    const resumo = await enviarAlertasDoDia(CEDO);
    expect(resumo.foraDaHora).toBe(1);
    expect(listarContasAtrasadas).not.toHaveBeenCalled();
    expect(sendOverdueAlert).not.toHaveBeenCalled();
  });

  it("sem conta atrasada, sem e-mail e sem carimbo", async () => {
    limpar();
    listarContasAtrasadas.mockResolvedValue([]);
    const resumo = await enviarAlertasDoDia(MEIO_DA_MANHA);
    expect(resumo.semAtraso).toBe(1);
    expect(registrarEnvioDeAlerta).not.toHaveBeenCalled();
    expect(sendOverdueAlert).not.toHaveBeenCalled();
  });

  it("já carimbado hoje: a segunda rodada não manda de novo", async () => {
    limpar();
    listarContasAtrasadas.mockResolvedValue([ATRASADA]);
    registrarEnvioDeAlerta.mockResolvedValue(false);
    const resumo = await enviarAlertasDoDia(MEIO_DA_MANHA);
    expect(resumo.jaEnviados).toBe(1);
    expect(sendOverdueAlert).not.toHaveBeenCalled();
  });

  it("se o envio falha, o carimbo volta — hoje ainda merece tentativa", async () => {
    limpar();
    listarContasAtrasadas.mockResolvedValue([ATRASADA]);
    sendOverdueAlert.mockResolvedValue(false);
    const resumo = await enviarAlertasDoDia(MEIO_DA_MANHA);
    expect(resumo.falhas).toBe(1);
    expect(desfazerEnvioDeAlerta).toHaveBeenCalledWith(1, { companyId: 10, kind: "contas_atrasadas", sentOn: "2026-09-16" });
  });

  it("empresa arquivada não recebe alerta", async () => {
    limpar();
    listCompanies.mockResolvedValue([{ ...PADARIA, isActive: false }]);
    listarContasAtrasadas.mockResolvedValue([ATRASADA]);
    const resumo = await enviarAlertasDoDia(MEIO_DA_MANHA);
    expect(resumo.avaliados).toBe(0);
    expect(sendOverdueAlert).not.toHaveBeenCalled();
  });
});
