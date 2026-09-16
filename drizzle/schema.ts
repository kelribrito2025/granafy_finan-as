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
  /**
   * Quando a pessoa terminou — ou pulou — o primeiro acesso.
   *
   * Nula significa "ainda não passou por lá", não "precisa passar": o fluxo só
   * aparece se, além disto, a conta não tiver nenhuma conta financeira nem
   * nenhum lançamento. Sem essa segunda condição, todo mundo que já usa o
   * sistema veria o onboarding no login seguinte, porque a coluna nasce nula
   * para todos — e evitá-la custaria um UPDATE em massa que este ALTER não
   * precisa.
   *
   * "Configurar depois" também grava a data: pular é uma decisão, e ela vale
   * para sempre. Refazer os passos é por Configurações.
   */
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
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

/*
 * As tentativas de entrada que falharam, e só elas.
 *
 * Guarda o e-mail digitado — não o usuário —, porque contar também o e-mail
 * que não existe é o que impede o bloqueio de virar detector de conta. Não tem
 * coluna de IP de propósito: enquanto o limite por IP não valer, guardar
 * endereço seria acumular dado sem uso. Linha antiga é apagada a cada falha
 * nova, então a tabela não cresce.
 */
export const loginAttempts = mysqlTable("loginAttempts", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("login_attempts_email_created_idx").on(table.email, table.createdAt),
  // A limpeza varre por data, sem e-mail na frente, e precisa do índice próprio.
  index("login_attempts_created_idx").on(table.createdAt),
]);

export const financialAccounts = mysqlTable("financialAccounts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  institution: varchar("institution", { length: 100 }).default("").notNull(),
  accountType: mysqlEnum("accountType", ["corrente", "poupanca", "carteira", "cartao", "gateway", "outro"]).default("corrente").notNull(),
  color: varchar("color", { length: 7 }).default("#12B85C").notNull(),
  initialBalance: decimal("initialBalance", { precision: 15, scale: 2 }).default("0.00").notNull(),
  /**
   * A data a que o saldo inicial se refere.
   *
   * O saldo inicial é o ponto de partida somado a todo o extrato, e até aqui
   * era atemporal: funcionava enquanto o primeiro lançamento importado viesse
   * depois dele. Importar um arquivo que começa antes dessa data conta o mesmo
   * dinheiro duas vezes, e nada na tela denunciava — erro silencioso de saldo é
   * o que mais custou caro neste projeto.
   *
   * Nula nas contas que já existiam: elas seguem com o comportamento antigo, e
   * nenhuma linha precisou ser reescrita para a coluna entrar.
   */
  initialBalanceDate: date("initialBalanceDate", { mode: "string" }),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("financial_accounts_company_name_uidx").on(table.userId, table.companyId, table.name),
  index("financial_accounts_user_active_idx").on(table.userId, table.isActive),
  index("financial_accounts_company_idx").on(table.companyId),
]);

export const transactionCategories = mysqlTable("transactionCategories", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  type: mysqlEnum("type", ["entrada", "saida", "ambos"]).default("ambos").notNull(),
  color: varchar("color", { length: 7 }).default("#4C6355").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("transaction_categories_company_name_uidx").on(table.userId, table.companyId, table.name),
  index("transaction_categories_user_active_idx").on(table.userId, table.isActive),
  index("transaction_categories_company_idx").on(table.companyId),
]);

