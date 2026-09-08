import { boolean, date, decimal, index, int, mysqlEnum, mysqlTable, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

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
  categoryDefaultsVersion: int("categoryDefaultsVersion").default(0).notNull(),
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

export const financialAccounts = mysqlTable("financialAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  institution: varchar("institution", { length: 100 }).default("").notNull(),
  accountType: mysqlEnum("accountType", ["corrente", "poupanca", "carteira", "cartao", "gateway", "outro"]).default("corrente").notNull(),
  color: varchar("color", { length: 7 }).default("#12B85C").notNull(),
  initialBalance: decimal("initialBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("financial_accounts_user_name_uidx").on(table.userId, table.name),
  index("financial_accounts_user_active_idx").on(table.userId, table.isActive),
]);

export const transactionCategories = mysqlTable("transactionCategories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["entrada", "saida", "ambos"]).default("ambos").notNull(),
  color: varchar("color", { length: 7 }).default("#4C6355").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("transaction_categories_user_name_uidx").on(table.userId, table.name),
  index("transaction_categories_user_active_idx").on(table.userId, table.isActive),
]);

export const costCenters = mysqlTable("costCenters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 7 }).default("#4C6355").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("cost_centers_user_name_uidx").on(table.userId, table.name),
  index("cost_centers_user_active_idx").on(table.userId, table.isActive),
]);

/**
 * Regras de classificação automática. Aplicadas quando o lançamento chega sem
 * categoria — na importação de OFX/CSV e no cadastro manual.
 */
/** Dados cadastrais da empresa. Uma linha por usuário. */
export const companyProfiles = mysqlTable("companyProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  legalName: varchar("legalName", { length: 180 }).default("").notNull(),
  tradeName: varchar("tradeName", { length: 180 }).default("").notNull(),
  taxId: varchar("taxId", { length: 20 }).default("").notNull(),
  stateRegistration: varchar("stateRegistration", { length: 30 }).default("").notNull(),
  taxRegime: mysqlEnum("taxRegime", ["simples", "presumido", "real", "mei", "outro"]).default("simples").notNull(),
  financeEmail: varchar("financeEmail", { length: 320 }).default("").notNull(),
  logoKey: varchar("logoKey", { length: 255 }),
  logoName: varchar("logoName", { length: 180 }),
  zipCode: varchar("zipCode", { length: 9 }).default("").notNull(),
  street: varchar("street", { length: 180 }).default("").notNull(),
  streetNumber: varchar("streetNumber", { length: 20 }).default("").notNull(),
  complement: varchar("complement", { length: 120 }).default("").notNull(),
  district: varchar("district", { length: 120 }).default("").notNull(),
  city: varchar("city", { length: 120 }).default("").notNull(),
  state: varchar("state", { length: 2 }).default("").notNull(),
  country: varchar("country", { length: 60 }).default("Brasil").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("company_profiles_user_uidx").on(table.userId),
]);

/**
 * Preferências de exibição. A moeda muda símbolo e formato do número, não
 * converte valor: converter o razão exigiria uma taxa e uma decisão contábil.
 */
export const userPreferences = mysqlTable("userPreferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /** Os mesmos períodos que a Visão geral oferece. */
  defaultPeriod: mysqlEnum("defaultPeriod", ["mes", "trimestre", "ano"]).default("mes").notNull(),
  currency: mysqlEnum("currency", ["BRL", "USD", "EUR"]).default("BRL").notNull(),
  timeZone: varchar("timeZone", { length: 60 }).default("America/Sao_Paulo").notNull(),
  dateFormat: mysqlEnum("dateFormat", ["dmy", "mdy", "iso"]).default("dmy").notNull(),
  /** Mês em que o exercício começa, 1-12. */
  fiscalYearStartMonth: int("fiscalYearStartMonth").default(1).notNull(),
  /** Como a barra lateral abre: inteira, só ícones ou recolhida que expande no hover. */
  sidebarMode: mysqlEnum("sidebarMode", ["expandido", "icones", "hover"]).default("expandido").notNull(),
  sidebarTooltips: boolean("sidebarTooltips").default(true).notNull(),
  sidebarBadges: boolean("sidebarBadges").default(true).notNull(),
  /** Quando ligado, recolher a barra na mão vira o estado da próxima visita. */
  sidebarRemember: boolean("sidebarRemember").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("user_preferences_user_uidx").on(table.userId),
]);

