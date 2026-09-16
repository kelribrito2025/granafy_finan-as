import { and, asc, desc, eq, gt, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2";
import { randomUUID } from "node:crypto";
import {
  balanceSheetSnapshots,
  categoryRules,
  companyAccess,
  companyInvites,
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
  loginAttempts,
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
import { roundCurrency } from "@shared/currency";
import type { Escopo } from "./escopo";
import { pickDeclaredBalance } from "./statementBalance";
import { chunkImportRows } from "./importers";

let _db: ReturnType<typeof drizzle> | null = null;

/*
 * O desvio de teste vive separado do de produção, e não por elegância.
 *
 * Quando os dois compartilhavam a mesma variável, cada arreio que terminava
 * deixava DOIS pools para trás: o de teste, que ninguém fechava, e o de
 * produção, que era recriado do zero na chamada seguinte. Com
 * `connectionLimit: 10`, `keepAlive` e meia hora de ocioso, as conexões
 * ficavam abertas e se somavam a cada arquivo de arreio — até o TiDB parar de
 * aceitar e os testes começarem a estourar por tempo, sem nunca falhar por
 * asserção. Medido: uma conexão a mais por ciclo, monotônico.
 */
let _dbTeste: ReturnType<typeof drizzle> | null = null;
let _poolTeste: mysql.Pool | null = null;

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

  return { db: drizzle(pool), pool };
}

/*
 * O desvio para o banco de teste.
 *
 * As guardas de isolamento moram nas consultas deste arquivo, e provar uma
 * guarda exige rodar a consulta de verdade. Sem este desvio, o arreio teria de
 * reescrever a consulta — e um teste que reescreve o que testa não testa nada.
 *
 * A trava é a mesma do arreio, importada dele: o alvo precisa terminar em
 * `_test`, não pode ser o schema de produção e não pode usar a credencial de
 * produção. Não há caminho que aponte esta função para produção sem passar por
 * `conferirAlvoDeTeste`, que lança em vez de conectar.
 */
export async function usarBancoDeTesteEm(url: string) {
  const { conferirAlvoDeTeste, escutarPoolDeTeste } = await import("./testDatabase");
  conferirAlvoDeTeste(url, process.env.TIDB_DATABASE_URL);
  await esquecerBancoDeTeste();
  const { db, pool } = createTiDbClient(url);
  escutarPoolDeTeste(pool);
  _dbTeste = db;
  _poolTeste = pool;
  return _dbTeste;
}

/**
 * Devolve o `getDb` ao normal e FECHA o pool de teste.
 *
 * O `end()` é o ponto todo: sem ele a referência some e as conexões ficam. É
 * `await`-ável de propósito — um `afterAll` que não espera o fechamento
 * devolve o mesmo vazamento por outro caminho.
 */
export async function esquecerBancoDeTeste() {
  _dbTeste = null;
  const pool = _poolTeste;
  _poolTeste = null;
  if (pool) await pool.end();
}

export async function getDb() {
  // O desvio de teste tem precedência, e o de produção nunca é descartado.
  if (_dbTeste) return _dbTeste;
  if (_db) return _db;

  const tiDbUrl = process.env.TIDB_DATABASE_URL;
  const defaultUrl = process.env.DATABASE_URL;

  try {
    _db = tiDbUrl
      ? createTiDbClient(tiDbUrl).db
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

type Conexao = NonNullable<Awaited<ReturnType<typeof getDb>>>;
/** Serve para o `db` solto e para uma transação: os dois têm select e insert. */
type ComEscrita = Pick<Conexao, "select" | "insert">;

/**
 * Toda conta tem pelo menos uma empresa, desde o instante do cadastro.
 *
 * O cadastro insere 50 categorias-padrão na mesma transação, antes de existir
 * qualquer empresa — e foi assim que dois logins "vazios" apareceram com 50
 * linhas cada. Sem esta função, cada conta nova nasceria com 50 linhas de
 * `companyId` nulo, e a última fase nunca conseguiria pôr a coluna em NOT NULL.
 *
 * A empresa nasce com os campos vazios: o rótulo da tela sai de
 * `companyDisplayName`, e razão social inventada não entra no banco.
 */
async function garantirEmpresaPadrao(tx: ComEscrita, userId: number): Promise<number> {
  const [existente] = await tx
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId))
    .orderBy(asc(companyProfiles.sortOrder), asc(companyProfiles.id))
    .limit(1);
  if (existente) return existente.id;

  /* Nasce na versão corrente porque quem a cria insere o catálogo inteiro em seguida. */
  const criada = await tx.insert(companyProfiles).values({ userId, categoryDefaultsVersion: DEFAULT_CATEGORY_CATALOG_VERSION });
  return Number(criada[0].insertId);
}

/**
 * A empresa padrão, garantida fora de transação.
 *
 * Chamada no login. Antes disso, a única coisa que criava empresa era o
 * cadastro — então um login que por qualquer motivo ficasse sem empresa não
 * tinha como voltar sozinho, e a mensagem de erro não teria caminho nenhum a
 * apontar. Com isto, "saia e entre de novo" vira conselho verdadeiro.
 *
 * Custa uma consulta que sai em paralelo com as outras três do login.
 */
export async function ensureDefaultCompany(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return garantirEmpresaPadrao(db, userId);
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
    // A empresa vem antes das categorias: elas já nascem carimbadas.
    const companyId = await garantirEmpresaPadrao(tx, userId);
    await tx.insert(transactionCategories).values(defaultCategoryValues(userId, companyId));
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

/**
 * O catálogo de categorias-padrão, garantido EM CADA EMPRESA do login.
 *
 * Era por login, e isso era um furo com prazo: a versão morava em `users`, a
 * função pedia a empresa padrão e carimbava o login. Com duas empresas, a
 * primeira recebia as categorias novas, o login passava a constar atualizado, e
 * a segunda ficava sem elas PARA SEMPRE — sem erro, sem aviso, e só se descobre
 * na hora de escolher categoria num lançamento.
 *
 * Agora a versão mora em `companyProfiles.categoryDefaultsVersion` e cada
 * empresa é decidida por si. Uma transação por empresa, e não uma para todas:
 * se a terceira falhar, as duas primeiras já estão prontas e a próxima chamada
 * retoma da terceira. O contrário — tudo ou nada — só transformaria uma falha
 * em nenhuma empresa atualizada.
 *
 * `users.categoryDefaultsVersion` fica de pé e sem escritor, como a outra coluna
 * legada. Ninguém lê mais.
 */
export async function ensureDefaultTransactionCategories(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const empresas = await db
    .select({ id: companyProfiles.id, versao: companyProfiles.categoryDefaultsVersion })
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId));

  const atrasadas = empresas.filter(empresa => empresa.versao < DEFAULT_CATEGORY_CATALOG_VERSION);
  if (atrasadas.length === 0) {
    return { applied: false, empresas: 0, version: DEFAULT_CATEGORY_CATALOG_VERSION };
  }

  for (const empresa of atrasadas) {
    await db.transaction(async tx => {
      const upgradeValues = defaultCategoryUpgradeValues(userId, empresa.id, empresa.versao);
      if (upgradeValues.length > 0) {
        /*
         * `onDuplicateKeyUpdate` contra `transaction_categories_company_name_uidx`,
         * que é (userId, companyId, name): a categoria que já existe não é
         * tocada — em especial o `isActive` dela, para não ressuscitar o que
         * alguém desativou de propósito. É o que faz a versão nascer em 0 nas
         * empresas antigas ser seguro em vez de destrutivo.
         */
        await tx
          .insert(transactionCategories)
          .values(upgradeValues)
          .onDuplicateKeyUpdate({ set: { userId } });
      }
      await tx
        .update(companyProfiles)
        .set({ categoryDefaultsVersion: DEFAULT_CATEGORY_CATALOG_VERSION })
        .where(and(eq(companyProfiles.userId, userId), eq(companyProfiles.id, empresa.id)));
    });
  }

  return { applied: true, empresas: atrasadas.length, version: DEFAULT_CATEGORY_CATALOG_VERSION };
}

/** As datas das falhas de entrada desse e-mail dentro da janela. */
export async function listRecentLoginFailures(email: string, since: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const linhas = await db
    .select({ createdAt: loginAttempts.createdAt })
    .from(loginAttempts)
    .where(and(eq(loginAttempts.email, email), gt(loginAttempts.createdAt, since)));
  return linhas.map(linha => linha.createdAt);
}

/**
 * Registra a falha e limpa o que já não conta mais.
 *
 * A limpeza mora aqui porque é o único momento em que a tabela cresce. Sem ela
 * a tabela guardaria toda tentativa errada desde sempre, que é justamente o
 * tipo de dado que não deve ficar.
 */
export async function recordLoginFailure(email: string, since: Date) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.insert(loginAttempts).values({ email });
  await db.delete(loginAttempts).where(lt(loginAttempts.createdAt, since));
}

/** Entrou: as falhas anteriores desse e-mail deixam de pesar. */
export async function clearLoginFailures(email: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.delete(loginAttempts).where(eq(loginAttempts.email, email));
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
  "type" | "transactionDate" | "settledAt" | "description" | "contact" | "category" | "amount" | "account" | "status" | "recurring" |
  "accountId" | "categoryId" | "importBatchId" | "externalId" | "fingerprint" |
  "costCenter" | "costCenterId" | "recurringMonths" | "attachmentKey" | "attachmentName" | "transferGroupId" |
  "recurrenceGroupId" | "recurrenceIndex"
>;

export async function listTransactionsByPeriod(escopo: Escopo, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      gte(financialTransactions.transactionDate, startDate),
      lt(financialTransactions.transactionDate, endDate)
    ))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function listTransactionsBefore(escopo: Escopo, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), lt(financialTransactions.transactionDate, endDate)))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function listAllTransactions(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId)))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

export async function getTransactionById(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const rows = await db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.id, id)))
    .limit(1);
  return rows[0];
}

export async function getTransactionsByIds(escopo: Escopo, ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const chunks = chunkTransactionIds(ids);
  const records: TransactionRecord[] = [];
  for (const chunk of chunks) {
    records.push(...await db
      .select()
      .from(financialTransactions)
      .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), inArray(financialTransactions.id, chunk))));
  }
  return records;
}

export async function createTransaction(escopo: Escopo, values: TransactionValues) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const result = await db.insert(financialTransactions).values({ userId: escopo.userId, companyId: escopo.companyId, ...values });
  return getTransactionById(escopo, Number(result[0].insertId));
}

export async function updateTransaction(escopo: Escopo, id: number, values: TransactionValues) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db
    .update(financialTransactions)
    .set(values)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.id, id)));
  return getTransactionById(escopo, id);
}