export const costCenters = mysqlTable("costCenters", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
  name: varchar("name", { length: 120 }).notNull(),
  color: varchar("color", { length: 7 }).default("#4C6355").notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("cost_centers_company_name_uidx").on(table.userId, table.companyId, table.name),
  index("cost_centers_user_active_idx").on(table.userId, table.isActive),
  index("cost_centers_company_idx").on(table.companyId),
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
  /*
   * A partir daqui esta tabela é a lista de empresas do login, não mais um
   * perfil único. Os dois campos abaixo são o que uma lista precisa e o
   * cadastro de empresa não tinha.
   *
   * O `company_profiles_user_uidx` CAIU na Fase 5, e com ele a proibição de um
   * login ter duas empresas — que é a fase inteira. O que entrou no lugar foi o
   * `saveCompanyProfile` deixar de ser um lê-depois-escreve: hoje ele é um
   * UPDATE só, com a chave completa `(userId, id)`, então não há corrida a
   * proteger nem alcance além de uma linha.
   */
  /** Arquivar em vez de excluir: empresa guarda razão contábil. */
  isActive: boolean("isActive").default(true).notNull(),
  /** A ordem escolhida na lista. Empate resolve pelo id. */
  sortOrder: int("sortOrder").default(0).notNull(),
  /*
   * FASE 7 — as duas colunas que faltavam para a empresa ser a unidade de
   * verdade. Ambas nasceram por ADD COLUMN, sem reescrever linha nenhuma.
   */
  /**
   * Quando alguém concluiu ou pulou as boas-vindas DESTA empresa.
   *
   * A Fase 6 decidiu isso por comparação de datas contra o `completedAt` do
   * login, para não pedir migration no meio da fase. O preço estava escrito em
   * `onboarding.ts`: concluir o fluxo numa empresa apagava a oferta em todas as
   * criadas antes daquele instante. Quem criasse três de uma vez perdia duas.
   *
   * Nula para as empresas que já existem, e a comparação de datas continua
   * valendo como resposta para elas — a coluna é a resposta de quem nasce
   * depois.
   */
  onboardingCompletedAt: timestamp("onboardingCompletedAt"),
  /**
   * A versão do catálogo de categorias-padrão que ESTA empresa já recebeu.
   *
   * Era só em `users`, e com isso o upgrade de catálogo entrava numa empresa
   * por login: `ensureDefaultTransactionCategories` pedia a empresa padrão e
   * carimbava a versão no usuário. Com duas empresas, a segunda ficava sem as
   * categorias novas para sempre, porque o login já constava atualizado.
   *
   * Nasce 0 de propósito, inclusive para empresa que já tem tudo. O upgrade é
   * idempotente — `transaction_categories_company_name_uidx` é (userId,
   * companyId, name) e a inserção resolve conflito sem tocar em `isActive` —
   * então a primeira passada por empresa antiga não insere nada e não
   * ressuscita categoria que alguém desativou. Começar em 0 é o que faz a
   * coluna consertar quem ficou atrás em vez de só registrar o presente.
   */
  categoryDefaultsVersion: int("categoryDefaultsVersion").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  index("company_profiles_user_order_idx").on(table.userId, table.sortOrder),
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
  /** E-mail diário com as contas a pagar atrasadas. Ligado por padrão: quem não quer, desliga. */
  alertaContasAtrasadas: boolean("alertaContasAtrasadas").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  uniqueIndex("user_preferences_user_uidx").on(table.userId),
]);

export const categoryRules = mysqlTable("categoryRules", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  index("category_rules_company_idx").on(table.companyId),
]);

export const transactionImportBatches = mysqlTable("transactionImportBatches", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  index("transaction_import_batches_company_idx").on(table.companyId),
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
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  uniqueIndex("bank_movements_company_fingerprint_uidx").on(table.userId, table.companyId, table.fingerprint),
  index("bank_movements_company_idx").on(table.companyId),
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
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  index("reconciliation_links_company_idx").on(table.companyId),
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
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  uniqueIndex("reconciliation_periods_company_uidx").on(table.userId, table.companyId, table.accountId, table.year, table.month),
  index("reconciliation_periods_company_idx").on(table.companyId),
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
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
  accountId: int("accountId").notNull(),
  /** A data a que o saldo se refere, não a data em que foi digitado. */
  asOf: date("asOf", { mode: "string" }).notNull(),
  balance: decimal("balance", { precision: 15, scale: 2 }).notNull(),
  informedBy: int("informedBy"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => [
  // Um saldo por conta e por data: informar de novo corrige, não empilha.
  uniqueIndex("statement_balances_company_date_uidx").on(table.userId, table.companyId, table.accountId, table.asOf),
  index("statement_balances_user_account_idx").on(table.userId, table.accountId),
  index("statement_balances_company_idx").on(table.companyId),
]);

export const reconciliationAudit = mysqlTable("reconciliationAudit", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  index("reconciliation_audit_company_idx").on(table.companyId),
]);

export const transactions = mysqlTable("transactions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  /**
   * Quando o dinheiro se moveu de verdade.
   *
   * `transactionDate` é o vencimento; esta é a liquidação. As duas coincidem na
   * maioria das linhas — extrato bancário é dinheiro que já se moveu —, mas um
   * título vencido em agosto e pago em setembro pertence a setembro no caixa e a
   * agosto na competência, e sem esta coluna não havia como dizer isso.
   *
   * Nula enquanto o título está pendente. Ao marcar como pago, recebe o dia de
   * hoje no fuso do usuário, e a tela de edição permite corrigir.
   */
  settledAt: date("settledAt", { mode: "string" }),
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
  // A tela de liquidadas filtra por usuário, status e mês de liquidação, nesta
  // ordem — o índice acompanha a consulta para ela não varrer o razão.
  index("transactions_user_settled_idx").on(table.userId, table.status, table.settledAt),
  index("transactions_user_account_idx").on(table.userId, table.accountId),
  index("transactions_user_category_idx").on(table.userId, table.categoryId),
  index("transactions_user_cost_center_idx").on(table.userId, table.costCenterId),
  index("transactions_user_transfer_group_idx").on(table.userId, table.transferGroupId),
  index("transactions_user_recurrence_group_idx").on(table.userId, table.recurrenceGroupId),
  uniqueIndex("transactions_company_fingerprint_uidx").on(table.userId, table.companyId, table.fingerprint),
  index("transactions_company_idx").on(table.companyId),
]);

