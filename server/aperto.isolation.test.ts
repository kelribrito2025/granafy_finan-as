import type { Connection, RowDataPacket } from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { conectarNoBancoDeTeste, limparTabelas, prepararSchemaDeTeste, temBancoDeTeste, usuarioDeTeste } from "./testDatabase";

/*
 * O ensaio da Fase 5, antes de a migration encostar em produção.
 *
 * `prepararSchemaDeTeste` aplica o journal inteiro no `granafy_test`, então
 * quando este arquivo roda a 0023 já passou por lá. Isso é metade da prova: os
 * trinta e dois comandos rodaram contra o MESMO dialeto de produção — TiDB, não
 * um MySQL de mentira nem um banco em memória.
 *
 * A outra metade é o que este arquivo verifica: que o mundo depois do aperto é o
 * mundo que a multiempresa precisa, e que o aperto não relaxou o que não devia.
 *
 * O backfill das órfãs NÃO é ensaiado aqui de novo: é o mesmo UPDATE da Fase 2,
 * e `backfillCompanies.isolation.test.ts` já prova que ele é repetível e não
 * cruza donos. Repetir prova dá sensação de segurança sem acrescentar nenhuma.
 */

const ANA = 6_600_001;
const EMPRESA_A = 6601;
const EMPRESA_B = 6602;

const TABELAS = [
  "balanceSheetSnapshots", "reconciliationAudit", "reconciliationLinks", "reconciliationPeriods",
  "statementBalances", "bankMovements", "transactionImportBatches", "transactions",
  "patrimonialItems", "categoryRules", "costCenters", "transactionCategories",
  "financialAccounts", "companyProfiles", "users",
] as const;
const DONOS = [ANA] as const;

/** As treze tabelas que ganharam `companyId` na Fase 2 e o apertaram na Fase 5. */
const COM_EMPRESA = [
  "financialAccounts", "transactionCategories", "costCenters", "categoryRules",
  "transactionImportBatches", "bankMovements", "reconciliationLinks", "reconciliationPeriods",
  "statementBalances", "reconciliationAudit", "transactions", "patrimonialItems",
  "balanceSheetSnapshots",
] as const;

/**
 * Tabelas com `companyId` que NÃO são dado da empresa: apontam para ela.
 * `companyAccess` (Fase A do acesso do contador) diz quem pode abrir qual
 * empresa — é vínculo, não razão, e por isso fica fora das treze e das guardas
 * de escopo. Entra aqui só para a contagem do banco de verdade fechar.
 */
const APONTAM_PARA_EMPRESA = ["companyAccess"] as const;

async function semear(c: Connection) {
  await c.query(
    "INSERT INTO users (id, openId, email, name, loginMethod) VALUES (?, ?, ?, ?, ?)",
    usuarioDeTeste(ANA, "Ana"),
  );
  /*
   * DUAS empresas para o MESMO login — e é a primeira vez em toda a migração
   * que esta linha roda. `company_profiles_user_uidx` recusava a segunda desde
   * a Fase 1, e barrou quatro arreios diferentes ao longo da Fase 4. O drop
   * dele é a fase inteira em um comando.
   */
  await c.query(
    `INSERT INTO companyProfiles (id, userId, legalName) VALUES (?, ?, 'Padaria'), (?, ?, 'Consultoria')`,
    [EMPRESA_A, ANA, EMPRESA_B, ANA],
  );
}