export async function deleteTransaction(escopo: Escopo, id: number) {
  return deleteTransactions(escopo, [id]);
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
  escopo: Escopo,
  ids: number[],
  values: Partial<Pick<InsertTransaction, "transactionDate" | "settledAt" | "category" | "categoryId" | "account" | "accountId" | "status" | "recurring">>,
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
        .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), inArray(financialTransactions.id, chunk)));
      updatedCount += Number(result[0].affectedRows ?? 0);
    }
    return updatedCount;
  });
}

export async function deleteTransactions(escopo: Escopo, ids: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const chunks = chunkTransactionIds(ids);
  if (chunks.length === 0) return 0;

  return db.transaction(async tx => {
    /*
     * Primeiro reduzimos a entrada aos lançamentos que realmente pertencem ao
     * escopo. Sem isto, um id de outra empresa poderia alcançar um vínculo
     * corrompido antes de o DELETE do razão (que já era protegido) ignorá-lo.
     */
    const ownedIds: number[] = [];
    for (const chunk of chunks) {
      const rows = await tx
        .select({ id: financialTransactions.id })
        .from(financialTransactions)
        .where(and(
          eq(financialTransactions.userId, escopo.userId),
          eq(financialTransactions.companyId, escopo.companyId),
          inArray(financialTransactions.id, chunk),
        ));
      ownedIds.push(...rows.map(row => row.id));
    }
    if (ownedIds.length === 0) return 0;

    let deletedCount = 0;
    for (const chunk of chunkTransactionIds(ownedIds)) {
      /*
       * Um lançamento pode estar ligado a várias movimentações, e uma
       * movimentação pode estar dividida entre vários lançamentos. Guardamos o
       * estado anterior antes de remover os vínculos para só devolver a
       * movimentação a `sem_par` quando nenhum outro vínculo sobreviver.
       */
      const linkedMovements = await tx
        .select({ movementId: reconciliationLinks.movementId, previousStatus: bankMovements.status })
        .from(reconciliationLinks)
        .innerJoin(bankMovements, and(
          eq(bankMovements.id, reconciliationLinks.movementId),
          eq(bankMovements.userId, escopo.userId),
          eq(bankMovements.companyId, escopo.companyId),
        ))
        .where(and(
          eq(reconciliationLinks.userId, escopo.userId),
          eq(reconciliationLinks.companyId, escopo.companyId),
          inArray(reconciliationLinks.transactionId, chunk),
        ));

      await tx
        .delete(reconciliationLinks)
        .where(and(
          eq(reconciliationLinks.userId, escopo.userId),
          eq(reconciliationLinks.companyId, escopo.companyId),
          inArray(reconciliationLinks.transactionId, chunk),
        ));

      const previousStatusByMovement = new Map(
        linkedMovements.map(row => [row.movementId, row.previousStatus]),
      );
      const movementIds = [...previousStatusByMovement.keys()];
      if (movementIds.length > 0) {
        const remainingLinks = await tx
          .select({ movementId: reconciliationLinks.movementId })
          .from(reconciliationLinks)
          .where(and(
            eq(reconciliationLinks.userId, escopo.userId),
            eq(reconciliationLinks.companyId, escopo.companyId),
            inArray(reconciliationLinks.movementId, movementIds),
          ));
        const stillLinked = new Set(remainingLinks.map(row => row.movementId));
        const unlinkedIds = movementIds.filter(movementId => !stillLinked.has(movementId));

        for (const movementChunk of chunkTransactionIds(unlinkedIds)) {
          await tx
            .update(bankMovements)
            .set({
              status: "sem_par",
              classification: null,
              classificationNote: "",
              relatedMovementId: null,
              reconciledAt: null,
              reconciledBy: null,
            })
            .where(and(
              eq(bankMovements.userId, escopo.userId),
              eq(bankMovements.companyId, escopo.companyId),
              inArray(bankMovements.id, movementChunk),
            ));

          await tx.insert(reconciliationAudit).values(movementChunk.map(movementId => ({
            userId: escopo.userId,
            companyId: escopo.companyId,
            movementId,
            action: "desfazer",
            previousStatus: previousStatusByMovement.get(movementId) ?? "conciliado",
            newStatus: "sem_par",
            detail: "Conciliação desfeita porque o lançamento vinculado foi excluído.",
          })));
        }
      }

      const result = await tx
        .delete(financialTransactions)
        .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), inArray(financialTransactions.id, chunk)));
      deletedCount += Number(result[0].affectedRows ?? 0);
    }
    return deletedCount;
  });
}

export async function listFinancialAccounts(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(financialAccounts).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId))).orderBy(desc(financialAccounts.isActive), financialAccounts.name);
}

/**
 * Saldo de cada conta, agregado no banco. A sidebar aparece em toda página, e
 * carregar os 8 mil lançamentos só para somá-los em memória seria caro por
 * navegação — um GROUP BY devolve uma linha por conta.
 */
export async function getAccountBalances(escopo: Escopo, throughDate?: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      accountId: financialTransactions.accountId,
      total: sql<string>`SUM(${financialTransactions.amount})`,
    })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      eq(financialTransactions.status, "Pago"),
      isNotNull(financialTransactions.accountId),
      aposOSaldoInicial,
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
export async function sumTransactionsBefore(escopo: Escopo, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({ total: sql<string>`SUM(${financialTransactions.amount})` })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      lt(financialTransactions.transactionDate, date),
      aposOSaldoInicial
    ));
  return Number(row?.total ?? 0);
}

/*
 * As somas do painel, feitas no banco.
 *
 * Antes o painel baixava o razão inteiro — 6.725 linhas, 26 colunas — e somava
 * em JavaScript. Medido contra o TiDB: a consulta grande custa 539 ms, dos quais
 * 360 ms são só transporte, enquanto qualquer uma destas agregações custa 183 ms,
 * que é o próprio tempo de ida e volta. O trabalho de somar é de graça; o que se
 * paga é a linha atravessando a rede, e isso cresce junto com o razão.
 *
 * Cada função é uma consulta só, para que a rota possa dispará-las em paralelo:
 * em série elas somariam sete idas e voltas e o remédio seria pior que a doença.
 *
 * `type <> 'transferencia'` repete o `isCashFlow` do router: transferência entre
 * contas próprias move saldo mas não é receita nem despesa.
 */

/** Entradas e saídas do período, ignorando transferência. */
export async function sumWindowTotals(escopo: Escopo, start: string, end: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({
      incoming: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} > 0 THEN ${financialTransactions.amount} ELSE 0 END), 0)`,
      outgoing: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} < 0 THEN -${financialTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      sql`${financialTransactions.type} <> 'transferencia'`,
      gte(financialTransactions.transactionDate, start),
      lt(financialTransactions.transactionDate, end)
    ));
  return { incoming: Number(row?.incoming ?? 0), outgoing: Number(row?.outgoing ?? 0) };
}

/** Tudo que está pago, de qualquer data: é o dinheiro que existe. */
export async function sumPaidTransactions(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)` })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      eq(financialTransactions.status, "Pago"),
      aposOSaldoInicial
    ));
  return Number(row?.total ?? 0);
}

/**
 * Os quatro cartões de título em aberto, numa consulta só.
 *
 * O recorte é o mesmo `isOpenInWindow` do router: vence dentro da janela ou já
 * venceu e continua em aberto. Atraso não deixa de ser dívida por o mês ter
 * virado.
 */
export async function sumOpenTitles(escopo: Escopo, start: string, end: string, todayIso: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  /*
   * Os parênteses de fora são obrigatórios: o `and()` do drizzle não envolve o
   * fragmento cru, e sem eles o OR escapa da precedência e a condição vira
   * "(tudo isso) OU vencido", casando linha de qualquer usuário.
   */
  const naJanela = sql`((${financialTransactions.transactionDate} >= ${start} AND ${financialTransactions.transactionDate} < ${end}) OR ${financialTransactions.transactionDate} < ${todayIso})`;
  const [row] = await db
    .select({
      receivableCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} > 0 THEN 1 END)`,
      receivableAmount: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} > 0 THEN ${financialTransactions.amount} END), 0)`,
      payableCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} < 0 THEN 1 END)`,
      payableAmount: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} < 0 THEN -${financialTransactions.amount} END), 0)`,
      overdueCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} < 0 AND ${financialTransactions.transactionDate} < ${todayIso} THEN 1 END)`,
      overdueAmount: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} < 0 AND ${financialTransactions.transactionDate} < ${todayIso} THEN -${financialTransactions.amount} END), 0)`,
      dueTodayCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} > 0 AND ${financialTransactions.transactionDate} = ${todayIso} THEN 1 END)`,
      dueTodayAmount: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} > 0 AND ${financialTransactions.transactionDate} = ${todayIso} THEN ${financialTransactions.amount} END), 0)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      sql`${financialTransactions.type} <> 'transferencia'`,
      eq(financialTransactions.status, "Pendente"),
      naJanela
    ));
  return {
    receivable: { count: Number(row?.receivableCount ?? 0), amount: Number(row?.receivableAmount ?? 0) },
    payable: { count: Number(row?.payableCount ?? 0), amount: Number(row?.payableAmount ?? 0) },
    overdue: { count: Number(row?.overdueCount ?? 0), amount: Number(row?.overdueAmount ?? 0) },
    dueToday: { count: Number(row?.dueTodayCount ?? 0), amount: Number(row?.dueTodayAmount ?? 0) },
  };
}

/** Entradas e saídas mês a mês, para o gráfico de nove colunas. */
export async function sumMonthlyTotals(escopo: Escopo, start: string, end: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  /*
   * O apelido não é enfeite: o drizzle qualifica a coluna no GROUP BY e não no
   * SELECT, e com `only_full_group_by` ligado o MySQL não reconhece as duas
   * expressões como a mesma. Agrupar pelo apelido resolve.
   */
  const mes = sql<string>`DATE_FORMAT(${financialTransactions.transactionDate}, '%Y-%m')`.as("mes");
  const linhas = await db
    .select({
      month: mes,
      incoming: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} > 0 THEN ${financialTransactions.amount} ELSE 0 END), 0)`,
      outgoing: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} < 0 THEN -${financialTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      sql`${financialTransactions.type} <> 'transferencia'`,
      gte(financialTransactions.transactionDate, start),
      lt(financialTransactions.transactionDate, end)
    ))
    .groupBy(sql`mes`);
  return new Map(linhas.map(linha => [
    linha.month,
    { incoming: Number(linha.incoming), outgoing: Number(linha.outgoing) },
  ]));
}

/** As categorias que mais entraram dinheiro no período. */
export async function topRevenueCategories(escopo: Escopo, start: string, end: string, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const total = sql<string>`SUM(${financialTransactions.amount})`;
  const linhas = await db
    .select({ label: financialTransactions.category, amount: total })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      sql`${financialTransactions.type} <> 'transferencia'`,
      gt(financialTransactions.amount, "0"),
      gte(financialTransactions.transactionDate, start),
      lt(financialTransactions.transactionDate, end)
    ))
    .groupBy(financialTransactions.category)
    .orderBy(desc(total))
    .limit(limit);
  return linhas.map(linha => ({ label: linha.label, amount: Number(linha.amount) }));
}

