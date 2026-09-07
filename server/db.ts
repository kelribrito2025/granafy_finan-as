import { and, desc, eq, gt, gte, inArray, isNull, lt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { randomUUID } from "node:crypto";
import {
  balanceSheetSnapshots,
  financialAccounts,
  type InsertBalanceSheetSnapshot,
  type InsertFinancialAccount,
  type InsertPatrimonialItem,
  type InsertUser,
  passwordResetRequests,
  patrimonialItems,
  transactionCategories,
  type InsertTransactionCategory,
  transactionImportBatches,
  transactions as financialTransactions,
  type InsertTransaction,
  type TransactionRecord,
  type User,
  type UserRecord,
  users,
} from "../drizzle/schema";
import {
  DEFAULT_CATEGORY_CATALOG_VERSION,
  defaultCategoryUpgradeValues,
  defaultCategoryValues,
} from "./defaultCategories";
import { chunkImportRows } from "./importers";

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
  const {
    passwordHash: _passwordHash,
    categoryDefaultsVersion: _categoryDefaultsVersion,
    ...user
  } = record;
  return user;
}

export async function createLocalUser(input: {
  email: string;
  name: string;
  passwordHash: string;
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const insertedId = await db.transaction(async tx => {
    const result = await tx.insert(users).values({
      openId: `local_${randomUUID()}`,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      loginMethod: "password",
      categoryDefaultsVersion: DEFAULT_CATEGORY_CATALOG_VERSION,
      lastSignedIn: new Date(),
    });
    const userId = Number(result[0].insertId);
    await tx.insert(transactionCategories).values(defaultCategoryValues(userId));
    return userId;
  });

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

export async function ensureDefaultTransactionCategories(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [record] = await db
    .select({ version: users.categoryDefaultsVersion })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!record) throw new Error("User not found");
  if (record.version >= DEFAULT_CATEGORY_CATALOG_VERSION) {
    return { applied: false, version: record.version };
  }

  await db.transaction(async tx => {
    const upgradeValues = defaultCategoryUpgradeValues(userId, record.version);
    if (upgradeValues.length > 0) {
      await tx
        .insert(transactionCategories)
        .values(upgradeValues)
        .onDuplicateKeyUpdate({ set: { userId } });
    }
    await tx
      .update(users)
      .set({ categoryDefaultsVersion: DEFAULT_CATEGORY_CATALOG_VERSION })
      .where(eq(users.id, userId));
  });

  return { applied: true, version: DEFAULT_CATEGORY_CATALOG_VERSION };
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

export type TransactionValues = Pick<
  InsertTransaction,
  "type" | "transactionDate" | "description" | "contact" | "category" | "amount" | "account" | "status" | "recurring" |
  "accountId" | "categoryId" | "importBatchId" | "externalId" | "fingerprint"
>;

export async function listTransactionsByPeriod(userId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      gte(financialTransactions.transactionDate, startDate),
      lt(financialTransactions.transactionDate, endDate)
    ))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function listTransactionsBefore(userId: number, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, userId), lt(financialTransactions.transactionDate, endDate)))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function listAllTransactions(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(eq(financialTransactions.userId, userId))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function getTransactionById(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.id, id)))
    .limit(1);
  return rows[0];
}

export async function getTransactionsByIds(userId: number, ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const chunks = chunkTransactionIds(ids);
  const records: TransactionRecord[] = [];
  for (const chunk of chunks) {
    records.push(...await db
      .select()
      .from(financialTransactions)
      .where(and(eq(financialTransactions.userId, userId), inArray(financialTransactions.id, chunk))));
  }
  return records;
}

export async function createTransaction(userId: number, values: TransactionValues) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.insert(financialTransactions).values({ userId, ...values });
  return getTransactionById(userId, Number(result[0].insertId));
}

export async function updateTransaction(userId: number, id: number, values: TransactionValues) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db
    .update(financialTransactions)
    .set(values)
    .where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.id, id)));
  return getTransactionById(userId, id);
}

export async function deleteTransaction(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .delete(financialTransactions)
    .where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.id, id)));
}