describe.runIf(temBancoDeTeste())("o aperto da Fase 5, ensaiado", () => {
  let c: Connection;

  beforeAll(async () => {
    c = await conectarNoBancoDeTeste();
    await prepararSchemaDeTeste(c);
  }, 60_000);

  afterAll(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await c?.end();
  });

  beforeEach(async () => {
    await limparTabelas(c, TABELAS, DONOS);
    await semear(c);
  });

  it("as treze colunas companyId são NOT NULL no banco de verdade", async () => {
    const [linhas] = await c.query<(RowDataPacket & { t: string; n: string })[]>(
      `SELECT table_name t, is_nullable n FROM information_schema.columns
        WHERE table_schema = DATABASE() AND column_name = 'companyId'`,
    );
    expect(linhas.map(l => l.t).sort()).toEqual([...COM_EMPRESA, ...APONTAM_PARA_EMPRESA].sort());
    expect(linhas.filter(l => l.n !== "NO").map(l => l.t)).toEqual([]);
  });

  it("o banco recusa uma linha sem empresa — não é mais um estado possível", async () => {
    await expect(c.query(
      "INSERT INTO financialAccounts (userId, name, institution, accountType, color, initialBalance) VALUES (?, 'Sem empresa', 'x', 'corrente', '#000000', '0')",
      [ANA],
    )).rejects.toThrow();
  });

  it("um login pode ter duas empresas — o que a Fase 1 proibia", async () => {
    const [linhas] = await c.query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) n FROM companyProfiles WHERE userId = ?", [ANA],
    );
    expect(Number(linhas[0]!.n)).toBe(2);
  });

  it("as duas empresas do mesmo dono repetem nome de cadastro à vontade", async () => {
    /*
     * Toda empresa tem uma categoria "Vendas" e um centro "Administrativo".
     * Enquanto os únicos eram por dono, a segunda empresa não podia ter os
     * seus — e a tela devolveria "já existe" apontando para algo que a pessoa
     * não vê na empresa em que está.
     */
    for (const empresa of [EMPRESA_A, EMPRESA_B]) {
      await c.query(
        "INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance) VALUES (?, ?, 'Itaú', 'Itaú', 'corrente', '#000000', '0')",
        [ANA, empresa],
      );
      await c.query(
        "INSERT INTO transactionCategories (userId, companyId, name, type) VALUES (?, ?, 'Vendas', 'entrada')",
        [ANA, empresa],
      );
      await c.query("INSERT INTO costCenters (userId, companyId, name) VALUES (?, ?, 'Administrativo')", [ANA, empresa]);
      await c.query(
        "INSERT INTO patrimonialItems (userId, companyId, name, itemType, balanceGroup, currentValue) VALUES (?, ?, 'Notebook', 'bem', 'ativo_nao_circulante', '1000.00')",
        [ANA, empresa],
      );
    }

    for (const tabela of ["financialAccounts", "transactionCategories", "costCenters", "patrimonialItems"]) {
      const [linhas] = await c.query<(RowDataPacket & { n: number })[]>(
        `SELECT COUNT(*) n FROM \`${tabela}\` WHERE userId = ?`, [ANA],
      );
      expect(Number(linhas[0]!.n), tabela).toBe(2);
    }
  });

  it("cada empresa fecha o mesmo mês sem apagar o fechamento da outra", async () => {
    /*
     * O defeito destrutivo que a sub-leva 4 achou. O `onDuplicateKeyUpdate`
     * batia na chave (userId, referenceDate): fechar setembro na segunda
     * empresa reescrevia o fechamento da primeira, sem erro e sem aviso.
     */
    for (const [empresa, total] of [[EMPRESA_A, "1000.00"], [EMPRESA_B, "2000.00"]] as const) {
      await c.query(
        "INSERT INTO balanceSheetSnapshots (userId, companyId, referenceDate, totalAssets, netWorth, itemCount) VALUES (?, ?, '2026-09-30', ?, ?, 1) ON DUPLICATE KEY UPDATE totalAssets = VALUES(totalAssets)",
        [ANA, empresa, total, total],
      );
    }

    const [linhas] = await c.query<(RowDataPacket & { companyId: number; totalAssets: string })[]>(
      "SELECT companyId, totalAssets FROM balanceSheetSnapshots WHERE userId = ? ORDER BY companyId", [ANA],
    );
    expect(linhas.map(l => [l.companyId, l.totalAssets])).toEqual([
      [EMPRESA_A, "1000.00"],
      [EMPRESA_B, "2000.00"],
    ]);
  });

  it("o mesmo extrato pode ser importado nas duas empresas", async () => {
    /* Mesma impressão digital, empresas diferentes: antes o segundo era duplicata. */
    for (const empresa of [EMPRESA_A, EMPRESA_B]) {
      await c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, amount, account, status, fingerprint)
           VALUES (?, ?, 'entrada', '2026-09-05', 'Do extrato', 'Vendas', '10.00', 'Itaú', 'Pago', 'mesma-digital')`,
        [ANA, empresa],
      );
    }
    const [linhas] = await c.query<(RowDataPacket & { n: number })[]>(
      "SELECT COUNT(*) n FROM transactions WHERE userId = ? AND fingerprint = 'mesma-digital'", [ANA],
    );
    expect(Number(linhas[0]!.n)).toBe(2);
  });

  // ── e o que NÃO pode ter relaxado ─────────────────────────────────────────

  it("dentro da MESMA empresa, o nome repetido continua recusado", async () => {
    /*
     * O defeito oposto, e o mais fácil de cometer numa migration de índice:
     * afrouxar até a unicidade sumir. A regra não mudou de existência, mudou de
     * alcance — é por empresa, não por login.
     */
    await c.query(
      "INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance) VALUES (?, ?, 'Itaú', 'Itaú', 'corrente', '#000000', '0')",
      [ANA, EMPRESA_A],
    );
    await expect(c.query(
      "INSERT INTO financialAccounts (userId, companyId, name, institution, accountType, color, initialBalance) VALUES (?, ?, 'Itaú', 'Itaú', 'corrente', '#000000', '0')",
      [ANA, EMPRESA_A],
    )).rejects.toThrow();
  });

  it("dentro da MESMA empresa, a mesma impressão digital continua recusada", async () => {
    for (const _ of [0]) {
      await c.query(
        `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, amount, account, status, fingerprint)
           VALUES (?, ?, 'entrada', '2026-09-05', 'Do extrato', 'Vendas', '10.00', 'Itaú', 'Pago', 'digital-unica')`,
        [ANA, EMPRESA_A],
      );
    }
    await expect(c.query(
      `INSERT INTO transactions (userId, companyId, type, transactionDate, description, category, amount, account, status, fingerprint)
         VALUES (?, ?, 'entrada', '2026-09-05', 'Do extrato', 'Vendas', '10.00', 'Itaú', 'Pago', 'digital-unica')`,
      [ANA, EMPRESA_A],
    )).rejects.toThrow();
  });

  it("os dez únicos antigos sumiram e os nove novos estão de pé", async () => {
    const [linhas] = await c.query<(RowDataPacket & { i: string; cols: string })[]>(
      `SELECT index_name i, GROUP_CONCAT(column_name ORDER BY seq_in_index) cols
         FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND non_unique = 0 AND index_name <> 'PRIMARY'
        GROUP BY table_name, index_name`,
    );
    const porNome = new Map(linhas.map(l => [l.i, l.cols]));

    for (const antigo of [
      "company_profiles_user_uidx", "financial_accounts_user_name_uidx",
      "transaction_categories_user_name_uidx", "cost_centers_user_name_uidx",
      "patrimonial_items_user_name_uidx", "transactions_user_fingerprint_uidx",
      "bank_movements_user_fingerprint_uidx", "balance_sheet_snapshots_user_date_uidx",
      "statement_balances_account_date_uidx", "reconciliation_periods_uidx",
    ]) {
      expect(porNome.has(antigo), antigo).toBe(false);
    }

    expect(porNome.get("financial_accounts_company_name_uidx")).toBe("userId,companyId,name");
    expect(porNome.get("balance_sheet_snapshots_company_date_uidx")).toBe("userId,companyId,referenceDate");
    expect(porNome.get("transactions_company_fingerprint_uidx")).toBe("userId,companyId,fingerprint");
    expect(porNome.get("reconciliation_periods_company_uidx")).toBe("userId,companyId,accountId,year,month");
  });
});
