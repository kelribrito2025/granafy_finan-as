import { describe, expect, it } from "vitest";
import {
  LOGIN_FAILURE_LIMIT,
  LOGIN_FAILURE_WINDOW_MS,
  loginLockedUntil,
  loginLockMessage,
} from "./loginThrottle";

const AGORA = new Date("2026-09-08T21:00:00.000Z");
const minutosAtras = (minutos: number) => new Date(AGORA.getTime() - minutos * 60_000);

describe("loginLockedUntil", () => {
  it("deixa passar quem ainda não chegou ao limite", () => {
    const falhas = [minutosAtras(1), minutosAtras(2), minutosAtras(3), minutosAtras(4)];
    expect(falhas).toHaveLength(LOGIN_FAILURE_LIMIT - 1);
    expect(loginLockedUntil(falhas, AGORA)).toBeNull();
  });

  it("fecha a porta na quinta falha da janela", () => {
    const falhas = [
      minutosAtras(4), minutosAtras(3), minutosAtras(2), minutosAtras(1), minutosAtras(0),
    ];
    const until = loginLockedUntil(falhas, AGORA);
    // A mais antiga das cinco é a que precisa expirar para sobrarem quatro.
    expect(until).toEqual(new Date(minutosAtras(4).getTime() + LOGIN_FAILURE_WINDOW_MS));
  });

  it("ignora falha que já saiu da janela", () => {
    const falhas = [
      minutosAtras(20), minutosAtras(18), minutosAtras(16),
      minutosAtras(2), minutosAtras(1),
    ];
    expect(loginLockedUntil(falhas, AGORA)).toBeNull();
  });

  it("com mais falhas que o limite, espera a que faz a contagem cair", () => {
    const falhas = [
      minutosAtras(10), minutosAtras(9), minutosAtras(8),
      minutosAtras(2), minutosAtras(1), minutosAtras(0),
    ];
    const until = loginLockedUntil(falhas, AGORA);
    // São seis: precisam expirar duas, então quem manda é a segunda mais antiga.
    expect(until).toEqual(new Date(minutosAtras(9).getTime() + LOGIN_FAILURE_WINDOW_MS));
  });

  it("não depende da ordem em que as falhas chegam", () => {
    const falhas = [minutosAtras(1), minutosAtras(4), minutosAtras(0), minutosAtras(3), minutosAtras(2)];
    expect(loginLockedUntil(falhas, AGORA)).toEqual(
      new Date(minutosAtras(4).getTime() + LOGIN_FAILURE_WINDOW_MS)
    );
  });

  it("libera quem não tem falha nenhuma", () => {
    expect(loginLockedUntil([], AGORA)).toBeNull();
  });

  it("solta a porta quando a falha decisiva expira", () => {
    const falhas = [
      minutosAtras(4), minutosAtras(3), minutosAtras(2), minutosAtras(1), minutosAtras(0),
    ];
    const until = loginLockedUntil(falhas, AGORA)!;
    expect(loginLockedUntil(falhas, new Date(until.getTime() - 1))).not.toBeNull();
    expect(loginLockedUntil(falhas, until)).toBeNull();
  });
});

describe("loginLockMessage", () => {
  it("diz quanto falta, arredondando para cima", () => {
    const until = new Date(AGORA.getTime() + 8 * 60_000 + 1_000);
    expect(loginLockMessage(until, AGORA)).toBe(
      "Muitas tentativas de entrada. Tente de novo em 9 minutos."
    );
  });

  it("nunca diz zero minuto", () => {
    expect(loginLockMessage(new Date(AGORA.getTime() + 500), AGORA)).toBe(
      "Muitas tentativas de entrada. Tente de novo em 1 minuto."
    );
  });

  it("não conta quem tentou nem se a conta existe", () => {
    const mensagem = loginLockMessage(new Date(AGORA.getTime() + 60_000), AGORA);
    expect(mensagem).not.toMatch(/@|conta|cadastr/i);
  });
});
