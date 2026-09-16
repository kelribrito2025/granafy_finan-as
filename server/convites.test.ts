import { describe, expect, it } from "vitest";
import { conviteValido, gerarTokenDeConvite, hashDoConvite, motivoDaRecusa, VALIDADE_DO_CONVITE_MS, type LinhaDeConvite } from "./convites";

/*
 * O convite em memória: token, hash e validade. Sem banco.
 */

const AGORA = new Date("2026-09-17T12:00:00Z");
const linha = (over: Partial<LinhaDeConvite> = {}): LinhaDeConvite => ({
  email: "clara@escritorio.com",
  companyId: 10,
  invitedBy: 1,
  expiresAt: new Date(AGORA.getTime() + VALIDADE_DO_CONVITE_MS),
  acceptedAt: null,
  revokedAt: null,
  ...over,
});

describe("token do convite", () => {
  it("é base64url de 32 bytes: 43 caracteres, sem +, / nem =", () => {
    const token = gerarTokenDeConvite();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("dois tokens nunca coincidem", () => {
    expect(gerarTokenDeConvite()).not.toBe(gerarTokenDeConvite());
  });

  it("o hash é determinístico, hexadecimal de 64, e não revela o token", () => {
    process.env.JWT_SECRET ||= "chave-de-teste-0123456789abcdef";
    const token = gerarTokenDeConvite();
    const hash = hashDoConvite(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashDoConvite(token)).toBe(hash);
    expect(hash).not.toContain(token.slice(0, 8));
    expect(hashDoConvite(`${token}x`)).not.toBe(hash);
  });
});

describe("conviteValido", () => {
  it("vale com todas as linhas vivas", () => {
    expect(conviteValido([linha(), linha({ companyId: 11 })], AGORA)).toBe(true);
  });

  it("não vale vazio — token errado é lista vazia, não erro", () => {
    expect(conviteValido([], AGORA)).toBe(false);
    expect(motivoDaRecusa([], AGORA)).toBe("inexistente");
  });

  it("uma linha revogada derruba o lote inteiro: aceitar é tudo ou nada", () => {
    const lote = [linha(), linha({ companyId: 11, revokedAt: AGORA })];
    expect(conviteValido(lote, AGORA)).toBe(false);
    expect(motivoDaRecusa(lote, AGORA)).toBe("revogado");
  });

  it("vencido no exato instante não vale — sete dias são sete dias", () => {
    const vence = new Date(AGORA.getTime() + VALIDADE_DO_CONVITE_MS);
    expect(conviteValido([linha({ expiresAt: vence })], vence)).toBe(false);
    expect(conviteValido([linha({ expiresAt: vence })], new Date(vence.getTime() - 1))).toBe(true);
    expect(motivoDaRecusa([linha({ expiresAt: vence })], vence)).toBe("vencido");
  });

  it("já aceito é 'aceito', para a tela dizer 'você já tem acesso' e não 'inválido'", () => {
    const lote = [linha({ acceptedAt: AGORA }), linha({ companyId: 11, acceptedAt: AGORA })];
    expect(conviteValido(lote, AGORA)).toBe(false);
    expect(motivoDaRecusa(lote, AGORA)).toBe("aceito");
  });

  it("válido não tem motivo", () => {
    expect(motivoDaRecusa([linha()], AGORA)).toBeNull();
  });
});