export const TRANSACTION_DELETE_CHUNK_SIZE = 500;

export function chunkTransactionIds(ids: number[], chunkSize = TRANSACTION_DELETE_CHUNK_SIZE) {
  const uniqueIds = Array.from(new Set(ids));
  return Array.from(
    { length: Math.ceil(uniqueIds.length / chunkSize) },
    (_, index) => uniqueIds.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}

export async function updateTransactions(
  userId: number,
  ids: number[],
  values: Partial<Pick<InsertTransaction, "transactionDate" | "category" | "categoryId" | "account" | "accountId" | "status" | "recurring">>,
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const chunks = chunkTransactionIds(ids);
  if (chunks.length === 0 || Object.keys(values).length === 0) return 0;

  return db.transaction(async tx => {
    let updatedCount = 0;
    for (const chunk of chunks) {
      const result = await tx
        .update(financialTransactions)
        .set(values)
        .where(and(eq(financialTransactions.userId, userId), inArray(financialTransactions.id, chunk)));
      updatedCount += Number(result[0].affectedRows ?? 0);
    }
    return updatedCount;
  });
}

export async function deleteTransactions(userId: number, ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const chunks = chunkTransactionIds(ids);
  if (chunks.length === 0) return 0;

  return db.transaction(async tx => {
    let deletedCount = 0;
    for (const chunk of chunks) {
      const result = await tx
        .delete(financialTransactions)
        .where(and(eq(financialTransactions.userId, userId), inArray(financialTransactions.id, chunk)));
      deletedCount += Number(result[0].affectedRows ?? 0);
    }
    return deletedCount;
  });
}

export async function listFinancialAccounts(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(financialAccounts).where(eq(financialAccounts.userId, userId)).orderBy(desc(financialAccounts.isActive), financialAccounts.name);
}

export async function getFinancialAccount(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(financialAccounts).where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.id, id))).limit(1);
  return rows[0];
}

export async function getFinancialAccountByName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(financialAccounts).where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.name, name))).limit(1);
  return rows[0];
}

export async function createFinancialAccount(userId: number, values: Omit<InsertFinancialAccount, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(financialAccounts).values({ userId, ...values });
  return getFinancialAccount(userId, Number(result[0].insertId));
}

export async function updateFinancialAccount(userId: number, id: number, values: Partial<Omit<InsertFinancialAccount, "userId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(financialAccounts).set(values).where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ account: values.name }).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.accountId, id)));
  }
  return getFinancialAccount(userId, id);
}

export async function deleteFinancialAccount(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.accountId, id))).limit(1);
  if (used.length) return false;
  await db.delete(financialAccounts).where(and(eq(financialAccounts.userId, userId), eq(financialAccounts.id, id)));
  return true;
}

export async function listTransactionCategories(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(transactionCategories).where(eq(transactionCategories.userId, userId)).orderBy(desc(transactionCategories.isActive), transactionCategories.name);
}

export async function getTransactionCategory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(transactionCategories).where(and(eq(transactionCategories.userId, userId), eq(transactionCategories.id, id))).limit(1);
  return rows[0];
}

export async function getTransactionCategoryByName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(transactionCategories).where(and(eq(transactionCategories.userId, userId), eq(transactionCategories.name, name))).limit(1);
  return rows[0];
}

export async function createTransactionCategory(userId: number, values: Omit<InsertTransactionCategory, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(transactionCategories).values({ userId, ...values });
  return getTransactionCategory(userId, Number(result[0].insertId));
}

export async function updateTransactionCategory(userId: number, id: number, values: Partial<Omit<InsertTransactionCategory, "userId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(transactionCategories).set(values).where(and(eq(transactionCategories.userId, userId), eq(transactionCategories.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ category: values.name }).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.categoryId, id)));
  }
  return getTransactionCategory(userId, id);
}

export async function deleteTransactionCategory(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.categoryId, id))).limit(1);
  if (used.length) return false;
  await db.delete(transactionCategories).where(and(eq(transactionCategories.userId, userId), eq(transactionCategories.id, id)));
  return true;
}

