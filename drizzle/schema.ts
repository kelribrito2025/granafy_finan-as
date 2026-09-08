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
  /**
   * Se a regra concilia sozinha ou só sugere.
   *
   * O padrão é sugerir: conciliação automática que ninguém pediu é lançamento
   * entrando no razão sem decisão humana, e desfazer depois custa mais do que
   * confirmar antes.
   */
  autoReconcile: boolean("autoReconcile").default(false).notNull(),
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
  /**
   * O saldo que o próprio banco declara no arquivo (`LEDGERBAL`) e a data a que
   * ele se refere. É o outro lado da conciliação: sem esse número, "diferença
   * entre o banco e o GranaFy" não tem contra o que ser calculada.
   */
  statementBalance: decimal("statementBalance", { precision: 15, scale: 2 }),
  statementBalanceDate: date("statementBalanceDate", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("transaction_import_batches_user_date_idx").on(table.userId, table.createdAt),
]);

/**
 * A linha do extrato como o banco mandou.
 *
 * Existe separada de `transactions` porque conciliar é comparar dois lados: o
 * que o banco diz e o que a empresa registrou. Enquanto a importação gravava
 * direto no razão, os dois lados eram a mesma linha e a diferença era sempre
 * zero por construção.
 *
 * Nada aqui é editável pelo usuário — o extrato é o que é. O que ele decide
 * fica em `status`, `classification` e nos vínculos.
 */
export const bankMovements = mysqlTable("bankMovements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  movementDate: date("movementDate", { mode: "string" }).notNull(),
  description: varchar("description", { length: 255 }).notNull(),
  contact: varchar("contact", { length: 120 }).default("").notNull(),
  /** Assinado, como no razão: entrada positiva, saída negativa. */
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["sem_par", "sugerido", "conciliado", "classificado"]).default("sem_par").notNull(),
  /**
   * O que o usuário respondeu quando a movimentação não vira lançamento.
   * Substitui o antigo "ignorar": a linha continua no extrato em todos os casos.
   */
  classification: mysqlEnum("classification", [
    "transferencia",
    "pessoal",
    "duplicidade",
    "estorno",
    "fora_dos_relatorios",
  ]),
  classificationNote: varchar("classificationNote", { length: 500 }).default("").notNull(),
  /** Em duplicidade e estorno, aponta para a movimentação original. */
  relatedMovementId: int("relatedMovementId"),
  importBatchId: varchar("importBatchId", { length: 36 }),
  externalId: varchar("externalId", { length: 160 }),
  /** Mesma identidade do razão, para a importação não duplicar a movimentação. */
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  reconciledAt: timestamp("reconciledAt"),
  reconciledBy: int("reconciledBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("bank_movements_user_account_date_idx").on(table.userId, table.accountId, table.movementDate),
  index("bank_movements_user_status_idx").on(table.userId, table.status),
  index("bank_movements_user_batch_idx").on(table.userId, table.importBatchId),
  uniqueIndex("bank_movements_user_fingerprint_uidx").on(table.userId, table.fingerprint),
]);

/**
 * O vínculo entre extrato e razão.
 *
 * É N:N de propósito: uma movimentação dividida entre vários lançamentos e
 * vários movimentos agrupados num lançamento só são as duas ações que o
 * modelo precisa suportar, e nenhuma das duas cabe numa coluna de chave
 * estrangeira. `amount` guarda quanto daquele movimento foi para aquele
 * lançamento, que é o que fecha a divisão.
 */
export const reconciliationLinks = mysqlTable("reconciliationLinks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  movementId: int("movementId").notNull(),
  transactionId: int("transactionId").notNull(),
  amount: decimal("amount", { precision: 15, scale: 2 }).notNull(),
  /** Como o vínculo nasceu: sugestão aceita, escolha manual, regra ou backfill. */
  origin: mysqlEnum("origin", ["sugestao", "manual", "regra", "importacao"]).default("manual").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  createdBy: int("createdBy"),
}, table => [
  index("reconciliation_links_user_movement_idx").on(table.userId, table.movementId),
  index("reconciliation_links_user_transaction_idx").on(table.userId, table.transactionId),
  uniqueIndex("reconciliation_links_pair_uidx").on(table.movementId, table.transactionId),
]);