/** Os últimos lançamentos que já aconteceram — parcela de 2027 não é recente. */
export async function listRecentTransactions(escopo: Escopo, todayIso: string, limit: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      lte(financialTransactions.transactionDate, todayIso)
    ))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id))
    .limit(limit);
}

/*
 * As contagens de "contas e categorias", agregadas no banco.
 *
 * A tela baixava o razão inteiro para montar três `Map` em JavaScript. Como ela
 * já dispara sete consultas em paralelo, estas três entram sem custo de tempo
 * nenhum e tiram as 6.725 linhas da rede.
 */
type EstatisticaPorId = Map<number, { count: number; total: number }>;

type ColunaDeAgrupamento =
  | typeof financialTransactions.accountId
  | typeof financialTransactions.categoryId
  | typeof financialTransactions.costCenterId;

async function statsPorColuna(escopo: Escopo, coluna: ColunaDeAgrupamento, somaSoPago: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const soma = somaSoPago
    ? sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.status} = 'Pago' THEN ${financialTransactions.amount} ELSE 0 END), 0)`
    : sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`;
  const linhas = await db
    .select({ id: coluna, count: sql<number>`COUNT(*)`, total: soma })
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), isNotNull(coluna)))
    .groupBy(coluna);
  const mapa: EstatisticaPorId = new Map();
  for (const linha of linhas) {
    if (linha.id === null) continue;
    mapa.set(linha.id, { count: Number(linha.count), total: Number(linha.total) });
  }
  return mapa;
}

/** Quanto ainda está sem categoria — o aviso da tela de contas e categorias. */
export async function getUncategorizedSummary(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({
      count: sql<number>`COUNT(*)`,
      amount: sql<string>`COALESCE(SUM(ABS(${financialTransactions.amount})), 0)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      isNull(financialTransactions.categoryId),
      sql`${financialTransactions.type} <> 'transferencia'`
    ));
  return { count: Number(row?.count ?? 0), amount: Number(row?.amount ?? 0) };
}

/** Movimento por conta: só o que está pago, que é o que forma saldo. */
export function getTransactionStatsByAccount(escopo: Escopo) {
  return statsPorColuna(escopo, financialTransactions.accountId, true);
}

/** Total por categoria: pago e pendente, que é o que a tela mostra. */
export function getTransactionStatsByCategory(escopo: Escopo) {
  return statsPorColuna(escopo, financialTransactions.categoryId, false);
}

export function getTransactionStatsByCostCenter(escopo: Escopo) {
  return statsPorColuna(escopo, financialTransactions.costCenterId, false);
}

/*
 * A regra do saldo inicial COM DATA.
 *
 * "Saldo inicial" passou a significar "saldo NESTA data". O que veio até ela
 * já está dentro do número que a pessoa digitou — então só o que veio DEPOIS
 * soma. Sem isso, quem digita o saldo de hoje e importa os quinze dias
 * anteriores vê o mesmo dinheiro duas vezes, e nada na tela denuncia.
 *
 * Conta sem data (as que existiam antes da coluna) continua como antes: tudo
 * soma. Lançamento sem conta não tem corte: passa. Por isso o JOIN é LEFT e a
 * condição começa por `isNull`.
 *
 * É uma constante, e não uma função por chamada, para as cinco somas de saldo
 * usarem exatamente a mesma frase — um `>=` num lugar e `>` em outro é o tipo
 * de deriva que faz dois saldos da mesma conta discordarem na mesma tela.
 */
const aposOSaldoInicial = or(
  isNull(financialAccounts.initialBalanceDate),
  gt(financialTransactions.transactionDate, financialAccounts.initialBalanceDate),
);

/**
 * O saldo de abertura, somado no banco.
 *
 * É o mesmo recorte do `openingBalance` que vivia no router: só o que está pago
 * e não é transferência, antes da data. Antes exigia o razão inteiro na memória
 * para somar uma coluna.
 */
export async function sumPaidBefore(escopo: Escopo, date: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)` })
    .from(financialTransactions)
    .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      eq(financialTransactions.status, "Pago"),
      sql`${financialTransactions.type} <> 'transferencia'`,
      lt(financialTransactions.transactionDate, date),
      aposOSaldoInicial
    ));
  return Number(row?.total ?? 0);
}

/**
 * O caixa de hoje de CADA empresa do login, em duas consultas.
 *
 * O modal de trocar empresa mostra um saldo por linha, e ele tem que ser o
 * MESMO número do "Caixa disponível" do painel — dois saldos diferentes para a
 * mesma empresa na mesma tela é pior que saldo nenhum. Por isso o critério aqui
 * é copiado do `openingBalance` do fluxo e do `sumPaidBefore`, e não reinventado:
 * saldo inicial das contas, mais o que está PAGO antes de `amanha`,
 * transferência de fora (ela move dinheiro entre contas da mesma empresa e
 * somaria duas vezes).
 *
 * Duas consultas com `GROUP BY companyId`, e não duas por empresa. Vinte
 * empresas dariam quarenta idas ao banco para desenhar um modal.
 *
 * Recebe `userId` cru de propósito, e é o único caso do arquivo em que uma
 * função por login toca tabela que tem empresa. O que a torna correta é o
 * `GROUP BY`: ela não escolhe empresa nenhuma, devolve todas as do login
 * separadas, e o `WHERE userId` impede que a soma de outra pessoa entre na
 * conta. Está na lista fechada de `guardas.test.ts` com esse motivo escrito.
 */
export async function saldosDeCaixaPorEmpresa(userId: number, amanha: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [iniciais, pagos] = await Promise.all([
    db
      .select({
        companyId: financialAccounts.companyId,
        total: sql<string>`COALESCE(SUM(${financialAccounts.initialBalance}), 0)`,
      })
      .from(financialAccounts)
      .where(eq(financialAccounts.userId, userId))
      .groupBy(financialAccounts.companyId),
    db
      .select({
        companyId: financialTransactions.companyId,
        total: sql<string>`COALESCE(SUM(${financialTransactions.amount}), 0)`,
      })
      .from(financialTransactions)
      .leftJoin(financialAccounts, eq(financialAccounts.id, financialTransactions.accountId))
      .where(and(
        eq(financialTransactions.userId, userId),
        eq(financialTransactions.status, "Pago"),
        sql`${financialTransactions.type} <> 'transferencia'`,
        lt(financialTransactions.transactionDate, amanha),
        aposOSaldoInicial,
      ))
      .groupBy(financialTransactions.companyId),
  ]);

  const saldos = new Map<number, number>();
  for (const linha of iniciais) saldos.set(linha.companyId, Number(linha.total));
  for (const linha of pagos) saldos.set(linha.companyId, (saldos.get(linha.companyId) ?? 0) + Number(linha.total));
  for (const [companyId, valor] of saldos) saldos.set(companyId, roundCurrency(valor));
  return saldos;
}

/**
 * Os lançamentos que as telas de fluxo e de títulos realmente usam.
 *
 * `buildDailyFlow`, `buildMonthlyFlow` e `buildPayablesView` já descartavam por
 * conta própria tudo que está fora da janela ou não está pendente — o recorte
 * aqui só deixa de trazer da rede o que ia ser jogado fora em memória. Medido:
 * 539 ms para o razão inteiro contra 189 ms para o recorte.
 *
 * Agregar em vez de recortar exigiria reescrever esses três módulos de
 * `shared/`, que têm 65 testes em cima. O recorte dá o mesmo ganho sem tocar em
 * lógica testada.
 */
export async function listLedgerWindow(escopo: Escopo, from: string, to: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      id: financialTransactions.id,
      type: financialTransactions.type,
      transactionDate: financialTransactions.transactionDate,
      description: financialTransactions.description,
      contact: financialTransactions.contact,
      category: financialTransactions.category,
      amount: financialTransactions.amount,
      account: financialTransactions.account,
      status: financialTransactions.status,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      // Pendente de qualquer data entra: atraso continua sendo dívida hoje, e é
      // isso que a tela de títulos lista.
      sql`(${financialTransactions.status} = 'Pendente' OR (${financialTransactions.transactionDate} >= ${from} AND ${financialTransactions.transactionDate} < ${to}))`
    ))
    .orderBy(desc(financialTransactions.transactionDate), desc(financialTransactions.id));
}

/*
 * A tela de pagas e recebidas, agregada no banco.
 *
 * O recorte é `status = 'Pago'` e `settledAt` dentro do mês — nunca
 * `transactionDate`. Um título vencido em agosto e pago em setembro pertence a
 * setembro aqui, e é essa diferença que separa esta tela da de abertos.
 *
 * Sem COALESCE de propósito: todo título pago tem `settledAt` preenchido desde
 * a migration 0019, e função no WHERE desligaria o índice
 * `(userId, status, settledAt)`, que é justamente o que faz a consulta não
 * varrer o razão.
 *
 * Transferência fica de fora, como no resto do sistema: mover dinheiro entre
 * contas próprias não é recebimento nem pagamento.
 */
function liquidadasNoMes(escopo: Escopo, from: string, to: string) {
  return and(
    eq(financialTransactions.userId, escopo.userId),
    eq(financialTransactions.companyId, escopo.companyId),
    eq(financialTransactions.status, "Pago"),
    sql`${financialTransactions.type} <> 'transferencia'`,
    gte(financialTransactions.settledAt, from),
    lt(financialTransactions.settledAt, to)
  );
}

/**
 * Os números do topo: recebido, pago, e o prazo entre vencer e liquidar.
 *
 * O prazo médio sai de `AVG(DATEDIFF(...))` no banco. Calculá-lo em JavaScript
 * exigiria trazer as 6.692 linhas só para dividir uma soma — a lição do 2.7.
 */
