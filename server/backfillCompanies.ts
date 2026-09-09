/*
 * O backfill do `companyId`, escrito uma vez e usado nos dois lugares.
 *
 * Os comandos que o ritual roda em produção são exatamente estes, os mesmos
 * que o teste ensaia no `granafy_test`. Não há uma versão colada num terminal
 * e outra num arquivo: se divergissem, o ensaio deixaria de provar o que a
 * produção vai receber, e o ensaio é a única coisa entre 29 mil linhas e um
 * erro que só aparece depois.
 *
 * Só strings aqui. Quem abre conexão é o ritual ou o teste — este módulo é
 * inerte e pode ser lido inteiro antes de qualquer comando sair.
 */

/**
 * As treze tabelas que recebem `companyId`.
 *
 * A ordem é a de dependência de leitura: cadastros primeiro, movimento depois.
 * Não faz diferença para o resultado — cada UPDATE é independente — mas faz
 * para quem acompanha, que vê as tabelas pequenas fecharem antes das grandes.
 */
export const TABELAS_COM_EMPRESA = [
  "financialAccounts",
  "transactionCategories",
  "costCenters",
  "categoryRules",
  "transactionImportBatches",
  "patrimonialItems",
  "balanceSheetSnapshots",
  "reconciliationPeriods",
  "statementBalances",
  "reconciliationAudit",
  "bankMovements",
  "reconciliationLinks",
  "transactions",
] as const;

export type TabelaComEmpresa = (typeof TABELAS_COM_EMPRESA)[number];

/**
 * Recusa qualquer nome que não esteja na lista.
 *
 * Estes textos viram SQL cru — a tabela não pode ser parâmetro. A lista fixa é
 * o que impede um nome vindo de fora de virar comando.
 */
function exigirTabela(tabela: string): TabelaComEmpresa {
  if (!(TABELAS_COM_EMPRESA as readonly string[]).includes(tabela)) {
    throw new Error(`Tabela fora da lista do backfill: "${tabela}".`);
  }
  return tabela as TabelaComEmpresa;
}

/**
 * A empresa padrão de quem ainda não tem nenhuma.
 *
 * Campos vazios de propósito: `companyDisplayName` já resolve o rótulo na tela
 * a partir do nome do usuário. Gravar uma razão social inventada seria pior do
 * que não gravar nada — daqui a seis meses ela sairia num relatório como se
 * fosse dado informado.
 *
 * Roda ANTES de qualquer UPDATE. Um dono sem empresa não faz o backfill falhar:
 * o JOIN simplesmente ignora as linhas dele, em silêncio. Foi o que o ensaio no
 * banco de teste mostrou, e é por isso que a ordem não é negociável.
 */
export const EMPRESA_PADRAO_SQL = `
INSERT INTO companyProfiles (userId, legalName, tradeName, taxId, isActive, sortOrder)
SELECT u.id, '', '', '', true, 0
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM companyProfiles c WHERE c.userId = u.id)`.trim();

/**
 * A adoção das linhas de uma tabela pela empresa do dono.
 *
 * `WHERE companyId IS NULL` não é enfeite: é o que torna o comando repetível.
 * Se ele parar no meio, rodar de novo termina o serviço em vez de reescrever o
 * que já passou — e roda de novo de graça quando não há o que fazer.
 */
export function backfillSql(tabela: string) {
  const t = exigirTabela(tabela);
  return `
UPDATE \`${t}\` x
  JOIN companyProfiles c ON c.userId = x.userId
   SET x.companyId = c.id
 WHERE x.companyId IS NULL`.trim();
}

/** Quantas linhas ainda não têm empresa. Tem de chegar a zero. */
export function nulosSql(tabela: string) {
  const t = exigirTabela(tabela);
  return `SELECT COUNT(*) AS n FROM \`${t}\` WHERE companyId IS NULL`;
}

/**
 * A invariante que importa: nenhuma linha com a empresa de OUTRO dono.
 *
 * As contagens provam que o backfill rodou. Esta prova que ele rodou certo.
 * Um `JOIN` errado, um `ON` trocado ou um dono com duas empresas apareceriam
 * aqui e em nenhum outro lugar — e apareceriam como um número plausível em
 * toda tela do produto.
 *
 * Precisa dar zero nas treze tabelas. Não "quase zero".
 */
export function donoCruzadoSql(tabela: string) {
  const t = exigirTabela(tabela);
  return `
SELECT COUNT(*) AS n
  FROM \`${t}\` x
  JOIN companyProfiles c ON c.id = x.companyId
 WHERE c.userId <> x.userId`.trim();
}

/** O total de linhas da tabela, para conferir antes e depois. */
export function totalSql(tabela: string) {
  const t = exigirTabela(tabela);
  return `SELECT COUNT(*) AS n FROM \`${t}\``;
}

/** Logins que ficariam de fora do backfill — tem de ser vazio antes de começar. */
export const LOGINS_SEM_EMPRESA_SQL = `
SELECT u.id, u.name
  FROM users u
 WHERE NOT EXISTS (SELECT 1 FROM companyProfiles c WHERE c.userId = u.id)`.trim();