export const categoryRules = mysqlTable("categoryRules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  matchType: mysqlEnum("matchType", ["descricao", "contato", "conta"]).notNull(),
  matchValue: varchar("matchValue", { length: 180 }).notNull(),
  categoryId: int("categoryId"),
  category: varchar("category", { length: 120 }).default("").notNull(),
  costCenterId: int("costCenterId"),
  costCenter: varchar("costCenter", { length: 120 }).default("").notNull(),
  /** Menor number ganha. Empate resolve pelo id. */
  priority: int("priority").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("category_rules_user_priority_idx").on(table.userId, table.isActive, table.priority),
]);

export const transactionImportBatches = mysqlTable("transactionImportBatches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  format: mysqlEnum("format", ["csv", "ofx"]).notNull(),
  accountId: int("accountId").notNull(),
  importedCount: int("importedCount").default(0).notNull(),
  duplicateCount: int("duplicateCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("transaction_import_batches_user_date_idx").on(table.userId, table.createdAt),
]);

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["entrada", "saida", "transferencia"]).notNull(),
  transactionDate: date("transactionDate", { mode: "string" }).notNull(),
  description: varchar("description", { length: 180 }).notNull(),
  contact: varchar("contact", { length: 120 }).default("").notNull(),
  category: varchar("category", { length: 120 }).notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  account: varchar("account", { length: 80 }).notNull(),
  accountId: int("accountId"),
  categoryId: int("categoryId"),
  costCenter: varchar("costCenter", { length: 120 }).default("").notNull(),
  costCenterId: int("costCenterId"),
  status: mysqlEnum("status", ["Pago", "Pendente"]).default("Pendente").notNull(),
  recurring: boolean("recurring").default(false).notNull(),
  /** Quantos meses a recorrência cobre. Null quando `recurring` é falso. */
  recurringMonths: int("recurringMonths"),
  /**
   * Une as parcelas de uma mesma série recorrente. `recurrenceIndex` é a posição
   * dentro dela, de 1 até `recurringMonths`, e serve para mostrar "3/12" e para
   * atingir só as parcelas seguintes ao editar.
   */
  recurrenceGroupId: varchar("recurrenceGroupId", { length: 36 }),
  recurrenceIndex: int("recurrenceIndex"),
  /** Chave do anexo no storage. O nome original fica em `attachmentName`. */
  attachmentKey: varchar("attachmentKey", { length: 255 }),
  attachmentName: varchar("attachmentName", { length: 180 }),
  /**
   * Une as duas pernas de uma transferência: uma saída na conta de origem e uma
   * entrada na de destino, ambas com type "transferencia" e o mesmo grupo.
   * Manter duas linhas faz o saldo por conta continuar sendo a soma de `amount`,
   * sem nenhuma regra especial.
   */
  transferGroupId: varchar("transferGroupId", { length: 36 }),
  importBatchId: varchar("importBatchId", { length: 36 }),
  externalId: varchar("externalId", { length: 160 }),
  fingerprint: varchar("fingerprint", { length: 64 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("transactions_user_date_idx").on(table.userId, table.transactionDate),
  index("transactions_user_status_idx").on(table.userId, table.status),
  index("transactions_user_account_idx").on(table.userId, table.accountId),
  index("transactions_user_category_idx").on(table.userId, table.categoryId),
  index("transactions_user_cost_center_idx").on(table.userId, table.costCenterId),
  index("transactions_user_transfer_group_idx").on(table.userId, table.transferGroupId),
  index("transactions_user_recurrence_group_idx").on(table.userId, table.recurrenceGroupId),
  uniqueIndex("transactions_user_fingerprint_uidx").on(table.userId, table.fingerprint),
]);

/**
 * User-managed balance-sheet lines. Financial-account cash is calculated from
 * the existing ledger and is intentionally not duplicated here.
 */
