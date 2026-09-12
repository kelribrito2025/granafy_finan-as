/*
 * As consultas do admin do sistema.
 *
 * Elas atravessam empresas e usuários DE PROPÓSITO: o admin enxerga o sistema
 * inteiro, não uma conta. Por isso moram aqui, e não em `db.ts` — lá toda
 * consulta é filtrada pelo Escopo e a sentinela (`guardas.test.ts`) prova
 * isso linha a linha. Uma consulta sem escopo dentro de `db.ts` seria um
 * buraco; aqui é a regra. Só o `adminRouter` chama este arquivo, e só depois
 * do `adminProcedure` conferir `role = admin`.
 *
 * Nada aqui escreve. O que o admin altera (assinaturas, notas) chega na
 * sentada seguinte, com tabela própria.
 */
import { and, count, desc, eq, gte, like, lt, max, or, sql } from "drizzle-orm";
import {
  balanceSheetSnapshots,
  companyProfiles,
  financialAccounts,
  reconciliationLinks,
  transactionImportBatches,
  transactions,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

async function conexao() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

function diasAtras(dias: number) {
  return new Date(Date.now() - dias * 24 * 60 * 60_000);
}

/** Um número por empresa, a partir de um GROUP BY. */
async function contagemPorEmpresa(tabela: typeof financialAccounts | typeof transactions | typeof reconciliationLinks | typeof balanceSheetSnapshots) {
  const db = await conexao();
  const linhas = await db
    .select({ companyId: tabela.companyId, n: count() })
    .from(tabela)
    .groupBy(tabela.companyId);
  return new Map(linhas.map(l => [l.companyId, Number(l.n)]));
}

async function importacoesPorEmpresa() {
  const db = await conexao();
  const linhas = await db
    .select({ companyId: transactionImportBatches.companyId, n: count(), ultima: max(transactionImportBatches.createdAt) })
    .from(transactionImportBatches)
    .groupBy(transactionImportBatches.companyId);
  return new Map(linhas.map(l => [l.companyId, { n: Number(l.n), ultima: l.ultima }]));
}

/* ── Visão geral ────────────────────────────────────────────────────────── */

export async function resumoDoSistema() {
  const db = await conexao();
  const [empresas] = await db.select({ total: count(), ativas: sql<number>`sum(case when ${companyProfiles.isActive} then 1 else 0 end)` }).from(companyProfiles);
  const [pessoas] = await db.select({
    total: count(),
    novas30d: sql<number>`sum(case when ${users.createdAt} >= ${diasAtras(30)} then 1 else 0 end)`,
    semAcesso14d: sql<number>`sum(case when ${users.lastSignedIn} < ${diasAtras(14)} then 1 else 0 end)`,
    ativas7d: sql<number>`sum(case when ${users.lastSignedIn} >= ${diasAtras(7)} then 1 else 0 end)`,
  }).from(users);

  /* Empresa com mais de 5 dias e nenhuma importação: o gargalo de ativação. */
  const importacoes = await importacoesPorEmpresa();
  const antigas = await db
    .select({ id: companyProfiles.id })
    .from(companyProfiles)
    .where(and(eq(companyProfiles.isActive, true), lt(companyProfiles.createdAt, diasAtras(5))));
  const nuncaImportaram = antigas.filter(e => !importacoes.has(e.id)).length;

  const ultimos = await db
    .select({
      id: companyProfiles.id,
      legalName: companyProfiles.legalName,
      tradeName: companyProfiles.tradeName,
      createdAt: companyProfiles.createdAt,
      isActive: companyProfiles.isActive,
      titular: users.name,
      email: users.email,
    })
    .from(companyProfiles)
    .innerJoin(users, eq(users.id, companyProfiles.userId))
    .orderBy(desc(companyProfiles.createdAt))
    .limit(6);

  return {
    atualizadoEm: new Date(),
    empresas: { total: Number(empresas.total), ativas: Number(empresas.ativas ?? 0) },
    usuarios: {
      total: Number(pessoas.total),
      novas30d: Number(pessoas.novas30d ?? 0),
      semAcesso14d: Number(pessoas.semAcesso14d ?? 0),
      ativas7d: Number(pessoas.ativas7d ?? 0),
    },
    nuncaImportaram,
    ultimosCadastros: ultimos,
  };
}

/* ── Contas ─────────────────────────────────────────────────────────────── */

export type SituacaoDeConta = "todas" | "ativas" | "arquivadas";

export async function listarContas({ busca, situacao }: { busca: string; situacao: SituacaoDeConta }) {
  const db = await conexao();
  const termo = busca.trim();
  const filtros = [
    situacao === "ativas" ? eq(companyProfiles.isActive, true) : undefined,
    situacao === "arquivadas" ? eq(companyProfiles.isActive, false) : undefined,
    termo
      ? or(
          like(companyProfiles.legalName, `%${termo}%`),
          like(companyProfiles.tradeName, `%${termo}%`),
          like(companyProfiles.taxId, `%${termo.replace(/\D/g, "") || termo}%`),
          like(users.email, `%${termo}%`),
          like(users.name, `%${termo}%`),
        )
      : undefined,
  ].filter(Boolean);

  const linhas = await db
    .select({
      id: companyProfiles.id,
      legalName: companyProfiles.legalName,
      tradeName: companyProfiles.tradeName,
      taxId: companyProfiles.taxId,
      isActive: companyProfiles.isActive,
      createdAt: companyProfiles.createdAt,
      userId: users.id,
      titular: users.name,
      email: users.email,
      ultimoAcesso: users.lastSignedIn,
    })
    .from(companyProfiles)
    .innerJoin(users, eq(users.id, companyProfiles.userId))
    .where(filtros.length ? and(...filtros) : undefined)
    .orderBy(desc(companyProfiles.createdAt))
    .limit(200);

  const [contas, lancamentos, importacoes] = await Promise.all([
    contagemPorEmpresa(financialAccounts),
    contagemPorEmpresa(transactions),
    importacoesPorEmpresa(),
  ]);
  const [totais] = await db.select({ total: count(), ativas: sql<number>`sum(case when ${companyProfiles.isActive} then 1 else 0 end)` }).from(companyProfiles);

  return {
    total: Number(totais.total),
    ativas: Number(totais.ativas ?? 0),
    itens: linhas.map(l => ({
      ...l,
      contasFinanceiras: contas.get(l.id) ?? 0,
      lancamentos: lancamentos.get(l.id) ?? 0,
      importacoes: importacoes.get(l.id)?.n ?? 0,
      ultimaImportacao: importacoes.get(l.id)?.ultima ?? null,
      /* Uma conta tem um login: o titular. Papéis chegam com a tabela deles. */
      usuarios: 1,
    })),
  };
}

export async function detalheDaConta(id: number) {
  const db = await conexao();
  const [empresa] = await db
    .select()
    .from(companyProfiles)
    .where(eq(companyProfiles.id, id))
    .limit(1);
  if (!empresa) return null;

  const [titular] = await db
    .select({ id: users.id, name: users.name, email: users.email, loginMethod: users.loginMethod, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn, role: users.role })
    .from(users)
    .where(eq(users.id, empresa.userId))
    .limit(1);

  const porEmpresa = eq(transactions.companyId, id);
  const [[fin], [lanc], [conc], [fech], importacoes] = await Promise.all([
    db.select({ n: count() }).from(financialAccounts).where(eq(financialAccounts.companyId, id)),
    db.select({
      n: count(),
      pendentes: sql<number>`sum(case when ${transactions.status} = 'Pendente' then 1 else 0 end)`,
      ultimo: max(transactions.createdAt),
    }).from(transactions).where(porEmpresa),
    db.select({ n: count() }).from(reconciliationLinks).where(eq(reconciliationLinks.companyId, id)),
    db.select({ n: count(), ultimo: max(balanceSheetSnapshots.referenceDate) }).from(balanceSheetSnapshots).where(eq(balanceSheetSnapshots.companyId, id)),
    db.select({
      id: transactionImportBatches.id,
      fileName: transactionImportBatches.fileName,
      format: transactionImportBatches.format,
      importedCount: transactionImportBatches.importedCount,
      duplicateCount: transactionImportBatches.duplicateCount,
      createdAt: transactionImportBatches.createdAt,
    }).from(transactionImportBatches).where(eq(transactionImportBatches.companyId, id)).orderBy(desc(transactionImportBatches.createdAt)).limit(10),
  ]);

  const { logoKey: _logoKey, ...cadastro } = empresa;
  return {
    empresa: cadastro,
    titular: titular ?? null,
    engajamento: {
      contasFinanceiras: Number(fin.n),
      lancamentos: Number(lanc.n),
      pendentes: Number(lanc.pendentes ?? 0),
      ultimoLancamento: lanc.ultimo ?? null,
      conciliadas: Number(conc.n),
      mesesFechados: Number(fech.n),
      ultimoFechamento: fech.ultimo ?? null,
    },
    importacoes,
  };
}

/* ── Usuários ───────────────────────────────────────────────────────────── */

export async function listarUsuarios({ busca }: { busca: string }) {
  const db = await conexao();
  const termo = busca.trim();
  const linhas = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      loginMethod: users.loginMethod,
      role: users.role,
      createdAt: users.createdAt,
      lastSignedIn: users.lastSignedIn,
      empresas: sql<number>`(select count(*) from ${companyProfiles} where ${companyProfiles.userId} = ${users.id})`,
    })
    .from(users)
    .where(termo ? or(like(users.name, `%${termo}%`), like(users.email, `%${termo}%`)) : undefined)
    .orderBy(desc(users.lastSignedIn))
    .limit(200);
  const [totais] = await db.select({ total: count(), admins: sql<number>`sum(case when ${users.role} = 'admin' then 1 else 0 end)`, ativos7d: sql<number>`sum(case when ${users.lastSignedIn} >= ${diasAtras(7)} then 1 else 0 end)` }).from(users);
  return {
    total: Number(totais.total),
    admins: Number(totais.admins ?? 0),
    ativos7d: Number(totais.ativos7d ?? 0),
    itens: linhas.map(l => ({ ...l, empresas: Number(l.empresas) })),
  };
}

/** O que a barra lateral do admin mostra ao lado dos itens. */
export async function contadoresDaBarra() {
  const db = await conexao();
  const [e] = await db.select({ n: count() }).from(companyProfiles);
  const [u] = await db.select({ n: count() }).from(users);
  return { contas: Number(e.n), usuarios: Number(u.n) };
}
