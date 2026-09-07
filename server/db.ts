import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { randomUUID } from "node:crypto";
import {
  type InsertUser,
  passwordResetRequests,
  type User,
  type UserRecord,
  users,
} from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

function createTiDbClient(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const pool = mysql.createPool({
    host: url.hostname,
    port: Number(url.port || "4000"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    connectionLimit: 10,
    enableKeepAlive: true,
  });

  return drizzle(pool);
}

export async function getDb() {
  if (_db) return _db;

  const tiDbUrl = process.env.TIDB_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;

  try {
    _db = tiDbUrl
      ? createTiDbClient(tiDbUrl)
      : defaultUrl
        ? drizzle(defaultUrl)
        : null;
  } catch (error) {
    console.error("[Database] Failed to initialize connection");
    _db = null;
  }

  return _db;
}

export function toPublicUser(record: UserRecord): User {
  const { passwordHash: _passwordHash, ...user } = record;
  return user;
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.insert(users).values({
    openId: `local_${randomUUID()}`,
    email: input.email,
    name: input.name,
    passwordHash: input.passwordHash,
    loginMethod: "password",
    lastSignedIn: new Date(),
  });

  const insertedId = Number(result[0].insertId);
  const record = await getUserRecordById(insertedId);
  if (!record) throw new Error("Created user could not be loaded");

  return toPublicUser(record);
}

export async function getUserRecordByEmail(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result[0];
}

export async function getUserRecordById(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, id));
}

export async function getRecentPasswordResetRequest(userId: number, since: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db
    .select()
    .from(passwordResetRequests)
    .where(
      and(
        eq(passwordResetRequests.userId, userId),
        isNull(passwordResetRequests.consumedAt),
        gt(passwordResetRequests.createdAt, since)
      )
    )
    .orderBy(desc(passwordResetRequests.createdAt))
    .limit(1);
  return result[0];
}

export async function createPasswordResetRequest(input: {
  id: string;
  userId: number;
  codeHash: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db
    .update(passwordResetRequests)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(passwordResetRequests.userId, input.userId),
        isNull(passwordResetRequests.consumedAt)
      )
    );
  await db.insert(passwordResetRequests).values(input);
}

export async function getPasswordResetRequest(id: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db
    .select()
    .from(passwordResetRequests)
    .where(eq(passwordResetRequests.id, id))
    .limit(1);
  return result[0];
}

export async function incrementPasswordResetAttempts(id: string, attempts: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db
    .update(passwordResetRequests)
    .set({ attempts })
    .where(eq(passwordResetRequests.id, id));
}

export async function completePasswordReset(input: {
  requestId: string;
  userId: number;
  passwordHash: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx
      .update(users)
      .set({ passwordHash: input.passwordHash })
      .where(eq(users.id, input.userId));
    await tx
      .update(passwordResetRequests)
      .set({ consumedAt: new Date() })
      .where(eq(passwordResetRequests.id, input.requestId));
  });
}

/** Legacy OAuth helper retained for migration compatibility. */
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId || !user.email) {
    throw new Error("OAuth users require openId and email");
  }

  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.insert(users).values(user).onDuplicateKeyUpdate({
    set: {
      name: user.name ?? null,
      email: user.email,
      loginMethod: user.loginMethod ?? "oauth",
      lastSignedIn: user.lastSignedIn ?? new Date(),
    },
  });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0] ? toPublicUser(result[0]) : undefined;
}