export async function getSettledTotals(escopo: Escopo, from: string, to: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [row] = await db
    .select({
      receivedCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} > 0 THEN 1 END)`,
      received: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} > 0 THEN ${financialTransactions.amount} END), 0)`,
      paidCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.amount} < 0 THEN 1 END)`,
      paid: sql<string>`COALESCE(SUM(CASE WHEN ${financialTransactions.amount} < 0 THEN -${financialTransactions.amount} END), 0)`,
      // Nulo quando não há título no mês: zero dias e "sem dado" são coisas
      // diferentes, e a tela precisa distinguir para não escrever "0,0 dias"
      // num mês vazio.
      averageDelayDays: sql<string | null>`AVG(DATEDIFF(${financialTransactions.settledAt}, ${financialTransactions.transactionDate}))`,
      lateCount: sql<number>`COUNT(CASE WHEN ${financialTransactions.settledAt} > ${financialTransactions.transactionDate} THEN 1 END)`,
      lastSettledAt: sql<string | null>`MAX(${financialTransactions.settledAt})`,
      settledDays: sql<number>`COUNT(DISTINCT ${financialTransactions.settledAt})`,
    })
    .from(financialTransactions)
    .where(liquidadasNoMes(escopo, from, to));

  return {
    received: Number(row?.received ?? 0),
    receivedCount: Number(row?.receivedCount ?? 0),
    paid: Number(row?.paid ?? 0),
    paidCount: Number(row?.paidCount ?? 0),
    averageDelayDays: row?.averageDelayDays === null || row?.averageDelayDays === undefined
      ? null
      : Number(row.averageDelayDays),
    lateCount: Number(row?.lateCount ?? 0),
    lastSettledAt: row?.lastSettledAt ?? null,
    settledDays: Number(row?.settledDays ?? 0),
  };
}

/** As linhas liquidadas do mês, só com o que as duas visões desenham. */
export async function listSettledInMonth(escopo: Escopo, from: string, to: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      id: financialTransactions.id,
      settledAt: financialTransactions.settledAt,
      transactionDate: financialTransactions.transactionDate,
      description: financialTransactions.description,
      contact: financialTransactions.contact,
      category: financialTransactions.category,
      account: financialTransactions.account,
      amount: financialTransactions.amount,
    })
    .from(financialTransactions)
    .where(liquidadasNoMes(escopo, from, to))
    // Mais recente primeiro, como o mockup: o dia de cima é o último movimento.
    .orderBy(desc(financialTransactions.settledAt), desc(financialTransactions.id));
}

/** Se a conta tem qualquer dado — o que decide se o primeiro acesso aparece. */
export async function getOnboardingCounts(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [contas, lancamentos] = await Promise.all([
    db.select({ n: sql<number>`COUNT(*)` }).from(financialAccounts).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId))),
    db.select({ n: sql<number>`COUNT(*)` }).from(financialTransactions).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId))),
  ]);
  return { accountCount: Number(contas[0]?.n ?? 0), transactionCount: Number(lancamentos[0]?.n ?? 0) };
}

/** Terminou ou pulou: nos dois casos o fluxo não volta a aparecer. */
/**
 * "Terminei" ou "configuro depois", gravado NA EMPRESA.
 *
 * Escrevia em `users` e era essa a limitação da Fase 6: a conclusão de uma
 * empresa calava o assistente em todas as outras criadas antes dela. Agora
 * carimba a empresa ativa e não toca mais na coluna do login — que fica de pé,
 * sem escritor, respondendo pelas empresas anteriores à Fase 7.
 *
 * Se a linha não for do login, nada é escrito e o erro sobe. Não é zelo: o id
 * vem do cookie de empresa ativa, que é dado do cliente.
 */
export async function markOnboardingCompleted(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const resultado = await db
    .update(companyProfiles)
    .set({ onboardingCompletedAt: new Date() })
    .where(and(eq(companyProfiles.userId, escopo.userId), eq(companyProfiles.id, escopo.companyId)));
  if (Number(resultado[0].affectedRows ?? 0) === 0) {
    throw new Error("Empresa não encontrada para este login.");
  }
}

export async function getFinancialAccount(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(financialAccounts).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId), eq(financialAccounts.id, id))).limit(1);
  return rows[0];
}

export async function getFinancialAccountByName(escopo: Escopo, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(financialAccounts).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId), eq(financialAccounts.name, name))).limit(1);
  return rows[0];
}

export async function createFinancialAccount(escopo: Escopo, values: Omit<InsertFinancialAccount, "userId" | "companyId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(financialAccounts).values({ userId: escopo.userId, companyId: escopo.companyId, ...values });
  return getFinancialAccount(escopo, Number(result[0].insertId));
}

export async function updateFinancialAccount(escopo: Escopo, id: number, values: Partial<Omit<InsertFinancialAccount, "userId" | "companyId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(financialAccounts).set(values).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId), eq(financialAccounts.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ account: values.name }).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.accountId, id)));
  }
  return getFinancialAccount(escopo, id);
}

export async function deleteFinancialAccount(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.accountId, id))).limit(1);
  if (used.length) return false;
  await db.delete(financialAccounts).where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId), eq(financialAccounts.id, id)));
  return true;
}

export async function listTransactionCategories(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(transactionCategories).where(and(eq(transactionCategories.userId, escopo.userId), eq(transactionCategories.companyId, escopo.companyId))).orderBy(desc(transactionCategories.isActive), transactionCategories.name);
}

export async function getTransactionCategory(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(transactionCategories).where(and(eq(transactionCategories.userId, escopo.userId), eq(transactionCategories.companyId, escopo.companyId), eq(transactionCategories.id, id))).limit(1);
  return rows[0];
}

export async function getTransactionCategoryByName(escopo: Escopo, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(transactionCategories).where(and(eq(transactionCategories.userId, escopo.userId), eq(transactionCategories.companyId, escopo.companyId), eq(transactionCategories.name, name))).limit(1);
  return rows[0];
}

export async function createTransactionCategory(escopo: Escopo, values: Omit<InsertTransactionCategory, "userId" | "companyId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(transactionCategories).values({ userId: escopo.userId, companyId: escopo.companyId, ...values });
  return getTransactionCategory(escopo, Number(result[0].insertId));
}

export async function updateTransactionCategory(escopo: Escopo, id: number, values: Partial<Omit<InsertTransactionCategory, "userId" | "companyId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(transactionCategories).set(values).where(and(eq(transactionCategories.userId, escopo.userId), eq(transactionCategories.companyId, escopo.companyId), eq(transactionCategories.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ category: values.name }).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.categoryId, id)));
  }
  return getTransactionCategory(escopo, id);
}

export async function deleteTransactionCategory(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.categoryId, id))).limit(1);
  if (used.length) return false;
  await db.delete(transactionCategories).where(and(eq(transactionCategories.userId, escopo.userId), eq(transactionCategories.companyId, escopo.companyId), eq(transactionCategories.id, id)));
  return true;
}

export async function listCostCenters(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(costCenters).where(and(eq(costCenters.userId, escopo.userId), eq(costCenters.companyId, escopo.companyId))).orderBy(desc(costCenters.isActive), costCenters.name);
}

export async function getCostCenter(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(costCenters).where(and(eq(costCenters.userId, escopo.userId), eq(costCenters.companyId, escopo.companyId), eq(costCenters.id, id))).limit(1);
  return rows[0];
}

export async function getCostCenterByName(escopo: Escopo, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(costCenters).where(and(eq(costCenters.userId, escopo.userId), eq(costCenters.companyId, escopo.companyId), eq(costCenters.name, name))).limit(1);
  return rows[0];
}

export async function createCostCenter(escopo: Escopo, values: Omit<InsertCostCenter, "userId" | "companyId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(costCenters).values({ userId: escopo.userId, companyId: escopo.companyId, ...values });
  return getCostCenter(escopo, Number(result[0].insertId));
}

export async function updateCostCenter(escopo: Escopo, id: number, values: Partial<Omit<InsertCostCenter, "userId" | "companyId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(costCenters).set(values).where(and(eq(costCenters.userId, escopo.userId), eq(costCenters.companyId, escopo.companyId), eq(costCenters.id, id)));
  if (values.name) {
    await db.update(financialTransactions).set({ costCenter: values.name }).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.costCenterId, id)));
  }
  return getCostCenter(escopo, id);
}

/** Recusa a exclusão enquanto houver lançamento apontando para o centro de custo. */
export async function deleteCostCenter(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const used = await db.select({ id: financialTransactions.id }).from(financialTransactions).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.costCenterId, id))).limit(1);
  if (used.length) return false;
  await db.delete(costCenters).where(and(eq(costCenters.userId, escopo.userId), eq(costCenters.companyId, escopo.companyId), eq(costCenters.id, id)));
  return true;
}

/**
 * Grava as duas pernas da transferência numa transação só: ou entram as duas, ou
 * nenhuma. Meia transferência deixaria o saldo das contas errado.
 */
export async function createTransferPair(
  escopo: Escopo,
  origin: TransactionValues,
  destination: TransactionValues
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const ids = await db.transaction(async tx => {
    const originResult = await tx.insert(financialTransactions).values({ userId: escopo.userId, companyId: escopo.companyId, ...origin });
    const destinationResult = await tx.insert(financialTransactions).values({ userId: escopo.userId, companyId: escopo.companyId, ...destination });
    return [Number(originResult[0].insertId), Number(destinationResult[0].insertId)];
  });

  const rows = await getTransactionsByIds(escopo, ids);
  return rows;
}

export async function getTransferGroup(escopo: Escopo, transferGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(financialTransactions)
    .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.transferGroupId, transferGroupId)))
    .orderBy(financialTransactions.amount);
}

/** Reescreve as duas pernas de uma transferência existente, atomicamente. */
export async function updateTransferPair(
  escopo: Escopo,
  transferGroupId: string,
  origin: TransactionValues,
  destination: TransactionValues
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getTransferGroup(escopo, transferGroupId);
  if (existing.length !== 2) return null;
  const [outgoing, incoming] = Number(existing[0].amount) <= Number(existing[1].amount)
    ? [existing[0], existing[1]]
    : [existing[1], existing[0]];

  await db.transaction(async tx => {
    await tx.update(financialTransactions).set(origin).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.id, outgoing.id)));
    await tx.update(financialTransactions).set(destination).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.id, incoming.id)));
  });
  return getTransferGroup(escopo, transferGroupId);
}

export async function deleteTransferGroup(escopo: Escopo, transferGroupId: string) {
  const group = await getTransferGroup(escopo, transferGroupId);
  return deleteTransactions(escopo, group.map(transaction => transaction.id));
}

/**
 * Grava uma série inteira numa transação só. Uma série pela metade deixaria o
 * usuário com parcelas faltando no meio e sem sinal de que algo falhou.
 */
export async function createTransactionSeries(escopo: Escopo, rows: TransactionValues[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (rows.length === 0) return [];

  const ids = await db.transaction(async tx => {
    const inserted: number[] = [];
    for (const row of rows) {
      const result = await tx.insert(financialTransactions).values({ userId: escopo.userId, companyId: escopo.companyId, ...row });
      inserted.push(Number(result[0].insertId));
    }
    return inserted;
  });

  return getTransactionsByIds(escopo, ids);
}

/**
 * Transforma uma linha já existente na primeira parcela e insere as seguintes.
 * A operação é atômica para nunca deixar uma recorrência criada pela metade.
 */
export async function materializeTransactionSeries(
  escopo: Escopo,
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
        eq(financialTransactions.userId, escopo.userId),
        eq(financialTransactions.companyId, escopo.companyId),
        eq(financialTransactions.id, existingId),
        isNull(financialTransactions.recurrenceGroupId),
      ));
    if (Number(updated[0].affectedRows ?? 0) !== 1) {
      throw new Error("Transaction is already part of a recurrence series");
    }

    const insertedIds = [existingId];
    for (const row of rows.slice(1)) {
      const result = await tx.insert(financialTransactions).values({ userId: escopo.userId, companyId: escopo.companyId, ...row });
      insertedIds.push(Number(result[0].insertId));
    }
    return insertedIds;
  });

  return getTransactionsByIds(escopo, ids);
}

export async function getRecurrenceGroup(escopo: Escopo, recurrenceGroupId: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      eq(financialTransactions.recurrenceGroupId, recurrenceGroupId)
    ))
    .orderBy(financialTransactions.transactionDate, financialTransactions.id);
}

export async function listCategoryRules(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(categoryRules)
    .where(and(eq(categoryRules.userId, escopo.userId), eq(categoryRules.companyId, escopo.companyId)))
    .orderBy(desc(categoryRules.isActive), categoryRules.priority, categoryRules.id);
}

export async function getCategoryRule(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(categoryRules).where(and(eq(categoryRules.userId, escopo.userId), eq(categoryRules.companyId, escopo.companyId), eq(categoryRules.id, id))).limit(1);
  return rows[0];
}

export async function createCategoryRule(escopo: Escopo, values: Omit<InsertCategoryRule, "userId" | "companyId">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(categoryRules).values({ userId: escopo.userId, companyId: escopo.companyId, ...values });
  return getCategoryRule(escopo, Number(result[0].insertId));
}

export async function updateCategoryRule(escopo: Escopo, id: number, values: Partial<Omit<InsertCategoryRule, "userId" | "companyId">>) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(categoryRules).set(values).where(and(eq(categoryRules.userId, escopo.userId), eq(categoryRules.companyId, escopo.companyId), eq(categoryRules.id, id)));
  return getCategoryRule(escopo, id);
}

export async function deleteCategoryRule(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(categoryRules).where(and(eq(categoryRules.userId, escopo.userId), eq(categoryRules.companyId, escopo.companyId), eq(categoryRules.id, id)));
  return { success: true } as const;
}

/** Quantas vezes cada conta recebeu importação, e a data da última. */
export async function getAccountImportSummary(escopo: Escopo) {
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
    .where(and(eq(transactionImportBatches.userId, escopo.userId), eq(transactionImportBatches.companyId, escopo.companyId)))
    .groupBy(transactionImportBatches.accountId);

  return new Map(rows.map(row => [Number(row.accountId), {
    lastImportedAt: row.lastImportedAt ? new Date(row.lastImportedAt) : null,
    batchCount: Number(row.batchCount),
    format: String(row.format ?? ""),
  }]));
}

/** Quantos lançamentos cada conta teve dentro do intervalo. */
export async function getAccountTransactionCounts(escopo: Escopo, startDate: string, endDate: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select({
      accountId: financialTransactions.accountId,
      total: sql<number>`COUNT(*)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
      isNotNull(financialTransactions.accountId),
      gte(financialTransactions.transactionDate, startDate),
      lt(financialTransactions.transactionDate, endDate)
    ))
    .groupBy(financialTransactions.accountId);
  return new Map(rows.map(row => [Number(row.accountId), Number(row.total)]));
}

