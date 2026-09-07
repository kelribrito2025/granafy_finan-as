import { boolean, date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Stable internal identifier used by both local and legacy OAuth accounts. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }).unique(),
  /** Scrypt hash only. Plain-text passwords are never persisted. */
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const passwordResetRequests = mysqlTable("passwordResetRequests", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  codeHash: varchar("codeHash", { length: 64 }).notNull(),
  attempts: int("attempts").default(0).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  consumedAt: timestamp("consumedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["entrada", "saida"]).notNull(),
  transactionDate: date("transactionDate", { mode: "string" }).notNull(),
  description: varchar("description", { length: 180 }).notNull(),
  contact: varchar("contact", { length: 120 }).default("").notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  account: varchar("account", { length: 80 }).notNull(),
  status: mysqlEnum("status", ["Pago", "Pendente"]).default("Pendente").notNull(),
  recurring: boolean("recurring").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("transactions_user_date_idx").on(table.userId, table.transactionDate),
  index("transactions_user_status_idx").on(table.userId, table.status),
]);

export type UserRecord = typeof users.$inferSelect;
export type User = Omit<UserRecord, "passwordHash">;
export type InsertUser = typeof users.$inferInsert;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;
export type TransactionRecord = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
