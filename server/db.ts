import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { randomUUID } from "node:crypto";
import {
  balanceSheetSnapshots,
  categoryRules,
  companyProfiles,
  costCenters,
  type InsertCategoryRule,
  type InsertCompanyProfile,
  type InsertUserPreferences,
  userPreferences,
  financialAccounts,
  type InsertCostCenter,
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
  "accountId" | "categoryId" | "importBatchId" | "externalId" | "fingerprint" |
  "costCenter" | "costCenterId" | "recurringMonths" | "attachmentKey" | "attachmentName" | "transferGroupId" |
  "recurrenceGroupId" | "recurrenceIndex"
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

/**
 * Saldo de cada conta, agregado no banco. A sidebar aparece em toda página, e
 * carregar os 8 mil lançamentos só para somá-los em memória seria caro por
 * navegação — um GROUP BY devolve uma linha por conta.
 */
export async function getAccountBalances(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      accountId: financialTransactions.accountId,
      total: sql<string>`SUM(${financialTransactions.amount})`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      eq(financialTransactions.status, "Pago"),
      isNotNull(financialTransactions.accountId)
    ))
    .groupBy(financialTransactions.accountId);

  return new Map(rows.map(row => [Number(row.accountId), Number(row.total ?? 0)]));
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

export async function listCostCenters(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(costCenters).where(eq(costCenters.userId, userId)).orderBy(desc(costCenters.isActive), costCenters.name);
}

export async function getCostCenter(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(costCenters).where(and(eq(costCenters.userId, userId), eq(costCenters.id, id))).limit(1);
  return rows[0];
}

export async function getCostCenterByName(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(costCenters).where(and(eq(costCenters.userId, userId), eq(costCenters.name, name))).limit(1);
  return rows[0];
}

export async function createCostCenter(userId: number, values: Omit<InsertCostCenter, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(costCenters).values({ userId, ...values });
  return getCostCenter(userId, Number(result[0].insertId));
}

export async function updateCostCenter(userId: number, id: number, values: Partial<Omit<InsertCostCenter, "userId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(costCenters).set(values).where(and(eq(costCenters.userId, userId), eq(costCenters.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ costCenter: values.name }).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.costCenterId, id)));
  }
  return getCostCenter(userId, id);
}

/** Recusa a exclusão enquanto houver lançamento apontando para o centro de custo. */
export async function deleteCostCenter(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.costCenterId, id))).limit(1);
  if (used.length) return false;
  await db.delete(costCenters).where(and(eq(costCenters.userId, userId), eq(costCenters.id, id)));
  return true;
}

/**
 * Grava as duas pernas da transferência numa transação só: ou entram as duas, ou
 * nenhuma. Meia transferência deixaria o saldo das contas errado.
 */
export async function createTransferPair(
  userId: number,
  origin: TransactionValues,
  destination: TransactionValues
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const ids = await db.transaction(async tx => {
    const originResult = await tx.insert(financialTransactions).values({ userId, ...origin });
    const destinationResult = await tx.insert(financialTransactions).values({ userId, ...destination });
    return [Number(originResult[0].insertId), Number(destinationResult[0].insertId)];
  });

  const rows = await getTransactionsByIds(userId, ids);
  return rows;
}

export async function getTransferGroup(userId: number, transferGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.transferGroupId, transferGroupId)))
    .orderBy(financialTransactions.amount);
}

/** Reescreve as duas pernas de uma transferência existente, atomicamente. */
export async function updateTransferPair(
  userId: number,
  transferGroupId: string,
  origin: TransactionValues,
  destination: TransactionValues
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getTransferGroup(userId, transferGroupId);
  if (existing.length !== 2) return null;
  const [outgoing, incoming] = Number(existing[0].amount) <= Number(existing[1].amount)
    ? [existing[0], existing[1]]
    : [existing[1], existing[0]];

  await db.transaction(async tx => {
    await tx.update(financialTransactions).set(origin).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.id, outgoing.id)));
    await tx.update(financialTransactions).set(destination).where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.id, incoming.id)));
  });
  return getTransferGroup(userId, transferGroupId);
}