/**
 * As empresas do login, na ordem em que a lista as mostra.
 *
 * Primeira consulta do modelo multiempresa. A guarda por `userId` é a única
 * coisa entre esta lista e a de outra pessoa — e é ela que o arreio de duas
 * empresas põe à prova, com mutação.
 *
 * A ordenação vem do banco e não do módulo puro porque o índice
 * `company_profiles_user_order_idx` existe exatamente para isso; `sortCompanies`
 * é a mesma regra, para quem já tem a lista em memória.
 */
export async function listCompanies(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId))
    .orderBy(desc(companyProfiles.isActive), asc(companyProfiles.sortOrder), asc(companyProfiles.id));
}

/**
 * As empresas que um ATOR consegue ver: as próprias mais as liberadas a ele.
 *
 * É a irmã de `listCompanies`, e a diferença entre as duas é a Fase A inteira:
 * `listCompanies(dono)` responde "de quem é esta empresa"; esta responde "o que
 * esta pessoa pode abrir". Para o dono as duas coincidem. Para o contador, só
 * esta serve — e é ela que alimenta `ctx.companies`, que alimenta
 * `pickActiveCompany`, que é quem recusa o cookie de empresa alheia em todo
 * request.
 *
 * Isso faz desta consulta SUPERFÍCIE DE SEGURANÇA. Uma linha a mais aqui — um
 * vínculo revogado que entrou, um JOIN sem filtro — e o cookie da empresa
 * alheia passa a ser aceito, e todas as guardas de escopo obedecem, porque
 * para elas está tudo certo. Por isso `revokedAt IS NULL` é a primeira
 * condição, e por isso ela tem arreio próprio.
 *
 * `atorId`, e não `userId`: o nome diz de quem é o número. A sentinela em
 * `guardas.test.ts` vigia as duas grafias, para esta função não escapar da
 * lista fechada por ter mudado de nome.
 */
export async function empresasVisiveisPara(atorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [proprias, vinculos] = await Promise.all([
    listCompanies(atorId),
    db
      .select({ companyId: companyAccess.companyId })
      .from(companyAccess)
      .where(and(eq(companyAccess.userId, atorId), isNull(companyAccess.revokedAt))),
  ]);

  // Um vínculo para a própria empresa não deveria existir, mas se existir não
  // pode duplicar a linha: o dono já a tem por propriedade.
  const idsLiberadas = Array.from(new Set(vinculos.map(vinculo => vinculo.companyId)))
    .filter(id => !proprias.some(empresa => empresa.id === id));
  if (idsLiberadas.length === 0) return proprias;

  const liberadas = await db.select().from(companyProfiles).where(inArray(companyProfiles.id, idsLiberadas));

  // A mesma ordem de `listCompanies`, sobre a lista unida: ativas primeiro,
  // depois pela ordem que o dono deu, depois pelo id — para a empresa padrão
  // de `pickActiveCompany` não depender de qual metade da lista ela veio.
  return [...proprias, ...liberadas].sort((a, b) =>
    Number(b.isActive) - Number(a.isActive) || a.sortOrder - b.sortOrder || a.id - b.id,
  );
}

/*
 * O `.limit(1)` sem ordem devolve a linha que o banco quiser no dia em que
 * houver duas. Hoje o único por `userId` garante que só há uma; quando ele
 * cair, esta ordem é o que mantém a escolha previsível. Custa nada agora e
 * tira uma mina do caminho.
 */
/**
 * A empresa ativa do request, e não "a primeira do login".
 *
 * Enquanto `company_profiles_user_uidx` existiu, os dois eram a mesma coisa: um
 * login tinha uma empresa e ordenar por `sortOrder` sempre devolvia ela. O
 * índice cai na Fase 5, e a partir daí "a primeira" passa a ser uma resposta
 * errada com cara de certa — a tela de configurações mostraria a empresa A
 * enquanto a barra de cima diz B.
 *
 * A guarda de dono continua ao lado da de empresa, pelo mesmo motivo de sempre:
 * o pior caso tem que ser "vi minha empresa errada", nunca "vi a de outro".
 */
export async function getCompanyProfile(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(companyProfiles)
    .where(and(eq(companyProfiles.userId, escopo.userId), eq(companyProfiles.id, escopo.companyId)))
    .limit(1);
  return rows[0];
}

/** Uma linha por usuário: cria na primeira gravação, atualiza depois. */
/**
 * Grava a empresa ativa. É um UPDATE só, e isso é o ponto.
 *
 * A versão anterior lia, decidia e escrevia — e o UPDATE filtrava só por
 * `userId`. Enquanto o único de um-perfil-por-login estava de pé, ele era a
 * única coisa impedindo duas gravações simultâneas de criarem dois perfis; e
 * num login com duas empresas, aquele UPDATE teria reescrito AS DUAS de uma vez.
 *
 * Com a chave completa `(userId, id)` não há leitura no meio, não há corrida a
 * proteger e o alcance é uma linha. É o que entra no lugar do índice quando ele
 * cair — e é por isso que este conserto vem ANTES da migration, não depois.
 *
 * Zero linha afetada não é sucesso silencioso: significa que a empresa ativa não
 * pertence a quem pediu, e quem chamou precisa saber.
 */
/**
 * O teto de empresas por login.
 *
 * Não é o limite do plano — esse é assunto da leva dos planos, e vai depender do
 * que a pessoa paga. Este é o teto técnico: sem nenhum, um laço malfeito no
 * cliente cria mil empresas antes de alguém perceber, e cada uma nasce com
 * cinquenta categorias-padrão. Vinte é generoso para o caso real e barato de
 * levantar quando o limite de verdade existir.
 */
export const MAXIMO_DE_EMPRESAS = 20;

export class LimiteDeEmpresas extends Error {}
export class UltimaEmpresaAtiva extends Error {}

/**
 * Cria uma empresa para o login, com as categorias-padrão dela.
 *
 * As categorias-padrão vão junto pelo mesmo motivo que vão no cadastro de
 * conta: empresa sem categoria não deixa lançar nada, e a pessoa que acabou de
 * criar a segunda empresa não quer descobrir isso na hora de registrar a
 * primeira venda. É a mesma lista do `createLocalUser` — não há duas versões.
 *
 * Tudo numa transação: uma empresa criada sem as categorias seria pior que
 * empresa nenhuma, porque parece pronta.
 */
/* `id` fora daqui também: quem cria não escolhe o número da empresa. Foi a
 * invariante nova de `guardas.test.ts` que apontou esta — a terceira porta. */
export async function createCompany(userId: number, values: Omit<InsertCompanyProfile, "userId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const quantas = await db
    .select({ n: sql<number>`COUNT(*)` })
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, userId));
  if (Number(quantas[0]?.n ?? 0) >= MAXIMO_DE_EMPRESAS) {
    throw new LimiteDeEmpresas(`Este acesso já tem ${MAXIMO_DE_EMPRESAS} empresas.`);
  }

  const id = await db.transaction(async tx => {
    /*
     * O carimbo vem DEPOIS do espalhamento, como o `companyId` dos itens de
     * patrimônio: antes, um valor vindo de fora sobrescreveria a versão e a
     * empresa nasceria "atrasada" com o catálogo inteiro dentro.
     */
    const criada = await tx.insert(companyProfiles).values({
      userId,
      ...values,
      categoryDefaultsVersion: DEFAULT_CATEGORY_CATALOG_VERSION,
    });
    const novoId = Number(criada[0].insertId);
    await tx.insert(transactionCategories).values(defaultCategoryValues(userId, novoId));
    return novoId;
  });

  return getCompanyProfile({ userId, companyId: id });
}

/**
 * Arquiva ou reativa uma empresa.
 *
 * Arquivar não apaga: empresa guarda razão contábil, e o histórico dela continua
 * existindo para relatório de anos anteriores. O que muda é ela sair da lista de
 * escolha do dia a dia.
 *
 * A última ativa não pode ser arquivada. Não é preciosismo: `protectedProcedure`
 * exige uma empresa ativa para qualquer procedure rodar, então um login sem
 * nenhuma empresa ativa fica sem conseguir abrir tela nenhuma — e o conserto
 * seria pelo banco.
 */