/**
 * User-managed balance-sheet lines. Financial-account cash is calculated from
 * the existing ledger and is intentionally not duplicated here.
 */
export const patrimonialItems = mysqlTable("patrimonialItems", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  uniqueIndex("patrimonial_items_company_name_uidx").on(table.userId, table.companyId, table.name),
  index("patrimonial_items_user_group_idx").on(table.userId, table.balanceGroup),
  index("patrimonial_items_user_active_idx").on(table.userId, table.isActive),
  index("patrimonial_items_company_idx").on(table.companyId),
]);

/** Immutable position captured on a reference date for the evolution chart. */
export const balanceSheetSnapshots = mysqlTable("balanceSheetSnapshots", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  /*
   * A empresa dona da linha. NOT NULL desde a Fase 5: a coluna nasceu anulável
   * para o backfill poder preenchê-la sem parar o app, e apertou quando toda
   * inserção passou a carimbá-la. Uma linha sem empresa não é mais um estado
   * possível.
   *
   * O `userId` fica. As duas guardas juntas são o que faz o pior caso ser "vi
   * a minha empresa errada" em vez de "vi a empresa de outro".
   */
  companyId: int("companyId").notNull(),
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
  uniqueIndex("balance_sheet_snapshots_company_date_uidx").on(table.userId, table.companyId, table.referenceDate),
  index("balance_sheet_snapshots_user_created_idx").on(table.userId, table.createdAt),
  index("balance_sheet_snapshots_company_idx").on(table.companyId),
]);

/*
 * A configuração do sistema inteiro. Chave e valor, uma linha por decisão.
 *
 * É a única tabela daqui SEM `userId` e SEM `companyId`, e isso é o ponto: o
 * que mora nela não é de ninguém em particular. O interruptor de Assinaturas
 * vivia no `localStorage` do navegador do admin e por isso não chegava ao
 * cliente — nenhum outro navegador podia lê-lo. Aqui ele chega.
 *
 * Chave/valor, e não uma coluna por decisão, porque a próxima configuração não
 * deve custar migração. O preço é o valor ser texto; a conversão fica em
 * `shared/sistema.ts`, num lugar só e com teste.
 *
 * `updatedByUserId` é carimbo, não chave estrangeira: se o admin que desligou
 * for excluído depois, a decisão dele continua valendo e a linha não pode cair
 * junto.
 */