/**
 * O histórico. Toda ação de conciliação passa por aqui antes de o usuário poder
 * perguntar "quem foi que mexeu nisso".
 */
/**
 * O fechamento de um mês por conta.
 *
 * Só pode fechar com diferença zero, e os saldos ficam gravados na linha: o
 * fechamento é uma fotografia do que era verdade naquele dia, não uma consulta
 * que muda toda vez que alguém edita um lançamento antigo.
 */
export const reconciliationPeriods = mysqlTable("reconciliationPeriods", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  year: int("year").notNull(),
  month: int("month").notNull(),
  statementBalance: decimal("statementBalance", { precision: 15, scale: 2 }).notNull(),
  systemBalance: decimal("systemBalance", { precision: 15, scale: 2 }).notNull(),
  movementCount: int("movementCount").default(0).notNull(),
  closedAt: timestamp("closedAt").defaultNow().notNull(),
  closedBy: int("closedBy"),
  reopenedAt: timestamp("reopenedAt"),
  reopenedBy: int("reopenedBy"),
  reopenReason: varchar("reopenReason", { length: 500 }).default("").notNull(),
}, table => [
  uniqueIndex("reconciliation_periods_uidx").on(table.userId, table.accountId, table.year, table.month),
]);

/**
 * O saldo que o dono da conta informou à mão.
 *
 * O saldo declarado pelo extrato mora no lote de importação, onde ele
 * chegou. Este aqui é o outro caminho: CSV não declara saldo, nem todo OFX
 * traz `LEDGERBAL`, e sem esse número a conciliação do mês não tem contra o
 * que calcular a diferença — ela nasce cega.
 *
 * Tabela separada de propósito. Guardar o informado junto do importado
 * apagaria a diferença entre "o banco disse" e "alguém digitou", que é
 * justamente o que precisa ficar visível na tela.
 */
export const statementBalances = mysqlTable("statementBalances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  accountId: int("accountId").notNull(),
  /** A data a que o saldo se refere, não a data em que foi digitado. */
  asOf: date("asOf", { mode: "string" }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  informedBy: int("informedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  // Um saldo por conta e por data: informar de novo corrige, não empilha.
  uniqueIndex("statement_balances_account_date_uidx").on(table.userId, table.accountId, table.asOf),
  index("statement_balances_user_account_idx").on(table.userId, table.accountId),
]);

export const reconciliationAudit = mysqlTable("reconciliationAudit", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  movementId: int("movementId"),
  transactionId: int("transactionId"),
  action: varchar("action", { length: 40 }).notNull(),
  previousStatus: varchar("previousStatus", { length: 40 }).default("").notNull(),
  newStatus: varchar("newStatus", { length: 40 }).default("").notNull(),
  /** Regra que motivou a ação, quando houve uma. */
  ruleId: int("ruleId"),
  detail: varchar("detail", { length: 500 }).default("").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("reconciliation_audit_user_date_idx").on(table.userId, table.createdAt),
  index("reconciliation_audit_user_movement_idx").on(table.userId, table.movementId),
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
export type BankMovementRecord = typeof bankMovements.$inferSelect;
export type InsertBankMovement = typeof bankMovements.$inferInsert;
export type ReconciliationLinkRecord = typeof reconciliationLinks.$inferSelect;
export type InsertReconciliationLink = typeof reconciliationLinks.$inferInsert;
export type InsertReconciliationAudit = typeof reconciliationAudit.$inferInsert;
export type ReconciliationPeriodRecord = typeof reconciliationPeriods.$inferSelect;
export type TransactionRecord = typeof transactions.$inferSelect;
export type InsertTransaction = typeof transactions.$inferInsert;
export type PatrimonialItemRecord = typeof patrimonialItems.$inferSelect;
export type InsertPatrimonialItem = typeof patrimonialItems.$inferInsert;
export type BalanceSheetSnapshotRecord = typeof balanceSheetSnapshots.$inferSelect;
export type InsertBalanceSheetSnapshot = typeof balanceSheetSnapshots.$inferInsert;