export async function setCompanyArchived(escopo: Escopo, arquivada: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  /*
   * A ordem destas três verificações não é arbitrária, e o arreio flagrou ela
   * invertida: a contagem de ativas vinha primeiro, então pedir para arquivar a
   * empresa de OUTRA pessoa era recusado com "não dá para arquivar a única
   * empresa ativa" — a contagem era a de quem pediu, sobre uma empresa que não
   * era dele. A recusa acontecia, mas pelo motivo errado, e motivo errado numa
   * mensagem de erro é o que faz alguém depurar o problema errado.
   *
   * Primeiro: a empresa é sua? Depois: sobra alguma ativa? Só então escreve.
   */
  const [alvo] = await db
    .select({ isActive: companyProfiles.isActive })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.userId, escopo.userId), eq(companyProfiles.id, escopo.companyId)))
    .limit(1);
  if (!alvo) throw new Error("Empresa não encontrada para este login.");

  if (arquivada && alvo.isActive) {
    /*
     * A contagem sai de `listCompanies`, não de um COUNT próprio.
     *
     * A sentinela estrutural reprovou a primeira versão, e com razão: era uma
     * terceira consulta filtrando por dono SEM filtrar por empresa, no meio de
     * uma função que filtra pelas duas. Guarda esquecida tem exatamente essa
     * aparência, e uma rede que aceita "esta aqui é diferente" para de ser rede.
     *
     * Reusar a listagem resolve por construção — ela já tem a guarda de dono
     * provada desde a Fase 1 — e ainda tira uma ida ao banco. São no máximo
     * vinte linhas; contar em memória é de graça.
     */
    const ativas = (await listCompanies(escopo.userId)).filter(empresa => empresa.isActive).length;
    if (ativas <= 1) {
      throw new UltimaEmpresaAtiva("Não dá para arquivar a única empresa ativa deste acesso.");
    }
  }

  const resultado = await db
    .update(companyProfiles)
    .set({ isActive: !arquivada })
    .where(and(eq(companyProfiles.userId, escopo.userId), eq(companyProfiles.id, escopo.companyId)));
  if (Number(resultado[0].affectedRows ?? 0) === 0) {
    throw new Error("Empresa não encontrada para este login.");
  }
  return getCompanyProfile(escopo);
}

/*
 * `id` fica fora pelo mesmo motivo, e nesta tabela o `id` É a chave da empresa:
 * reescrevê-lo renumeraria a empresa e orfanaria toda linha filha que aponta
 * para o id antigo — em treze tabelas.
 */
export async function saveCompanyProfile(escopo: Escopo, values: Omit<InsertCompanyProfile, "userId" | "id">) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const resultado = await db
    .update(companyProfiles)
    .set(values)
    .where(and(eq(companyProfiles.userId, escopo.userId), eq(companyProfiles.id, escopo.companyId)));
  if (Number(resultado[0].affectedRows ?? 0) === 0) {
    throw new Error("Empresa ativa não encontrada para este login.");
  }
  return getCompanyProfile(escopo);
}

export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return rows[0];
}

/**
 * Os números que o cartão "Uso" da tela de Planos mostra.
 *
 * Existe porque o cartão era mockup e passou a mentir no dia em que o dono
 * criou a segunda empresa: dizia "Empresas 1 de 1" com alerta de estouro, numa
 * conta com duas. Número inventado numa tela de cobrança é pior que número
 * nenhum.
 *
 * A contagem de lançamentos do mês SAIU junto com a linha dela na tela. Número
 * que ninguém mostra não se calcula — e ele era o único aqui que precisava de
 * recorte de data, então o `uso` deixou de precisar do fuso da conta.
 *
 * O total de EMPRESAS não sai daqui — é por login, não por empresa, e uma
 * contagem por dono dentro de uma função de escopo é exatamente o desequilíbrio
 * que a invariante de `guardas.test.ts` reprova. Quem conta empresa é o
 * `listCompanies`, no router.
 */
export async function contarUsoDaEmpresa(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [contas] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      ativas: sql<number>`SUM(CASE WHEN ${financialAccounts.isActive} THEN 1 ELSE 0 END)`,
    })
    .from(financialAccounts)
    .where(and(eq(financialAccounts.userId, escopo.userId), eq(financialAccounts.companyId, escopo.companyId)));

  return {
    contas: Number(contas?.total ?? 0),
    contasAtivas: Number(contas?.ativas ?? 0),
  };
}

/**
 * Só as contagens que a barra lateral recolhida mostra na bolinha.
 *
 * A tela de títulos carrega todos os lançamentos para montar a lista; a barra
 * aparece em todas as páginas e não pode pagar esse preço, então aqui é COUNT
 * no banco.
 */
/**
 * Esta empresa já teve algum lançamento, um que seja?
 *
 * É a pergunta que decide entre a tela de trabalho e a tela de primeiro
 * acesso, e ela mora aqui — junto dos saldos — para a resposta chegar na
 * MESMA consulta que a barra lateral já faz em toda página. Antes ela era
 * uma segunda ida ao servidor, disparada só depois que o período voltava
 * zerado: no intervalo entre as duas a tela desenhava uma parede de zeros e
 * a trocava pela tela vazia meio segundo depois.
 *
 * `LIMIT 1` de propósito: a pergunta é "existe?", não "quantos?". Com
 * `transactions_company_idx` isso não cresce com o tamanho do razão.
 */
export async function temAlgumLancamento(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [linha] = await db
    .select({ um: sql<number>`1` })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
    ))
    .limit(1);

  return Boolean(linha);
}

export async function countOpenTitles(escopo: Escopo, todayIso: string, monthLastDay: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  const [row] = await db
    .select({
      open: sql<number>`COUNT(*)`,
      overdue: sql<number>`SUM(CASE WHEN ${financialTransactions.transactionDate} < ${todayIso} THEN 1 ELSE 0 END)`,
    })
    .from(financialTransactions)
    .where(and(
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
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

export async function getTransactionsByFingerprints(escopo: Escopo, fingerprints: string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!fingerprints.length) return [];
  const results: Array<{ fingerprint: string | null }> = [];
  for (const chunk of chunkImportRows(Array.from(new Set(fingerprints)))) {
    results.push(...await db.select({ fingerprint: financialTransactions.fingerprint }).from(financialTransactions).where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), inArray(financialTransactions.fingerprint, chunk))));
  }
  return results;
}

// ===========================================================================
// Conciliação bancária
// ===========================================================================

export async function listBankMovements(escopo: Escopo, accountId: number, start: string, end: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(bankMovements)
    .where(and(
      eq(bankMovements.userId, escopo.userId),
      eq(bankMovements.companyId, escopo.companyId),
      eq(bankMovements.accountId, accountId),
      gte(bankMovements.movementDate, start),
      lte(bankMovements.movementDate, end)
    ))
    .orderBy(desc(bankMovements.movementDate), desc(bankMovements.id));
}

export async function getBankMovement(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(bankMovements)
    .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.id, id))).limit(1);
  return rows[0];
}

export async function listReconciliationLinks(escopo: Escopo, movementIds: number[]) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (movementIds.length === 0) return [];
  return db.select().from(reconciliationLinks)
    .where(and(eq(reconciliationLinks.userId, escopo.userId), eq(reconciliationLinks.companyId, escopo.companyId), inArray(reconciliationLinks.movementId, movementIds)));
}

/**
 * Lançamentos da conta na janela que ainda não estão presos a nenhuma
 * movimentação. Só eles podem ser sugeridos: oferecer um lançamento já
 * conciliado seria propor conciliar a mesma coisa duas vezes.
 */
