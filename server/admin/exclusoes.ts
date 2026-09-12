/*
 * As exclusões do admin do sistema.
 *
 * Este é o único lugar do produto que apaga o dado de outra pessoa, e o
 * único que apaga sem nenhum filtro de escopo. Por isso mora aqui, longe do
 * `db.ts` — lá toda consulta é filtrada pelo Escopo e a sentinela prova isso
 * linha a linha. Só o `adminRouter` chama este arquivo, e só depois do
 * `adminProcedure` conferir `role = admin`.
 *
 * As três travas, todas do lado do servidor:
 *
 *  1. A prévia é obrigatória de fato — quem chama já viu, na tela, quantas
 *     linhas somem em cada tabela.
 *  2. A confirmação tem que bater com o nome da empresa (ou o e-mail do
 *     usuário) exatamente. Não é um "tem certeza?" que se clica no automático.
 *  3. Admin não apaga admin, e ninguém apaga a si mesmo.
 *
 * Não há desfazer. O backup do TiDB tem retenção de um dia.
 */
import { TRPCError } from "@trpc/server";
import { count, eq } from "drizzle-orm";
import type { MySqlColumn, MySqlTable } from "drizzle-orm/mysql-core";
import {
  balanceSheetSnapshots,
  bankMovements,
  categoryRules,
  companyProfiles,
  costCenters,
  financialAccounts,
  passwordResetRequests,
  patrimonialItems,
  reconciliationAudit,
  reconciliationLinks,
  reconciliationPeriods,
  statementBalances,
  transactionCategories,
  transactionImportBatches,
  transactions,
  userPreferences,
  users,
} from "../../drizzle/schema";
import { getDb } from "../db";

async function conexao() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

type Alvo = { rotulo: string; tabela: MySqlTable; empresa: MySqlColumn; usuario: MySqlColumn };

/*
 * Tudo que pertence a uma empresa, em ordem de leitura — é esta lista que a
 * tela mostra antes de perguntar. Toda tabela nova com `companyId` precisa
 * entrar aqui, senão a exclusão deixa órfão no banco.
 */
const DA_EMPRESA: Alvo[] = [
  { rotulo: "Lançamentos", tabela: transactions, empresa: transactions.companyId, usuario: transactions.userId },
  { rotulo: "Contas bancárias", tabela: financialAccounts, empresa: financialAccounts.companyId, usuario: financialAccounts.userId },
  { rotulo: "Categorias", tabela: transactionCategories, empresa: transactionCategories.companyId, usuario: transactionCategories.userId },
  { rotulo: "Centros de custo", tabela: costCenters, empresa: costCenters.companyId, usuario: costCenters.userId },
  { rotulo: "Regras de categorização", tabela: categoryRules, empresa: categoryRules.companyId, usuario: categoryRules.userId },
  { rotulo: "Importações de extrato", tabela: transactionImportBatches, empresa: transactionImportBatches.companyId, usuario: transactionImportBatches.userId },
  { rotulo: "Movimentações do extrato", tabela: bankMovements, empresa: bankMovements.companyId, usuario: bankMovements.userId },
  { rotulo: "Conciliações", tabela: reconciliationLinks, empresa: reconciliationLinks.companyId, usuario: reconciliationLinks.userId },
  { rotulo: "Meses conciliados", tabela: reconciliationPeriods, empresa: reconciliationPeriods.companyId, usuario: reconciliationPeriods.userId },
  { rotulo: "Saldos de extrato", tabela: statementBalances, empresa: statementBalances.companyId, usuario: statementBalances.userId },
  { rotulo: "Histórico da conciliação", tabela: reconciliationAudit, empresa: reconciliationAudit.companyId, usuario: reconciliationAudit.userId },
  { rotulo: "Itens patrimoniais", tabela: patrimonialItems, empresa: patrimonialItems.companyId, usuario: patrimonialItems.userId },
  { rotulo: "Fechamentos do balanço", tabela: balanceSheetSnapshots, empresa: balanceSheetSnapshots.companyId, usuario: balanceSheetSnapshots.userId },
];

/** O que é do login e não de nenhuma empresa. */
const DO_LOGIN: Array<{ rotulo: string; tabela: MySqlTable; usuario: MySqlColumn }> = [
  { rotulo: "Empresas", tabela: companyProfiles, usuario: companyProfiles.userId },
  { rotulo: "Preferências", tabela: userPreferences, usuario: userPreferences.userId },
  { rotulo: "Pedidos de redefinição de senha", tabela: passwordResetRequests, usuario: passwordResetRequests.userId },
];

export type LinhaDaPrevia = { rotulo: string; linhas: number };

async function contar(coluna: MySqlColumn, tabela: MySqlTable, valor: number) {
  const db = await conexao();
  const [linha] = await db.select({ n: count() }).from(tabela).where(eq(coluna, valor));
  return Number(linha?.n ?? 0);
}

/* ── Empresa ────────────────────────────────────────────────────────────── */

/**
 * O que a exclusão de uma empresa vai apagar, tabela a tabela. Só lê.
 * `confirmacao` é a frase que a pessoa vai ter que digitar.
 */