export const systemSettings = mysqlTable("systemSettings", {
  settingKey: varchar("settingKey", { length: 64 }).primaryKey(),
  settingValue: varchar("settingValue", { length: 255 }).notNull(),
  updatedByUserId: int("updatedByUserId"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

/*
 * O vínculo do contador com uma empresa — quem PERGUNTA, separado de quem é
 * DONO do dado.
 *
 * Até aqui os dois eram o mesmo número: o usuário logado era o dono da empresa
 * aberta. O contador é o primeiro caso em que não são. Esta tabela diz a quem
 * mais uma empresa está liberada; a propriedade continua em
 * `companyProfiles.userId` e NÃO vira linha aqui — o dono nunca pode perder
 * acesso porque alguém apagou um vínculo.
 *
 * `userId` é o ATOR (quem recebe o acesso), uma linha por empresa liberada: é o
 * que permite ao dono liberar duas das suas quatro. Revogar é carimbar
 * `revokedAt`, não apagar — o histórico fica, e toda leitura filtra
 * `revokedAt IS NULL`. Por isso o par (userId, companyId) NÃO é único: um
 * vínculo revogado e um novo para a mesma dupla precisam coexistir.
 *
 * `role` é o papel NA EMPRESA e mora aqui de propósito, não em `users.role`:
 * aquela coluna é global (user | admin) e `adminProcedure` ignora empresa por
 * desenho — um contador que caísse lá veria o sistema inteiro.
 */
export const companyAccess = mysqlTable("companyAccess", {
  id: int("id").autoincrement().primaryKey(),
  /** O ator: quem recebe o acesso. Nunca o dono. */
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  role: mysqlEnum("role", ["contador"]).default("contador").notNull(),
  /** Quem liberou — o dono, para o registro fazer sentido. */
  grantedBy: int("grantedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  revokedAt: timestamp("revokedAt"),
}, table => [
  // A consulta que decide o que o ator vê: por ator, só vínculos vivos.
  index("company_access_user_revoked_idx").on(table.userId, table.revokedAt),
  // A lista que o dono vê em Acessos: quem tem vínculo com esta empresa.
  index("company_access_company_idx").on(table.companyId),
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
export type SystemSettingRecord = typeof systemSettings.$inferSelect;
export type InsertSystemSetting = typeof systemSettings.$inferInsert;
/**
 * O convite que vira vínculo — Fase C do acesso do contador.
 *
 * Uma linha por (convite, empresa), e não uma linha com a lista de empresas:
 * um convite libera "as empresas A e C", e a forma relacional disso é duas
 * linhas com o mesmo `lote`. JSON daria uma linha só, mas MariaDB devolve JSON
 * como texto e TiDB como objeto — o arreio e a produção leriam coisas
 * diferentes da mesma coluna, e essa é a divergência que a suíte existe para
 * não ter.
 *
 * `tokenHash`, nunca o token: é o mesmo desenho do código de redefinição. O
 * token viaja no e-mail uma vez e não é guardado. Reenviar carimba `revokedAt`
 * nas linhas anteriores e cria um lote novo, então nunca há dois convites
 * vivos para o mesmo par (dono, e-mail).
 *
 * Aceitar carimba `acceptedAt` e grava `companyAccess`. O convite continua na
 * tabela como histórico — quem convidou quem, quando — que é o que a Fase E
 * vai querer ler.
 */
export const companyInvites = mysqlTable("companyInvites", {
  id: int("id").autoincrement().primaryKey(),
  /** O agrupador: as linhas de um convite compartilham o mesmo lote. */
  lote: varchar("lote", { length: 36 }).notNull(),
  /** O e-mail convidado, normalizado. O aceite só vale para uma conta com ele. */
  email: varchar("email", { length: 320 }).notNull(),
  companyId: int("companyId").notNull(),
  role: mysqlEnum("role", ["contador"]).default("contador").notNull(),
  /** O dono que convidou — e o único que pode cancelar ou reenviar. */
  invitedBy: int("invitedBy").notNull(),
  tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  acceptedAt: timestamp("acceptedAt"),
  revokedAt: timestamp("revokedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("company_invites_token_idx").on(table.tokenHash),
  index("company_invites_inviter_idx").on(table.invitedBy, table.revokedAt),
  index("company_invites_lote_idx").on(table.lote),
]);

/**
 * O registro de acesso — Fase E do acesso do contador.
 *
 * Uma linha por evento que PASSA PELO SERVIDOR: entrar, trocar de empresa. É
 * o que dá para registrar com honestidade. A exportação de CSV é montada no
 * navegador, então a linha dela é o que a tela DECLAROU ter feito — quem
 * chamar a API direto lê o mesmo dado sem registrar. A tela do dono diz essa
 * diferença, senão promete uma auditoria que não tem.
 *
 * `userId` aqui é o ATOR (quem fez), não o dono do dado: é a única tabela do
 * schema em que a coluna tem esse sentido, e por isso o registro nunca entra
 * em consulta de escopo.
 */
export const accessLog = mysqlTable("accessLog", {
  id: int("id").autoincrement().primaryKey(),
  /** Quem fez. */
  userId: int("userId").notNull(),
  /** Em qual empresa. */
  companyId: int("companyId").notNull(),
  event: mysqlEnum("event", ["entrada", "troca", "exportacao"]).notNull(),
  /** O que foi exportado, quando o evento é exportação. */
  detail: varchar("detail", { length: 120 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  index("access_log_company_created_idx").on(table.companyId, table.createdAt),
  index("access_log_user_idx").on(table.userId),
]);

/**
 * O que já foi enviado de alerta — um por (login, empresa, tipo, dia).
 *
 * O agendador roda a cada quinze minutos e o servidor pode reiniciar no meio
 * do dia; sem esta tabela, cada rodada depois das 8h mandaria o e-mail de
 * novo. O único composto é a trava: a segunda tentativa do mesmo dia falha
 * no INSERT, e falhar aí é o comportamento desejado.
 */
export const alertDispatches = mysqlTable("alertDispatches", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  companyId: int("companyId").notNull(),
  kind: mysqlEnum("kind", ["contas_atrasadas"]).notNull(),
  /** O dia NO FUSO da pessoa, não o do servidor. */
  sentOn: date("sentOn", { mode: "string" }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => [
  uniqueIndex("alert_dispatches_uidx").on(table.userId, table.companyId, table.kind, table.sentOn),
]);

export type CompanyAccessRecord = typeof companyAccess.$inferSelect;
export type InsertCompanyAccess = typeof companyAccess.$inferInsert;
export type CompanyInviteRecord = typeof companyInvites.$inferSelect;
export type InsertCompanyInvite = typeof companyInvites.$inferInsert;
export type AccessLogRecord = typeof accessLog.$inferSelect;
export type InsertAccessLog = typeof accessLog.$inferInsert;
export type AlertDispatchRecord = typeof alertDispatches.$inferSelect;
export type InsertAlertDispatch = typeof alertDispatches.$inferInsert;