export async function listUnlinkedTransactions(escopo: Escopo, accountId: number, start: string, end: string) {
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
      eq(financialTransactions.userId, escopo.userId),
      eq(financialTransactions.companyId, escopo.companyId),
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
export async function getStatementBalance(escopo: Escopo, accountId: number, throughDate: string) {
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
        eq(transactionImportBatches.userId, escopo.userId),
        eq(transactionImportBatches.companyId, escopo.companyId),
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
        eq(statementBalances.userId, escopo.userId),
        eq(statementBalances.companyId, escopo.companyId),
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
export async function saveStatementBalance(escopo: Escopo, input: {
  accountId: number;
  asOf: string;
  balance: string;
  accountName: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    /*
     * Esta guarda foi inverificável até a Fase 5, e o dia previsto chegou.
     *
     * `statement_balances_account_date_uidx` era único em (userId, accountId,
     * asOf), sem `companyId`: o banco já garantia uma linha por trio e apagar a
     * guarda não mudava resultado nenhum. Com o índice apertado, duas empresas
     * do mesmo dono podem ter saldo na mesma conta e data — e aí é esta guarda,
     * sozinha, que decide qual delas o histórico vai citar.
     */
    const [anterior] = await tx
      .select({ balance: statementBalances.balance })
      .from(statementBalances)
      .where(and(
        eq(statementBalances.userId, escopo.userId),
        eq(statementBalances.companyId, escopo.companyId),
        eq(statementBalances.accountId, input.accountId),
        eq(statementBalances.asOf, input.asOf)
      ))
      .limit(1);

    await tx
      .insert(statementBalances)
      .values({
        userId: escopo.userId,
        companyId: escopo.companyId,
        accountId: input.accountId,
        asOf: input.asOf,
        balance: input.balance,
        informedBy: escopo.userId,
      })
      .onDuplicateKeyUpdate({ set: { balance: input.balance, informedBy: escopo.userId } });

    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
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
export async function linkMovement(escopo: Escopo, input: {
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
      userId: escopo.userId,
      companyId: escopo.companyId,
      movementId: input.movementId,
      transactionId: input.transactionId,
      amount: input.amount,
      origin: input.origin,
      createdBy: escopo.userId,
    });
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: escopo.userId })
      .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
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
export async function unlinkMovement(escopo: Escopo, input: {
  movementId: number;
  previousStatus: string;
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.delete(reconciliationLinks)
      .where(and(eq(reconciliationLinks.userId, escopo.userId), eq(reconciliationLinks.companyId, escopo.companyId), eq(reconciliationLinks.movementId, input.movementId)));
    await tx.update(bankMovements)
      .set({ status: "sem_par", classification: null, reconciledAt: null, reconciledBy: null })
      .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
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
export async function classifyMovement(escopo: Escopo, input: {
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
      .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
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
export async function createTransactionsForMovement(escopo: Escopo, input: {
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
      const [inserted] = await tx.insert(financialTransactions).values({ ...values, userId: escopo.userId, companyId: escopo.companyId });
      criados.push(Number(inserted.insertId));
    }
    await tx.insert(reconciliationLinks).values(
      criados.map((transactionId, index) => ({
        userId: escopo.userId,
        companyId: escopo.companyId,
        movementId: input.movementId,
        transactionId,
        amount: input.parts[index].linkAmount,
        origin: "manual" as const,
        createdBy: escopo.userId,
      }))
    );
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: escopo.userId })
      .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.id, input.movementId)));
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
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
export async function groupMovements(escopo: Escopo, input: {
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
        userId: escopo.userId,
        companyId: escopo.companyId,
        movementId,
        transactionId: input.transactionId,
        amount: input.amounts[index],
        origin: "manual" as const,
        createdBy: escopo.userId,
      }))
    );
    await tx.update(bankMovements)
      .set({ status: "conciliado", reconciledAt: new Date(), reconciledBy: escopo.userId })
      .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), inArray(bankMovements.id, input.movementIds)));
    for (const movementId of input.movementIds) {
      await tx.insert(reconciliationAudit).values({
        userId: escopo.userId,
        companyId: escopo.companyId,
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

export async function getReconciliationPeriod(escopo: Escopo, accountId: number, year: number, month: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(reconciliationPeriods)
    .where(and(
      eq(reconciliationPeriods.userId, escopo.userId),
      eq(reconciliationPeriods.companyId, escopo.companyId),
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
export async function listClosedReconciliationPeriods(escopo: Escopo) {
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
      eq(reconciliationPeriods.userId, escopo.userId),
      eq(reconciliationPeriods.companyId, escopo.companyId),
      isNull(reconciliationPeriods.reopenedAt)
    ));
}

export async function closeReconciliationPeriod(escopo: Escopo, input: {
  accountId: number;
  year: number;
  month: number;
  statementBalance: string;
  systemBalance: string;
  movementCount: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existing = await getReconciliationPeriod(escopo, input.accountId, input.year, input.month);

  await db.transaction(async tx => {
    if (existing) {
      await tx.update(reconciliationPeriods)
        .set({
          statementBalance: input.statementBalance,
          systemBalance: input.systemBalance,
          movementCount: input.movementCount,
          closedAt: new Date(),
          closedBy: escopo.userId,
          reopenedAt: null,
          reopenedBy: null,
          reopenReason: "",
        })
        .where(eq(reconciliationPeriods.id, existing.id));
    } else {
      await tx.insert(reconciliationPeriods).values({
        userId: escopo.userId,
        companyId: escopo.companyId,
        accountId: input.accountId,
        year: input.year,
        month: input.month,
        statementBalance: input.statementBalance,
        systemBalance: input.systemBalance,
        movementCount: input.movementCount,
        closedBy: escopo.userId,
      });
    }
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
      action: "fechar_periodo",
      previousStatus: "aberto",
      newStatus: "fechado",
      detail: `${String(input.month).padStart(2, "0")}/${input.year} · ${input.movementCount} movimentações`,
    });
  });
}

export async function reopenReconciliationPeriod(escopo: Escopo, input: {
  periodId: number;
  reason: string;
  detail: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  await db.transaction(async tx => {
    await tx.update(reconciliationPeriods)
      .set({ reopenedAt: new Date(), reopenedBy: escopo.userId, reopenReason: input.reason })
      .where(and(eq(reconciliationPeriods.userId, escopo.userId), eq(reconciliationPeriods.companyId, escopo.companyId), eq(reconciliationPeriods.id, input.periodId)));
    await tx.insert(reconciliationAudit).values({
      userId: escopo.userId,
      companyId: escopo.companyId,
      action: "reabrir_periodo",
      previousStatus: "fechado",
      newStatus: "aberto",
      detail: input.detail,
    });
  });
}

export async function listReconciliationAudit(escopo: Escopo, movementId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(reconciliationAudit)
    .where(and(eq(reconciliationAudit.userId, escopo.userId), eq(reconciliationAudit.companyId, escopo.companyId), eq(reconciliationAudit.movementId, movementId)))
    .orderBy(desc(reconciliationAudit.createdAt))
    .limit(50);
}

export async function createImportBatch(escopo: Escopo, input: {
  id: string;
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
      userId: escopo.userId,
      companyId: escopo.companyId,
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
          userId: escopo.userId,
          companyId: escopo.companyId,
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
      await tx
        .insert(bankMovements)
        .values(chunk.map(transaction => ({
          userId: escopo.userId,
          companyId: escopo.companyId,
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
        })))
        /*
         * Reimportar uma linha cujo lançamento foi removido reaproveita o lado
         * imutável do extrato em vez de falhar no índice por fingerprint. Os
         * valores vêm da própria linha que colidiu; userId, companyId e id não
         * entram no SET para uma digital nunca mover dado entre empresas.
         *
         * `importBatchId` é indispensável: a leitura logo abaixo monta os
         * vínculos filtrando pelo lote atual. Sem atualizá-lo, a importação
         * pareceria concluir, mas deixaria o novo lançamento sem conciliação.
         */
        .onDuplicateKeyUpdate({
          set: {
            accountId: sql`VALUES(${bankMovements.accountId})`,
            movementDate: sql`VALUES(${bankMovements.movementDate})`,
            description: sql`VALUES(${bankMovements.description})`,
            contact: sql`VALUES(${bankMovements.contact})`,
            amount: sql`VALUES(${bankMovements.amount})`,
            status: "conciliado",
            classification: null,
            classificationNote: "",
            relatedMovementId: null,
            importBatchId: sql`VALUES(${bankMovements.importBatchId})`,
            externalId: sql`VALUES(${bankMovements.externalId})`,
            reconciledAt: sql`VALUES(${bankMovements.reconciledAt})`,
            reconciledBy: null,
          },
        });
    }

    // Os ids saem de leitura, não do insertId: o autoincrement do TiDB é
    // alocado por faixa e adivinhar a sequência de um insert em lote daria
    // vínculo trocado.
    /*
     * Defesa em profundidade, e o aperto da Fase 5 mudou o que isso significa
     * aqui — só que não do jeito que eu tinha escrito.
     *
     * O filtro é `importBatchId`, que é UUID: no fluxo normal ele sozinho já
     * isola o lote, e a guarda de empresa não muda resultado nenhum, com índice
     * apertado ou não. O que o aperto mudou foi a POSSIBILIDADE do estado
     * perigoso: enquanto a digital era única por dono, duas linhas do mesmo
     * dono com o mesmo `fingerprint` não podiam existir. Agora podem — é o
     * caso de uso de importar o mesmo extrato em duas empresas.
     *
     * Daí em diante basta um `importBatchId` repetido entre empresas para o
     * mapa por digital abaixo casar a linha errada, e o estrago não é leitura:
     * é VÍNCULO DE CONCILIAÇÃO gravado prendendo a movimentação ao lançamento
     * da outra empresa. O arreio semeia exatamente esse estado.
     */
    const [ledger, statement] = await Promise.all([
      tx.select({ id: financialTransactions.id, fingerprint: financialTransactions.fingerprint })
        .from(financialTransactions)
        .where(and(eq(financialTransactions.userId, escopo.userId), eq(financialTransactions.companyId, escopo.companyId), eq(financialTransactions.importBatchId, input.id))),
      tx.select({ id: bankMovements.id, fingerprint: bankMovements.fingerprint })
        .from(bankMovements)
        .where(and(eq(bankMovements.userId, escopo.userId), eq(bankMovements.companyId, escopo.companyId), eq(bankMovements.importBatchId, input.id))),
    ]);

    const transactionByFingerprint = new Map(ledger.map(row => [row.fingerprint, row.id]));
    const amountByFingerprint = new Map(input.transactions.map(row => [row.fingerprint, row.amount]));
    const links = statement
      .map(movement => {
        const transactionId = transactionByFingerprint.get(movement.fingerprint);
        if (!transactionId) return null;
        return {
          userId: escopo.userId,
          companyId: escopo.companyId,
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

export async function listImportBatches(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(transactionImportBatches).where(and(eq(transactionImportBatches.userId, escopo.userId), eq(transactionImportBatches.companyId, escopo.companyId))).orderBy(desc(transactionImportBatches.createdAt)).limit(12);
}

export async function listPatrimonialItems(escopo: Escopo) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, escopo.userId), eq(patrimonialItems.companyId, escopo.companyId)))
    .orderBy(desc(patrimonialItems.isActive), patrimonialItems.balanceGroup, patrimonialItems.name);
}

export async function getPatrimonialItem(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, escopo.userId), eq(patrimonialItems.companyId, escopo.companyId), eq(patrimonialItems.id, id)))
    .limit(1);
  return rows[0];
}

export async function getPatrimonialItemByName(escopo: Escopo, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db
    .select()
    .from(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, escopo.userId), eq(patrimonialItems.companyId, escopo.companyId), eq(patrimonialItems.name, name)))
    .limit(1);
  return rows[0];
}

export async function createPatrimonialItem(
  escopo: Escopo,
  values: Omit<InsertPatrimonialItem, "userId" | "companyId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(patrimonialItems).values({ ...values, userId: escopo.userId, companyId: escopo.companyId });
  return getPatrimonialItem(escopo, Number(result[0].insertId));
}

/*
 * `companyId` e `id` ficam FORA do que se aceita, e não é zelo: este `.set()`
 * recebe o objeto do chamador inteiro. O `WHERE` confere a empresa, o `SET`
 * não conferia nada — então `{ companyId: outra }` movia o item para qualquer
 * empresa, inclusive de outro dono, gravando a linha de `userId` seu com
 * `companyId` alheio. É o "dono cruzado" que a conferência da Fase 5 conta.
 *
 * Ninguém chamava assim: o `balanceSheet.ts` passa um schema zod que não tem
 * essas chaves. Mas isso era segurança do chamador, não do tipo — e a decisão
 * da Fase 6 é que lançamento não muda de empresa. Agora o compilador recusa.
 */
export async function updatePatrimonialItem(
  escopo: Escopo,
  id: number,
  values: Partial<Omit<InsertPatrimonialItem, "userId" | "companyId" | "id">>
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(patrimonialItems)
    .set(values)
    .where(and(eq(patrimonialItems.userId, escopo.userId), eq(patrimonialItems.companyId, escopo.companyId), eq(patrimonialItems.id, id)));
  return getPatrimonialItem(escopo, id);
}

export async function deletePatrimonialItem(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .delete(patrimonialItems)
    .where(and(eq(patrimonialItems.userId, escopo.userId), eq(patrimonialItems.companyId, escopo.companyId), eq(patrimonialItems.id, id)));
}

export async function listBalanceSheetSnapshots(escopo: Escopo, limit = 24) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select()
    .from(balanceSheetSnapshots)
    .where(and(eq(balanceSheetSnapshots.userId, escopo.userId), eq(balanceSheetSnapshots.companyId, escopo.companyId)))
    .orderBy(desc(balanceSheetSnapshots.referenceDate))
    .limit(limit);
}