export async function getTransactionsByFingerprints(userId: number, fingerprints: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!fingerprints.length) return [];
  const results: Array<{ fingerprint: string | null }> = [];
  for (const chunk of chunkImportRows(Array.from(new Set(fingerprints)))) {
    results.push(...await db.select({ fingerprint: financialTransactions.fingerprint }).from(financialTransactions).where(and(eq(financialTransactions.userId, userId), inArray(financialTransactions.fingerprint, chunk))));
  }
  return results;
}

export async function createImportBatch(input: {
  id: string;
  userId: number;
  fileName: string;
  format: "csv" | "ofx";
  accountId: number;
  duplicateCount: number;
  transactions: TransactionValues[];
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.insert(transactionImportBatches).values({
      id: input.id,
      userId: input.userId,
      fileName: input.fileName,
      format: input.format,
      accountId: input.accountId,
      importedCount: input.transactions.length,
      duplicateCount: input.duplicateCount,
    });
    for (const chunk of chunkImportRows(input.transactions)) {
      await tx.insert(financialTransactions).values(chunk.map(transaction => ({
          userId: input.userId,
          ...transaction,
          importBatchId: input.id,
        })));
    }
  });
}

export async function listImportBatches(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(transactionImportBatches).where(eq(transactionImportBatches.userId, userId)).orderBy(desc(transactionImportBatches.createdAt)).limit(12);
}

export async function listPatrimonialItems(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(patrimonialItems)
    .where(eq(patrimonialItems.userId, userId))
    .orderBy(desc(patrimonialItems.isActive), patrimonialItems.balanceGroup, patrimonialItems.name);
}

export async function getPatrimonialItem(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, userId), eq(patrimonialItems.id, id)))
    .limit(1);
  return rows[0];
}

export async function getPatrimonialItemByName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, userId), eq(patrimonialItems.name, name)))
    .limit(1);
  return rows[0];
}

export async function createPatrimonialItem(
  userId: number,
  values: Omit<InsertPatrimonialItem, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(patrimonialItems).values({ userId, ...values });
  return getPatrimonialItem(userId, Number(result[0].insertId));
}

export async function updatePatrimonialItem(
  userId: number,
  id: number,
  values: Partial<Omit<InsertPatrimonialItem, "userId">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(patrimonialItems)
    .set(values)
    .where(and(eq(patrimonialItems.userId, userId), eq(patrimonialItems.id, id)));
  return getPatrimonialItem(userId, id);
}

export async function deletePatrimonialItem(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .delete(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, userId), eq(patrimonialItems.id, id)));
}

export async function listBalanceSheetSnapshots(userId: number, limit = 24) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(balanceSheetSnapshots)
    .where(eq(balanceSheetSnapshots.userId, userId))
    .orderBy(desc(balanceSheetSnapshots.referenceDate))
    .limit(limit);
}

export async function upsertBalanceSheetSnapshot(
  userId: number,
  values: Omit<InsertBalanceSheetSnapshot, "userId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(balanceSheetSnapshots)
    .values({ userId, ...values })
    .onDuplicateKeyUpdate({
      set: {
        cashAndEquivalents: values.cashAndEquivalents,
        currentAssets: values.currentAssets,
        nonCurrentAssets: values.nonCurrentAssets,
        currentLiabilities: values.currentLiabilities,
        nonCurrentLiabilities: values.nonCurrentLiabilities,
        declaredEquity: values.declaredEquity,
        totalAssets: values.totalAssets,
        totalLiabilities: values.totalLiabilities,
        netWorth: values.netWorth,
        itemCount: values.itemCount,
        updatedAt: new Date(),
      },
    });
  const rows = await db
    .select()
    .from(balanceSheetSnapshots)
    .where(and(
      eq(balanceSheetSnapshots.userId, userId),
      eq(balanceSheetSnapshots.referenceDate, values.referenceDate)
    ))
    .limit(1);
  return rows[0];
}

export async function deleteBalanceSheetSnapshot(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .delete(balanceSheetSnapshots)
    .where(and(eq(balanceSheetSnapshots.userId, userId), eq(balanceSheetSnapshots.id, id)));
}
