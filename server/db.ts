import { and, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, sql } from "drizzle-orm";
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
  statementBalances,
  transactionCategories,
  type InsertTransactionCategory,
  bankMovements,
  reconciliationAudit,
  reconciliationLinks,
  reconciliationPeriods,
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
import { pickDeclaredBalance } from "./statementBalance";
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
    /*
     * O TiDB fica em us-east-1 e cada conexão nova paga um handshake TLS de
     * ida e volta. Com o padrão de 60 s de ocioso, quem voltasse à tela depois
     * de um minuto pagava esse handshake de novo, uma vez por consulta em
     * paralelo. Meia hora de ocioso mantém o pool quente sem segurar conexão à
     * toa — o keep-alive acima cuida de derrubar a que morreu do outro lado.
     */
    idleTimeout: 30 * 60_000,
    maxIdle: 10,
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
  /** Null quando a conta nasce por provedor externo: não existe senha para guardar. */
  passwordHash: string | null;
  loginMethod?: string;
}): Promise<User> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const insertedId = await db.transaction(async tx => {
    const result = await tx.insert(users).values({
      openId: `local_${randomUUID()}`,
      email: input.email,
      name: input.name,
      passwordHash: input.passwordHash,
      loginMethod: input.loginMethod ?? "password",
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
export async function getAccountBalances(userId: number, throughDate?: string) {
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
      isNotNull(financialTransactions.accountId),
      ...(throughDate ? [lte(financialTransactions.transactionDate, throughDate)] : [])
    ))
    .groupBy(financialTransactions.accountId);

  return new Map(rows.map(row => [Number(row.accountId), Number(row.total ?? 0)]));
}

/**
 * A soma de tudo que veio antes de `date`, para o saldo anterior do extrato.
 *
 * Existe porque a alternativa era baixar o razão inteiro só para somar uma
 * coluna: no maior usuário são 5.850 linhas para produzir um número.
 */
export async function sumTransactionsBefore(userId: number, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({ total: sql<string>`SUM(${financialTransactions.amount})` })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      lt(financialTransactions.transactionDate, date)
    ));
  return Number(row?.total ?? 0);
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

/**
 * Transforma uma linha já existente na primeira parcela e insere as seguintes.
 * A operação é atômica para nunca deixar uma recorrência criada pela metade.
 */
export async function materializeTransactionSeries(
  userId: number,
  existingId: number,
  rows: TransactionValues[],
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (rows.length === 0) return [];

  const ids = await db.transaction(async tx => {
    const updated = await tx
      .update(financialTransactions)
      .set(rows[0])
      .where(and(
        eq(financialTransactions.userId, userId),
        eq(financialTransactions.id, existingId),
        isNull(financialTransactions.recurrenceGroupId),
      ));
    if (Number(updated[0].affectedRows ?? 0) !== 1) {
      throw new Error("Transaction is already part of a recurrence series");
    }

    const insertedIds = [existingId];
    for (const row of rows.slice(1)) {
      const result = await tx.insert(financialTransactions).values({ userId, ...row });
      insertedIds.push(Number(result[0].insertId));
    }
    return insertedIds;
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

/**
 * Só as contagens que a barra lateral recolhida mostra na bolinha.
 *
 * A tela de títulos carrega todos os lançamentos para montar a lista; a barra
 * aparece em todas as páginas e não pode pagar esse preço, então aqui é COUNT
 * no banco.
 */
export async function countOpenTitles(userId: number, todayIso: string, monthLastDay: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [row] = await db
    .select({
      open: sql<number>`COUNT(*)`,
      overdue: sql<number>`SUM(CASE WHEN ${financialTransactions.transactionDate} < ${todayIso} THEN 1 ELSE 0 END)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, userId),
      eq(financialTransactions.status, "Pendente"),
      sql`${financialTransactions.type} <> 'transferencia'`,
      // A mesma janela da tela de títulos: o mês corrente mais o que já venceu.
      // Contar as parcelas de um ano à frente faria a bolinha discordar da
      // página que ela abre.
      sql`(${financialTransactions.transactionDate} <= ${monthLastDay} OR ${financialTransactions.transactionDate} < ${todayIso})`
    ));

  return { open: Number(row?.open ?? 0), overdue: Number(row?.overdue ?? 0) };
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

// ===========================================================================
// Conciliação bancária
// ===========================================================================

export async function listBankMovements(userId: number, accountId: number, start: string, end: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(bankMovements)
    .where(and(
      eq(bankMovements.userId, userId),
      eq(bankMovements.accountId, accountId),
      gte(bankMovements.movementDate, start),
      lte(bankMovements.movementDate, end)
    ))
    .orderBy(desc(bankMovements.movementDate), desc(bankMovements.id));
}

export async function getBankMovement(userId: number, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(bankMovements)
    .where(and(eq(bankMovements.userId, userId), eq(bankMovements.id, id))).limit(1);
  return rows[0];
}

export async function listReconciliationLinks(userId: number, movementIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (movementIds.length === 0) return [];
  return db.select().from(reconciliationLinks)
    .where(and(eq(reconciliationLinks.userId, userId), inArray(reconciliationLinks.movementId, movementIds)));
}

/**
 * Lançamentos da conta na janela que ainda não estão presos a nenhuma
 * movimentação. Só eles podem ser sugeridos: oferecer um lançamento já
 * conciliado seria propor conciliar a mesma coisa duas vezes.
 */
export async function listUnlinkedTransactions(userId: number, accountId: number, start: string, end: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      id: financialTransactions.id,
      accountId: financialTransactions.accountId,
      transactionDate: financialTransactions.transactionDate,
      description: financialTransactions.description,
      contact: financialTransactions.contact,
      amount: financialTransactions.amount,
      category: financialTransactions.category,
      linkId: reconciliationLinks.id,
    })
    .from(financialTransactions)
    .leftJoin(reconciliationLinks, eq(reconciliationLinks.transactionId, financialTransactions.id))
    .where(and(
      eq(financialTransactions.userId, userId),
      eq(financialTransactions.accountId, accountId),
      gte(financialTransactions.transactionDate, start),
      lte(financialTransactions.transactionDate, end),
      isNull(reconciliationLinks.id)
    ));
  return rows.map(({ linkId: _linkId, ...row }) => row);
}

/**
 * O saldo declarado mais recente até a data, venha de onde vier.
 *
 * Duas origens: o `LEDGERBAL` que veio no arquivo e o número que alguém
 * digitou olhando o banco. A origem sobe junto porque a tela precisa dizer
 * qual é qual — "o banco disse" e "alguém digitou" não valem a mesma coisa
 * numa conferência.
 *
 * Empate na data vai para o manual: quem digitou depois de importar estava
 * corrigindo o que o arquivo trouxe.
 */
export async function getStatementBalance(userId: number, accountId: number, throughDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [doArquivo, doUsuario] = await Promise.all([
    db
      .select({
        balance: transactionImportBatches.statementBalance,
        asOf: transactionImportBatches.statementBalanceDate,
      })
      .from(transactionImportBatches)
      .where(and(
        eq(transactionImportBatches.userId, userId),
        eq(transactionImportBatches.accountId, accountId),
        isNotNull(transactionImportBatches.statementBalance),
        lte(transactionImportBatches.statementBalanceDate, throughDate)
      ))
      .orderBy(desc(transactionImportBatches.statementBalanceDate))
      .limit(1),
    db
      .select({ balance: statementBalances.balance, asOf: statementBalances.asOf })
      .from(statementBalances)
      .where(and(
        eq(statementBalances.userId, userId),
        eq(statementBalances.accountId, accountId),
        lte(statementBalances.asOf, throughDate)
      ))
      .orderBy(desc(statementBalances.asOf))
      .limit(1),
  ]);

  return pickDeclaredBalance(
    doArquivo[0]?.balance && doArquivo[0]?.asOf
      ? { balance: Number(doArquivo[0].balance), asOf: doArquivo[0].asOf, origin: "arquivo" }
      : null,
    doUsuario[0]
      ? { balance: Number(doUsuario[0].balance), asOf: doUsuario[0].asOf, origin: "manual" }
      : null
  );
}

/**
 * Grava o saldo informado à mão e deixa a passagem no histórico.
 *
 * Upsert por conta e data: informar de novo é corrigir, não empilhar. O
 * registro no histórico guarda o valor anterior — sem ele, um saldo que muda
 * é indistinguível de um saldo que sempre foi aquele.
 */
export async function saveStatementBalance(input: {
  userId: number;
  accountId: number;
  asOf: string;
  balance: string;
  accountName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    const [anterior] = await tx
      .select({ balance: statementBalances.balance })
      .from(statementBalances)
      .where(and(
        eq(statementBalances.userId, input.userId),
        eq(statementBalances.accountId, input.accountId),
        eq(statementBalances.asOf, input.asOf)
      ))
      .limit(1);

    await tx
      .insert(statementBalances)
      .values({
        userId: input.userId,
        accountId: input.accountId,
        asOf: input.asOf,
        balance: input.balance,
        informedBy: input.userId,
      })
      .onDuplicateKeyUpdate({ set: { balance: input.balance, informedBy: input.userId } });

    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      action: anterior ? "saldo_extrato_alterado" : "saldo_extrato_informado",
      previousStatus: anterior?.balance ?? "",
      newStatus: input.balance,
      detail: `${input.accountName} · saldo em ${input.asOf}`,
    });
  });
}

/**
 * Concilia uma movimentação com um lançamento, numa transação só.
 *
 * O vínculo, o novo status e a linha de histórico andam juntos porque, se um
 * deles falhar sozinho, sobra uma conciliação que ninguém consegue explicar
 * nem desfazer.
 */
export async function linkMovement(input: {
  userId: number;
  movementId: number;
  transactionId: number;
  amount: string;
  origin: "sugestao" | "manual" | "regra" | "importacao";
  previousStatus: string;
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.insert(reconciliationLinks).values({
      userId: input.userId,
      movementId: input.movementId,
      transactionId: input.transactionId,
      amount: input.amount,
      origin: input.origin,
      createdBy: input.userId,
    });
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: input.userId })
      .where(and(eq(bankMovements.userId, input.userId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      movementId: input.movementId,
      transactionId: input.transactionId,
      action: "conciliar",
      previousStatus: input.previousStatus,
      newStatus: "conciliado",
      detail: input.detail,
    });
  });
}

/**
 * Desfaz a conciliação: some o vínculo, a movimentação volta a ser decidida e
 * o histórico registra quem desfez. O lançamento não é apagado — ele continua
 * existindo no razão, só deixa de estar preso ao extrato.
 */
export async function unlinkMovement(input: {
  userId: number;
  movementId: number;
  previousStatus: string;
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.delete(reconciliationLinks)
      .where(and(eq(reconciliationLinks.userId, input.userId), eq(reconciliationLinks.movementId, input.movementId)));
    await tx.update(bankMovements)
      .set({ status: "sem_par", classification: null, reconciledAt: null, reconciledBy: null })
      .where(and(eq(bankMovements.userId, input.userId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      movementId: input.movementId,
      action: "desfazer",
      previousStatus: input.previousStatus,
      newStatus: "sem_par",
      detail: input.detail,
    });
  });
}

/**
 * Classifica a movimentação sem criar lançamento.
 *
 * A linha do extrato continua onde está: classificar não apaga nem esconde
 * nada, só diz o que aquele dinheiro foi. É o que substitui o antigo "ignorar".
 */
export async function classifyMovement(input: {
  userId: number;
  movementId: number;
  classification: "transferencia" | "pessoal" | "duplicidade" | "estorno" | "fora_dos_relatorios";
  note: string;
  relatedMovementId: number | null;
  previousStatus: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.update(bankMovements)
      .set({
        status: "classificado",
        classification: input.classification,
        classificationNote: input.note,
        relatedMovementId: input.relatedMovementId,
      })
      .where(and(eq(bankMovements.userId, input.userId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      movementId: input.movementId,
      action: "classificar",
      previousStatus: input.previousStatus,
      newStatus: `classificado:${input.classification}`,
      detail: input.note,
    });
  });
}

/**
 * Cria lançamentos a partir de uma movimentação e prende os dois.
 *
 * Uma parte só é "criar o lançamento que faltava"; várias partes é dividir a
 * movimentação. O mesmo caminho serve para os dois porque a diferença entre
 * eles é só quantas linhas entram no razão.
 */
export async function createTransactionsForMovement(input: {
  userId: number;
  movementId: number;
  previousStatus: string;
  detail: string;
  parts: Array<TransactionValues & { linkAmount: string }>;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    const criados: number[] = [];
    for (const part of input.parts) {
      const { linkAmount: _linkAmount, ...values } = part;
      const [inserted] = await tx.insert(financialTransactions).values({ userId: input.userId, ...values });
      criados.push(Number(inserted.insertId));
    }
    await tx.insert(reconciliationLinks).values(
      criados.map((transactionId, index) => ({
        userId: input.userId,
        movementId: input.movementId,
        transactionId,
        amount: input.parts[index].linkAmount,
        origin: "manual" as const,
        createdBy: input.userId,
      }))
    );
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: input.userId })
      .where(and(eq(bankMovements.userId, input.userId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      movementId: input.movementId,
      transactionId: criados[0] ?? null,
      action: input.parts.length > 1 ? "dividir" : "criar_lancamento",
      previousStatus: input.previousStatus,
      newStatus: "conciliado",
      detail: input.detail,
    });
  });
}

/** Prende várias movimentações a um lançamento só. */
export async function groupMovements(input: {
  userId: number;
  movementIds: number[];
  transactionId: number;
  amounts: string[];
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.insert(reconciliationLinks).values(
      input.movementIds.map((movementId, index) => ({
        userId: input.userId,
        movementId,
        transactionId: input.transactionId,
        amount: input.amounts[index],
        origin: "manual" as const,
        createdBy: input.userId,
      }))
    );
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: input.userId })
      .where(and(eq(bankMovements.userId, input.userId), inArray(bankMovements.id, input.movementIds)));
    for (const movementId of input.movementIds) {
      await tx.insert(reconciliationAudit).values({
        userId: input.userId,
        movementId,
        transactionId: input.transactionId,
        action: "agrupar",
        previousStatus: "sem_par",
        newStatus: "conciliado",
        detail: input.detail,
      });
    }
  });
}

export async function getReconciliationPeriod(userId: number, accountId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(reconciliationPeriods)
    .where(and(
      eq(reconciliationPeriods.userId, userId),
      eq(reconciliationPeriods.accountId, accountId),
      eq(reconciliationPeriods.year, year),
      eq(reconciliationPeriods.month, month)
    ))
    .limit(1);
  return rows[0];
}

/**
 * Os meses que estão fechados agora.
 *
 * Reabrir não apaga a linha, só carimba `reopenedAt` — o histórico do
 * fechamento precisa sobreviver à reabertura. Quem pergunta "posso escrever
 * aqui?" quer só os que continuam fechados.
 */
export async function listClosedReconciliationPeriods(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      accountId: reconciliationPeriods.accountId,
      year: reconciliationPeriods.year,
      month: reconciliationPeriods.month,
    })
    .from(reconciliationPeriods)
    .where(and(
      eq(reconciliationPeriods.userId, userId),
      isNull(reconciliationPeriods.reopenedAt)
    ));
}

export async function closeReconciliationPeriod(input: {
  userId: number;
  accountId: number;
  year: number;
  month: number;
  statementBalance: string;
  systemBalance: string;
  movementCount: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getReconciliationPeriod(input.userId, input.accountId, input.year, input.month);

  await db.transaction(async tx => {
    if (existing) {
      await tx.update(reconciliationPeriods)
        .set({
          statementBalance: input.statementBalance,
          systemBalance: input.systemBalance,
          movementCount: input.movementCount,
          closedAt: new Date(),
          closedBy: input.userId,
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: "",
        })
        .where(eq(reconciliationPeriods.id, existing.id));
    } else {
      await tx.insert(reconciliationPeriods).values({
        userId: input.userId,
        accountId: input.accountId,
        year: input.year,
        month: input.month,
        statementBalance: input.statementBalance,
        systemBalance: input.systemBalance,
        movementCount: input.movementCount,
        closedBy: input.userId,
      });
    }
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      action: "fechar_periodo",
      previousStatus: "aberto",
      newStatus: "fechado",
      detail: `${String(input.month).padStart(2, "0")}/${input.year} · ${input.movementCount} movimentações`,
    });
  });
}

export async function reopenReconciliationPeriod(input: {
  userId: number;
  periodId: number;
  reason: string;
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.update(reconciliationPeriods)
      .set({ reopenedAt: new Date(), reopenedBy: input.userId, reopenReason: input.reason })
      .where(and(eq(reconciliationPeriods.userId, input.userId), eq(reconciliationPeriods.id, input.periodId)));
    await tx.insert(reconciliationAudit).values({
      userId: input.userId,
      action: "reabrir_periodo",
      previousStatus: "fechado",
      newStatus: "aberto",
      detail: input.detail,
    });
  });
}

export async function listReconciliationAudit(userId: number, movementId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(reconciliationAudit)
    .where(and(eq(reconciliationAudit.userId, userId), eq(reconciliationAudit.movementId, movementId)))
    .orderBy(desc(reconciliationAudit.createdAt))
    .limit(50);
}

export async function createImportBatch(input: {
  id: string;
  userId: number;
  fileName: string;
  format: "csv" | "ofx";
  accountId: number;
  duplicateCount: number;
  statementBalance: { balance: number; asOf: string } | null;
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
      statementBalance: input.statementBalance ? input.statementBalance.balance.toFixed(2) : null,
      statementBalanceDate: input.statementBalance?.asOf ?? null,
    });

    for (const chunk of chunkImportRows(input.transactions)) {
      await tx.insert(financialTransactions).values(chunk.map(transaction => ({
          userId: input.userId,
          ...transaction,
          importBatchId: input.id,
        })));
    }

    /*
     * A mesma linha entra duas vezes de propósito: como lançamento no razão e
     * como movimentação do extrato. São os dois lados da conciliação — o que a
     * empresa registrou e o que o banco diz. Elas nascem já vinculadas porque
     * uma veio da outra; o que a tela de conciliação procura são os casos em
     * que só existe um dos lados.
     */
    for (const chunk of chunkImportRows(input.transactions)) {
      await tx.insert(bankMovements).values(chunk.map(transaction => ({
        userId: input.userId,
        accountId: input.accountId,
        movementDate: transaction.transactionDate,
        description: transaction.description,
        contact: transaction.contact ?? "",
        amount: transaction.amount,
        status: "conciliado" as const,
        importBatchId: input.id,
        externalId: transaction.externalId ?? null,
        fingerprint: transaction.fingerprint!,
        reconciledAt: new Date(),
      })));
    }

    // Os ids saem de leitura, não do insertId: o autoincrement do TiDB é
    // alocado por faixa e adivinhar a sequência de um insert em lote daria
    // vínculo trocado.
    const [ledger, statement] = await Promise.all([
      tx.select({ id: financialTransactions.id, fingerprint: financialTransactions.fingerprint })
        .from(financialTransactions)
        .where(and(eq(financialTransactions.userId, input.userId), eq(financialTransactions.importBatchId, input.id))),
      tx.select({ id: bankMovements.id, fingerprint: bankMovements.fingerprint })
        .from(bankMovements)
        .where(and(eq(bankMovements.userId, input.userId), eq(bankMovements.importBatchId, input.id))),
    ]);

    const transactionByFingerprint = new Map(ledger.map(row => [row.fingerprint, row.id]));
    const amountByFingerprint = new Map(input.transactions.map(row => [row.fingerprint, row.amount]));
    const links = statement
      .map(movement => {
        const transactionId = transactionByFingerprint.get(movement.fingerprint);
        if (!transactionId) return null;
        return {
          userId: input.userId,
          movementId: movement.id,
          transactionId,
          amount: amountByFingerprint.get(movement.fingerprint) ?? "0.00",
          origin: "importacao" as const,
        };
      })
      .filter((link): link is NonNullable<typeof link> => link !== null);

    for (const chunk of chunkImportRows(links)) {
      await tx.insert(reconciliationLinks).values(chunk);
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