export const patrimonialItems = mysqlTable("patrimonialItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  balanceGroup: mysqlEnum("balanceGroup", [
    "ativo_circulante",
    "ativo_nao_circulante",
    "passivo_circulante",
    "passivo_nao_circulante",
    "patrimonio_liquido",
  ]).notNull(),
  itemType: mysqlEnum("itemType", [
    "bem",
    "direito",
    "estoque",
    "investimento",
    "obrigacao",
    "capital",
    "ajuste",
    "outro",
  ]).default("outro").notNull(),
  acquisitionDate: date("acquisitionDate", { mode: "string" }),
  acquisitionValue: decimal("acquisitionValue", { precision: 15, scale: 2 }).default("0.00").notNull(),
  currentValue: decimal("currentValue", { precision: 15, scale: 2 }).notNull(),
  valuationMethod: mysqlEnum("valuationMethod", ["manual", "depreciacao_linear"]).default("manual").notNull(),
  /**
   * Taxonomia visível do imobilizado. `itemType` continua sendo a classificação
   * contábil e é derivada desta — ver assetItemType em shared/assetCategory.ts.
   */
  assetCategory: mysqlEnum("assetCategory", [
    "equipamento",
    "veiculo",
    "imovel",
    "software",
    "movel",
    "estoque",
    "investimento",
    "direito",
    "outro",
  ]),
  costCenter: varchar("costCenter", { length: 120 }).default("").notNull(),
  costCenterId: int("costCenterId"),
  /** De onde saiu o dinheiro. É só registro: não gera lançamento nem baixa saldo. */
  sourceAccount: varchar("sourceAccount", { length: 80 }).default("").notNull(),
  sourceAccountId: int("sourceAccountId"),
  attachmentKey: varchar("attachmentKey", { length: 255 }),
  attachmentName: varchar("attachmentName", { length: 180 }),
  usefulLifeMonths: int("usefulLifeMonths"),
  residualValue: decimal("residualValue", { precision: 15, scale: 2 }).default("0.00").notNull(),
  notes: text("notes"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("patrimonial_items_user_name_uidx").on(table.userId, table.name),
  index("patrimonial_items_user_group_idx").on(table.userId, table.balanceGroup),
  index("patrimonial_items_user_active_idx").on(table.userId, table.isActive),
]);

/** Immutable position captured on a reference date for the evolution chart. */
export const balanceSheetSnapshots = mysqlTable("balanceSheetSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  referenceDate: date("referenceDate", { mode: "string" }).notNull(),
  cashAndEquivalents: decimal("cashAndEquivalents", { precision: 15, scale: 2 }).default("0.00").notNull(),
  currentAssets: decimal("currentAssets", { precision: 15, scale: 2 }).default("0.00").notNull(),
  nonCurrentAssets: decimal("nonCurrentAssets", { precision: 15, scale: 2 }).default("0.00").notNull(),
  currentLiabilities: decimal("currentLiabilities", { precision: 15, scale: 2 }).default("0.00").notNull(),
  nonCurrentLiabilities: decimal("nonCurrentLiabilities", { precision: 15, scale: 2 }).default("0.00").notNull(),
  declaredEquity: decimal("declaredEquity", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalAssets: decimal("totalAssets", { precision: 15, scale: 2 }).default("0.00").notNull(),
  totalLiabilities: decimal("totalLiabilities", { precision: 15, scale: 2 }).default("0.00").notNull(),
  netWorth: decimal("netWorth", { precision: 15, scale: 2 }).default("0.00").notNull(),
  itemCount: int("itemCount").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("balance_sheet_snapshots_user_date_uidx").on(table.userId, table.referenceDate),
  index("balance_sheet_snapshots_user_created_idx").on(table.userId, table.createdAt),
]);

export type UserRecord = typeof users.$inferSelect;
export type User = Omit<UserRecord, "passwordHash" | "categoryDefaultsVersion">;
export type InsertUser = typeof users.$inferInsert;
export type PasswordResetRequest = typeof passwordResetRequests.$inferSelect;
export type FinancialAccountRecord = typeof financialAccounts.$inferSelect;
export type InsertFinancialAccount = typeof financialAccounts.$inferInsert;
export type TransactionCategoryRecord = typeof transactionCategories.$inferSelect;
export type InsertTransactionCategory = typeof transactionCategories.$inferInsert;
export type CostCenterRecord = typeof costCenters.$inferSelect;
export type InsertCostCenter = typeof costCenters.$inferInsert;
export type CompanyProfileRecord = typeof companyProfiles.$inferSelect;
export type InsertCompanyProfile = typeof companyProfiles.$inferInsert;
export type UserPreferencesRecord = typeof userPreferences.$inferSelect;
export type InsertUserPreferences = typeof userPreferences.$inferInsert;
export type CategoryRuleRecord = typeof categoryRules.$inferSelect;
export type InsertCategoryRule = typeof categoryRules.$inferInsert;
export type TransactionImportBatchRecord = typeof transactionImportBatches.$inferSelect;
export type TransactionRecord = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type PatrimonialItemRecord = typeof patrimonialItems.$inferSelect;
export type InsertPatrimonialItem = typeof patrimonialItems.$inferInsert;
export type BalanceSheetSnapshotRecord = typeof balanceSheetSnapshots.$inferSelect;
export type InsertBalanceSheetSnapshot = typeof balanceSheetSnapshots.$inferInsert;