export async function previaDaExclusaoDaConta(id: number) {
  const db = await conexao();
  const [empresa] = await db
    .select({ id: companyProfiles.id, legalName: companyProfiles.legalName, tradeName: companyProfiles.tradeName, userId: companyProfiles.userId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, id))
    .limit(1);
  if (!empresa) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });

  const [titular] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, empresa.userId))
    .limit(1);

  const linhas: LinhaDaPrevia[] = [];
  for (const alvo of DA_EMPRESA) {
    linhas.push({ rotulo: alvo.rotulo, linhas: await contar(alvo.empresa, alvo.tabela, id) });
  }

  /* Quantas empresas sobram para o titular depois desta. */
  const [outras] = await db.select({ n: count() }).from(companyProfiles).where(eq(companyProfiles.userId, empresa.userId));

  return {
    empresa: { id: empresa.id, legalName: empresa.legalName, tradeName: empresa.tradeName },
    titular: titular ?? null,
    /* O login continua existindo: apagar a empresa não apaga a pessoa. */
    empresasRestantes: Math.max(0, Number(outras?.n ?? 1) - 1),
    linhas,
    total: linhas.reduce((soma, l) => soma + l.linhas, 0),
    confirmacao: empresa.legalName,
  };
}

export async function excluirConta({ id, confirmacao, ator }: { id: number; confirmacao: string; ator: number }) {
  const db = await conexao();
  const [empresa] = await db
    .select({ id: companyProfiles.id, legalName: companyProfiles.legalName, userId: companyProfiles.userId })
    .from(companyProfiles)
    .where(eq(companyProfiles.id, id))
    .limit(1);
  if (!empresa) throw new TRPCError({ code: "NOT_FOUND", message: "Empresa não encontrada." });
  if (confirmacao.trim() !== empresa.legalName.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A confirmação não bate com a razão social." });
  }

  const apagadas: LinhaDaPrevia[] = [];
  await db.transaction(async tx => {
    for (const alvo of DA_EMPRESA) {
      const resultado = await tx.delete(alvo.tabela).where(eq(alvo.empresa, id));
      apagadas.push({ rotulo: alvo.rotulo, linhas: linhasAfetadas(resultado) });
    }
    await tx.delete(companyProfiles).where(eq(companyProfiles.id, id));
  });

  const total = apagadas.reduce((soma, l) => soma + l.linhas, 0);
  console.warn(`[admin] empresa ${id} apagada por ${ator}: ${total} linhas em ${apagadas.filter(l => l.linhas > 0).length} tabelas`);
  return { empresa: empresa.legalName, apagadas, total };
}

/* ── Usuário ────────────────────────────────────────────────────────────── */

export async function previaDaExclusaoDoUsuario(id: number) {
  const db = await conexao();
  const [pessoa] = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });

  const empresas = await db
    .select({ id: companyProfiles.id, legalName: companyProfiles.legalName })
    .from(companyProfiles)
    .where(eq(companyProfiles.userId, id));

  const linhas: LinhaDaPrevia[] = [];
  for (const alvo of [...DO_LOGIN, ...DA_EMPRESA]) {
    linhas.push({ rotulo: alvo.rotulo, linhas: await contar(alvo.usuario, alvo.tabela, id) });
  }

  return {
    pessoa,
    empresas,
    linhas,
    total: linhas.reduce((soma, l) => soma + l.linhas, 0),
    /* O e-mail é a frase de confirmação; sem e-mail, o id. */
    confirmacao: pessoa.email ?? String(pessoa.id),
    /* O portão que a tela também mostra, para a recusa não ser surpresa. */
    admin: pessoa.role === "admin",
  };
}

export async function excluirUsuario({ id, confirmacao, ator }: { id: number; confirmacao: string; ator: number }) {
  const db = await conexao();
  if (id === ator) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode apagar o próprio login." });

  const [pessoa] = await db
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!pessoa) throw new TRPCError({ code: "NOT_FOUND", message: "Usuário não encontrado." });
  if (pessoa.role === "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin do sistema não é apagado pela tela. Tire o papel de admin primeiro." });
  }
  const frase = pessoa.email ?? String(pessoa.id);
  if (confirmacao.trim() !== frase.trim()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "A confirmação não bate com o e-mail do usuário." });
  }

  const apagadas: LinhaDaPrevia[] = [];
  await db.transaction(async tx => {
    /*
     * Por `userId`, não empresa por empresa: assim some também a linha que
     * ficou apontando para uma empresa que já não existe.
     */
    for (const alvo of [...DA_EMPRESA, ...DO_LOGIN]) {
      const resultado = await tx.delete(alvo.tabela).where(eq(alvo.usuario, id));
      apagadas.push({ rotulo: alvo.rotulo, linhas: linhasAfetadas(resultado) });
    }
    await tx.delete(users).where(eq(users.id, id));
  });

  const total = apagadas.reduce((soma, l) => soma + l.linhas, 0);
  console.warn(`[admin] usuário ${id} apagado por ${ator}: ${total} linhas em ${apagadas.filter(l => l.linhas > 0).length} tabelas`);
  return { pessoa: frase, apagadas, total };
}

/** O `affectedRows` do mysql2, que o drizzle devolve no primeiro elemento. */
function linhasAfetadas(resultado: unknown) {
  const cabeca = Array.isArray(resultado) ? resultado[0] : resultado;
  const n = (cabeca as { affectedRows?: number } | undefined)?.affectedRows;
  return typeof n === "number" ? n : 0;
}
