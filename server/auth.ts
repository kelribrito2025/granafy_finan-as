import { COOKIE_NAME } from "@shared/const";
import type { Request, Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import {
  createHmac,
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import * as db from "./db";
import { ENV } from "./_core/env";
import { getSessionCookieOptions } from "./_core/cookies";

const scrypt = promisify(scryptCallback);
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_KEY_LENGTH = 64;
const PASSWORD_PREFIX = "scrypt-v1";
const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 10;

function getSigningKey() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is required for local authentication");
  }
  return new TextEncoder().encode(ENV.cookieSecret);
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function generatePasswordResetCode() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashPasswordResetCode(requestId: string, code: string) {
  return createHmac("sha256", getSigningKey())
    .update(`${requestId}:${code}`)
    .digest("hex");
}

export function createOpaquePasswordResetRequestId(email: string) {
  const timeWindow = Math.floor(Date.now() / 30_000);
  const hex = createHmac("sha256", getSigningKey())
    .update(`${normalizeEmail(email)}:${timeWindow}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function verifyPasswordResetCode(
  requestId: string,
  code: string,
  expectedHash: string
) {
  const actual = Buffer.from(hashPasswordResetCode(requestId, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return [
    PASSWORD_PREFIX,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyPassword(password: string, storedHash: string) {
  const [prefix, saltValue, hashValue] = storedHash.split("$");
  if (prefix !== PASSWORD_PREFIX || !saltValue || !hashValue) return false;

  try {
    const salt = Buffer.from(saltValue, "base64url");
    const expected = Buffer.from(hashValue, "base64url");
    const actual = (await scrypt(password, salt, expected.length)) as Buffer;
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export async function createSessionToken(userId: number) {
  return new SignJWT({ userId, kind: "password" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSigningKey());
}

export async function createPasswordResetToken(requestId: string, userId: number) {
  return new SignJWT({ requestId, userId, kind: "password-reset" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuedAt()
    .setExpirationTime(`${PASSWORD_RESET_TOKEN_TTL_SECONDS}s`)
    .sign(getSigningKey());
}

export async function verifyPasswordResetToken(token: string) {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    algorithms: ["HS256"],
  });
  if (
    payload.kind !== "password-reset" ||
    typeof payload.requestId !== "string" ||
    typeof payload.userId !== "number"
  ) {
    throw new Error("Invalid password reset token");
  }
  return { requestId: payload.requestId, userId: payload.userId };
}

function sessionCookieOptions(req: Request) {
  return {
    ...getSessionCookieOptions(req),
    sameSite: "lax" as const,
  };
}

export async function setLocalSession(req: Request, res: Response, userId: number) {
  const token = await createSessionToken(userId);
  res.cookie(COOKIE_NAME, token, {
    ...sessionCookieOptions(req),
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearLocalSession(req: Request, res: Response) {
  res.clearCookie(COOKIE_NAME, sessionCookieOptions(req));
}

export async function authenticateLocalRequest(req: Request) {
  const cookieHeader = req.headers.cookie ?? "";
  const cookiePair = cookieHeader
    .split(";")
    .map(value => value.trim())
    .find(value => value.startsWith(`${COOKIE_NAME}=`));
  const token = cookiePair?.slice(COOKIE_NAME.length + 1);
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSigningKey(), {
      algorithms: ["HS256"],
    });
    if (payload.kind !== "password" || typeof payload.userId !== "number") {
      return null;
    }

    const record = await db.getUserRecordById(payload.userId);
    return record ? db.toPublicUser(record) : null;
  } catch {
    return null;
  }
}
