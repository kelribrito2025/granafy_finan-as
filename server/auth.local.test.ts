import { describe, expect, it } from "vitest";
import {
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from "./auth";

describe("local password authentication", () => {
  it("normalizes e-mail addresses consistently", () => {
    expect(normalizeEmail("  Financeiro@BigTeck.com ")).toBe(
      "financeiro@bigteck.com"
    );
  });

  it("stores only a salted scrypt hash and verifies the correct password", async () => {
    const password = "valid-password-123";
    const storedHash = await hashPassword(password);

    expect(storedHash).toMatch(/^scrypt-v1\$/);
    expect(storedHash).not.toContain(password);
    await expect(verifyPassword(password, storedHash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", storedHash)).resolves.toBe(false);
  });

  it("rejects malformed password hashes", async () => {
    await expect(verifyPassword("anything", "invalid-hash")).resolves.toBe(false);
  });
});
