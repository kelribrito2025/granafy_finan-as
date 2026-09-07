import { describe, expect, it } from "vitest";
import {
  createOpaquePasswordResetRequestId,
  createPasswordResetToken,
  generatePasswordResetCode,
  hashPassword,
  hashPasswordResetCode,
  normalizeEmail,
  verifyPassword,
  verifyPasswordResetCode,
  verifyPasswordResetToken,
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

  it("generates six-digit codes and verifies only the correct request pair", () => {
    process.env.JWT_SECRET ||= "test-only-jwt-secret";
    const requestId = "8126f034-8b58-4d24-9778-7841f106a860";
    const code = generatePasswordResetCode();
    const hash = hashPasswordResetCode(requestId, code);

    expect(code).toMatch(/^\d{6}$/);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPasswordResetCode(requestId, code, hash)).toBe(true);
    expect(verifyPasswordResetCode(requestId, "000000", hash)).toBe(
      code === "000000"
    );
    expect(verifyPasswordResetCode("other-request", code, hash)).toBe(false);
  });

  it("creates a short-lived password-reset token with bound identifiers", async () => {
    process.env.JWT_SECRET ||= "test-only-jwt-secret";
    const requestId = "8126f034-8b58-4d24-9778-7841f106a860";
    const token = await createPasswordResetToken(requestId, 42);

    await expect(verifyPasswordResetToken(token)).resolves.toEqual({
      requestId,
      userId: 42,
    });
  });

  it("creates an opaque UUID-shaped request id without exposing the e-mail", () => {
    process.env.JWT_SECRET ||= "test-only-jwt-secret";
    const requestId = createOpaquePasswordResetRequestId("private@example.com");

    expect(requestId).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/
    );
    expect(requestId).not.toContain("private");
  });
});
