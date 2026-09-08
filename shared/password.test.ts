import { describe, expect, it } from "vitest";
import {
  isPasswordValid,
  PASSWORD_MIN_LENGTH,
  passwordChecks,
  passwordStrength,
} from "./password";

describe("passwordChecks", () => {
  it("cobra oito caracteres, um número e um especial", () => {
    expect(passwordChecks("abc1!")).toEqual({ length: false, number: true, special: true });
    expect(passwordChecks("abcdefgh")).toEqual({ length: true, number: false, special: false });
    expect(passwordChecks("abcdefg1")).toEqual({ length: true, number: true, special: false });
    expect(passwordChecks("abcdefg!")).toEqual({ length: true, number: false, special: true });
    expect(passwordChecks("abcdef1!")).toEqual({ length: true, number: true, special: true });
  });

  it("aceita acento e espaço como caractere especial", () => {
    expect(passwordChecks("senha123ç").special).toBe(true);
    expect(passwordChecks("senha 123").special).toBe(true);
  });

  it("o mínimo é exatamente oito, não nove", () => {
    expect(passwordChecks("a1!bcdef").length).toBe(true);
    expect("a1!bcdef".length).toBe(PASSWORD_MIN_LENGTH);
    expect(passwordChecks("a1!bcde").length).toBe(false);
  });
});

describe("isPasswordValid", () => {
  it("só passa quando as três exigências passam", () => {
    expect(isPasswordValid("Granafy1!")).toBe(true);
    expect(isPasswordValid("Granafy11")).toBe(false);
    expect(isPasswordValid("Granafy!!")).toBe(false);
    expect(isPasswordValid("Gr1!")).toBe(false);
    expect(isPasswordValid("")).toBe(false);
  });
});

describe("passwordStrength", () => {
  it("campo vazio não acende nada", () => {
    expect(passwordStrength("")).toEqual({ score: 0, label: "", valid: false });
  });

  it("senha inválida nunca chega a três segmentos", () => {
    for (const senha of ["abc", "abcdefgh", "abcdefg1", "12345678", "!!!!!!!!"]) {
      const força = passwordStrength(senha);
      expect(força.valid).toBe(false);
      expect(força.score).toBeLessThan(3);
    }
  });

  it("cumprindo as três exigências fica boa", () => {
    expect(passwordStrength("abcdef1!")).toEqual({ score: 3, label: "Senha boa", valid: true });
  });

  it("com doze caracteres ou mais fica forte", () => {
    expect(passwordStrength("abcdefgh123!")).toEqual({ score: 4, label: "Senha forte", valid: true });
  });

  it("comprimento sozinho não compra força", () => {
    expect(passwordStrength("abcdefghijklmnop").valid).toBe(false);
  });
});