export async function deleteTransferGroup(userId: number, transferGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db
    .delete(financialTransactions)
    .where(and(eq(financialTransactions.userId, userId), eq(financialTransactions.transferGroupId, transferGroupId)));
  return Number(result[0].affectedRows ?? 0);
}

/**
 * Grava uma série inteira numa transação só. Uma série pela metade deixaria o
 * usuário com parcelas faltando no meio e sem sinal de que algo falhou.
 */
export async function createTransactionSeries(userId: number, rows: TransactionValues[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (rows.length === 0) return [];

  const ids = await db.transaction(async tx => {
    const inserted: number[] = [];
    for (const row of rows) {
      const result = await tx.insert(financialTransactions).values({ userId, ...row });
      inserted.push(Number(result[0].insertId));
    }
    return inserted;
  });

  return getTransactionsByIds(userId, ids);
}

export async function getRecurrenceGroup(userId: number, recurrenceGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      eq(financialTransactions.recurrenceGroupId, recurrenceGroupId)
    ))
    .orderBy(financialTransactions.transactionDate, financialTransactions.id);
}

export async function listCategoryRules(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(categoryRules)
    .where(eq(categoryRules.userId, userId))
    .orderBy(desc(categoryRules.isActive), categoryRules.priority, categoryRules.id);
}

export async function getCategoryRule(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(categoryRules).where(and(eq(categoryRules.userId, userId), eq(categoryRules.id, id))).limit(1);
  return rows[0];
}

export async function createCategoryRule(userId: number, values: Omit<InsertCategoryRule, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(categoryRules).values({ userId, ...values });
  return getCategoryRule(userId, Number(result[0].insertId));
}

export async function updateCategoryRule(userId: number, id: number, values: Partial<Omit<InsertCategoryRule, "userId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(categoryRules).set(values).where(and(eq(categoryRules.userId, userId), eq(categoryRules.id, id)));
  return getCategoryRule(userId, id);
}

export async function deleteCategoryRule(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(categoryRules).where(and(eq(categoryRules.userId, userId), eq(categoryRules.id, id)));
  return { success: true } as const;
}

/** Quantas vezes cada conta recebeu importação, e a data da última. */
export async function getAccountImportSummary(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      accountId: transactionImportBatches.accountId,
      lastImportedAt: sql<Date>`MAX(${transactionImportBatches.createdAt})`,
      batchCount: sql<number>`COUNT(*)`,
      format: sql<string>`MAX(${transactionImportBatches.format})`,
    })
    .from(transactionImportBatches)
    .where(eq(transactionImportBatches.userId, userId))
    .groupBy(transactionImportBatches.accountId);

  return new Map(rows.map(row => [Number(row.accountId), {
    lastImportedAt: row.lastImportedAt ? new Date(row.lastImportedAt) : null,
    batchCount: Number(row.batchCount),
    format: String(row.format ?? ""),
  }]));
}

/** Quantos lançamentos cada conta teve dentro do intervalo. */
export async function getAccountTransactionCounts(userId: number, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      accountId: financialTransactions.accountId,
      total: sql<number>`COUNT(*)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      isNotNull(financialTransactions.accountId),
      gte(financialTransactions.transactionDate, startDate),
      lt(financialTransactions.transactionDate, endDate)
    ))
    .groupBy(financialTransactions.accountId);
  return new Map(rows.map(row => [Number(row.accountId), Number(row.total)]));
}

export async function getCompanyProfile(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(companyProfiles).where(eq(companyProfiles.userId, userId)).limit(1);
  return rows[0];
}

/** Uma linha por usuário: cria na primeira gravação, atualiza depois. */
export async function saveCompanyProfile(userId: number, values: Omit<InsertCompanyProfile, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getCompanyProfile(userId);
  if (existing) {
    await db.update(companyProfiles).set(values).where(eq(companyProfiles.userId, userId));
  } else {
    await db.insert(companyProfiles).values({ userId, ...values });
  }
  return getCompanyProfile(userId);
}

export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return rows[0];
}

export async function saveUserPreferences(userId: number, values: Omit<InsertUserPreferences, "userId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getUserPreferences(userId);
  if (existing) {
    await db.update(userPreferences).set(values).where(eq(userPreferences.userId, userId));
  } else {
    await db.insert(userPreferences).values({ userId, ...values });
  }
  return getUserPreferences(userId);
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