export async function upsertBalanceSheetSnapshot(
  escopo: Escopo,
  values: Omit<InsertBalanceSheetSnapshot, "userId" | "companyId">
) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .insert(balanceSheetSnapshots)
    .values({ ...values, userId: escopo.userId, companyId: escopo.companyId })
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
      eq(balanceSheetSnapshots.userId, escopo.userId),
      /*
       * Antes da Fase 5 esta guarda não podia ser provada, e o índice que a
       * tornava inútil era o mesmo que APAGAVA dado: fechar o mês na segunda
       * empresa reescrevia o fechamento da primeira, porque a gravação logo
       * acima usa `onDuplicateKeyUpdate`. Com (userId, companyId,
       * referenceDate), cada empresa tem o seu — e é esta guarda que devolve o
       * certo.
       */
      eq(balanceSheetSnapshots.companyId, escopo.companyId),
      eq(balanceSheetSnapshots.referenceDate, values.referenceDate)
    ))
    .limit(1);
  return rows[0];
}

export async function deleteBalanceSheetSnapshot(escopo: Escopo, id: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .delete(balanceSheetSnapshots)
    .where(and(eq(balanceSheetSnapshots.userId, escopo.userId), eq(balanceSheetSnapshots.companyId, escopo.companyId), eq(balanceSheetSnapshots.id, id)));
}

/* ── Acessos: convites e vínculos — Fase C do acesso do contador ─────────────
 *
 * Todas por ATOR, e todas conferem a posse de cada empresa contra
 * `companyProfiles.userId` antes de tocar em qualquer linha. O convite é do
 * dono para VÁRIAS empresas dele, então não cabe num `Escopo` — que é uma
 * empresa só. É por isso que recebem `atorId` e constam na lista fechada do
 * `guardas.test.ts`, com o motivo escrito lá.
 */

export class EmpresaNaoEDoAtor extends Error {
  constructor() { super("Uma das empresas não é sua."); }
}
export class ConviteInvalido extends Error {
  constructor(message = "Este convite não vale mais.") { super(message); }
}
export class ConviteDeOutroEmail extends Error {
  constructor(public readonly emailConvidado: string) {
    super(`Este convite foi enviado para ${emailConvidado}. Entre com essa conta para aceitá-lo.`);
  }
}

/** As empresas do ator entre as pedidas — e só elas. Vazio quando alguma não é dele. */
async function empresasProprias(tx: Pick<Awaited<ReturnType<typeof getDb>> & object, "select">, atorId: number, companyIds: readonly number[]) {
  if (companyIds.length === 0) return [];
  const proprias = await tx
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.userId, atorId), inArray(companyProfiles.id, [...companyIds])));
  return proprias.map(e => e.id);
}

/**
 * Cria um convite: uma linha por empresa, mesmo lote, mesmo hash.
 *
 * Reenviar é criar de novo: as linhas vivas anteriores do mesmo par
 * (dono, e-mail) ganham `revokedAt` na mesma transação, então nunca há dois
 * convites valendo para a mesma pessoa. Quem clicar no e-mail antigo recebe
 * "este convite não vale mais" — e o novo funciona.
 */
export async function criarConvite(atorId: number, dados: {
  email: string;
  companyIds: readonly number[];
  lote: string;
  tokenHash: string;
  expiresAt: Date;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const ids = Array.from(new Set(dados.companyIds));
  if (ids.length === 0) throw new EmpresaNaoEDoAtor();

  await db.transaction(async tx => {
    const proprias = await empresasProprias(tx, atorId, ids);
    if (proprias.length !== ids.length) throw new EmpresaNaoEDoAtor();

    await tx
      .update(companyInvites)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(companyInvites.invitedBy, atorId),
        eq(companyInvites.email, dados.email),
        isNull(companyInvites.acceptedAt),
        isNull(companyInvites.revokedAt),
      ));

    await tx.insert(companyInvites).values(ids.map(companyId => ({
      lote: dados.lote,
      email: dados.email,
      companyId,
      invitedBy: atorId,
      tokenHash: dados.tokenHash,
      expiresAt: dados.expiresAt,
    })));
  });
}

/** Os convites do dono ainda em aberto, com o nome de cada empresa. */
export async function listarConvitesPendentes(atorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      lote: companyInvites.lote,
      email: companyInvites.email,
      companyId: companyInvites.companyId,
      legalName: companyProfiles.legalName,
      tradeName: companyProfiles.tradeName,
      expiresAt: companyInvites.expiresAt,
      createdAt: companyInvites.createdAt,
    })
    .from(companyInvites)
    .innerJoin(companyProfiles, eq(companyProfiles.id, companyInvites.companyId))
    .where(and(
      eq(companyInvites.invitedBy, atorId),
      eq(companyProfiles.userId, atorId),
      isNull(companyInvites.acceptedAt),
      isNull(companyInvites.revokedAt),
      gt(companyInvites.expiresAt, new Date()),
    ))
    .orderBy(desc(companyInvites.createdAt), asc(companyInvites.companyId));
}

/** Cancela um convite em aberto. Só o dono que convidou alcança o lote. */
export async function revogarConvite(atorId: number, lote: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db
    .update(companyInvites)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(companyInvites.invitedBy, atorId),
      eq(companyInvites.lote, lote),
      isNull(companyInvites.acceptedAt),
      isNull(companyInvites.revokedAt),
    ));
}

/**
 * As linhas de um token, em qualquer estado, com o que a tela de aceite mostra.
 *
 * Devolve inclusive aceitas e revogadas: é o router que decide, com
 * `conviteValido`, e é `motivoDaRecusa` que explica. Filtrar aqui faria "já
 * aceito" e "token errado" virarem a mesma resposta vazia.
 */
export async function convitePorToken(tokenHash: string) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      id: companyInvites.id,
      lote: companyInvites.lote,
      email: companyInvites.email,
      companyId: companyInvites.companyId,
      invitedBy: companyInvites.invitedBy,
      expiresAt: companyInvites.expiresAt,
      acceptedAt: companyInvites.acceptedAt,
      revokedAt: companyInvites.revokedAt,
      legalName: companyProfiles.legalName,
      tradeName: companyProfiles.tradeName,
      nomeDoDono: users.name,
    })
    .from(companyInvites)
    .innerJoin(companyProfiles, eq(companyProfiles.id, companyInvites.companyId))
    .innerJoin(users, eq(users.id, companyInvites.invitedBy))
    .where(eq(companyInvites.tokenHash, tokenHash))
    .orderBy(asc(companyInvites.companyId));
}

/**
 * Aceita o convite: grava o vínculo do ATOR em cada empresa e carimba o aceite.
 *
 * Tudo numa transação, e a validade é conferida DENTRO dela: dois cliques
 * simultâneos no mesmo link não podem gerar dois vínculos. O e-mail do ator
 * tem que ser o convidado — é a única prova de que o link chegou a quem devia.
 *
 * Um vínculo vivo que já exista para o par (ator, empresa) não é duplicado; o
 * aceite ainda vale, porque o convite pode cobrir uma empresa nova e uma que
 * a pessoa já via.
 */
export async function aceitarConvite(atorId: number, dados: { tokenHash: string; email: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const agora = new Date();

  return db.transaction(async tx => {
    const linhas = await tx
      .select()
      .from(companyInvites)
      .where(eq(companyInvites.tokenHash, dados.tokenHash))
      .for("update");

    const vivas = linhas.filter(l => l.acceptedAt === null && l.revokedAt === null && l.expiresAt.getTime() > agora.getTime());
    if (linhas.length === 0 || vivas.length !== linhas.length) throw new ConviteInvalido();
    if (linhas[0]!.email !== dados.email) throw new ConviteDeOutroEmail(linhas[0]!.email);
    if (linhas[0]!.invitedBy === atorId) throw new ConviteInvalido("Você é o dono destas empresas — não precisa de convite.");

    const companyIds = Array.from(new Set(linhas.map(l => l.companyId)));
    const existentes = await tx
      .select({ companyId: companyAccess.companyId })
      .from(companyAccess)
      .where(and(eq(companyAccess.userId, atorId), inArray(companyAccess.companyId, companyIds), isNull(companyAccess.revokedAt)));
    const jaTem = new Set(existentes.map(e => e.companyId));

    const novos = companyIds.filter(id => !jaTem.has(id));
    if (novos.length > 0) {
      await tx.insert(companyAccess).values(novos.map(companyId => ({
        userId: atorId,
        companyId,
        role: "contador" as const,
        grantedBy: linhas[0]!.invitedBy,
      })));
    }

    await tx
      .update(companyInvites)
      .set({ acceptedAt: agora })
      .where(and(eq(companyInvites.tokenHash, dados.tokenHash), isNull(companyInvites.acceptedAt)));

    return { companyIds };
  });
}

/**
 * Quem tem acesso às empresas do dono: um vínculo vivo por linha, com quem é a
 * pessoa e qual é a empresa. A tela agrupa por pessoa.
 */
export async function listarAcessos(atorId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({
      id: companyAccess.id,
      contadorId: companyAccess.userId,
      nome: users.name,
      email: users.email,
      companyId: companyAccess.companyId,
      legalName: companyProfiles.legalName,
      tradeName: companyProfiles.tradeName,
      role: companyAccess.role,
      desde: companyAccess.createdAt,
    })
    .from(companyAccess)
    .innerJoin(companyProfiles, eq(companyProfiles.id, companyAccess.companyId))
    .innerJoin(users, eq(users.id, companyAccess.userId))
    .where(and(eq(companyProfiles.userId, atorId), isNull(companyAccess.revokedAt)))
    .orderBy(asc(users.email), asc(companyAccess.companyId));
}

/**
 * Tira o acesso de uma pessoa a UMA empresa do dono. Revogar é carimbar: a
 * linha fica, com `revokedAt`, e `empresasVisiveisPara` deixa de devolvê-la
 * no request seguinte.
 */
export async function revogarAcesso(atorId: number, dados: { contadorId: number; companyId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.transaction(async tx => {
    const proprias = await empresasProprias(tx, atorId, [dados.companyId]);
    if (proprias.length !== 1) throw new EmpresaNaoEDoAtor();
    await tx
      .update(companyAccess)
      .set({ revokedAt: new Date() })
      .where(and(
        eq(companyAccess.companyId, dados.companyId),
        eq(companyAccess.userId, dados.contadorId),
        isNull(companyAccess.revokedAt),
      ));
  });
}

/**
 * De que empresa é este anexo — pela linha que aponta para a chave.
 *
 * Lançamentos e bens guardam `attachmentKey`; a chave é única por upload
 * (carimbo de tempo mais nome), então a primeira linha que casar decide.
 * Null quando nenhuma linha aponta: um anexo enviado e nunca gravado numa
 * linha só o dono alcança, pelo prefixo.
 */
export async function empresaDoAnexo(key: string): Promise<number | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [lancamento] = await db
    .select({ companyId: financialTransactions.companyId })
    .from(financialTransactions)
    .where(eq(financialTransactions.attachmentKey, key))
    .limit(1);
  if (lancamento) return lancamento.companyId;
  const [bem] = await db
    .select({ companyId: patrimonialItems.companyId })
    .from(patrimonialItems)
    .where(eq(patrimonialItems.attachmentKey, key))
    .limit(1);
  return bem?.companyId ?? null;
}
