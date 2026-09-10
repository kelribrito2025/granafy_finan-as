/*
 * Fase 5 · o aperto.
 *
 * A ORDEM DESTE ARQUIVO FOI TROCADA À MÃO, e é a única coisa que muda em
 * relação ao que o drizzle-kit gerou. Os comandos são exatamente os mesmos,
 * um a um: 9 índices novos, 10 antigos removidos, 13 colunas apertadas.
 *
 * O gerador põe todos os DROP primeiro. Isso abriria uma janela de 23
 * comandos em que NENHUMA destas tabelas teria unicidade — e a janela é
 * justamente o tempo em que o app segue no ar aceitando escrita. Um lançamento
 * duplicado que entrasse ali sobreviveria ao índice novo, porque índice só
 * impede o que vem depois dele.
 *
 * Invertido: cada índice novo nasce ANTES de o antigo morrer. Em nenhum
 * instante a tabela fica sem proteção, e é por isso que
 * `reconciliation_periods_uidx` virou `reconciliation_periods_company_uidx` —
 * dois índices não podem dividir o mesmo nome enquanto os dois existem.
 *
 * O NOT NULL vem por último de propósito: ele é o único comando que pode falhar
 * por causa dos dados, e falhar depois dos índices deixa o banco num estado que
 * o próximo passo conserta. O backfill das linhas órfãs NÃO está aqui — roda na
 * sentada, com contagem antes e depois, como na Fase 2.
 */
ALTER TABLE `balanceSheetSnapshots` ADD CONSTRAINT `balance_sheet_snapshots_company_date_uidx` UNIQUE(`userId`,`companyId`,`referenceDate`);
--> statement-breakpoint
ALTER TABLE `bankMovements` ADD CONSTRAINT `bank_movements_company_fingerprint_uidx` UNIQUE(`userId`,`companyId`,`fingerprint`);
--> statement-breakpoint
ALTER TABLE `costCenters` ADD CONSTRAINT `cost_centers_company_name_uidx` UNIQUE(`userId`,`companyId`,`name`);
--> statement-breakpoint
ALTER TABLE `financialAccounts` ADD CONSTRAINT `financial_accounts_company_name_uidx` UNIQUE(`userId`,`companyId`,`name`);
--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD CONSTRAINT `patrimonial_items_company_name_uidx` UNIQUE(`userId`,`companyId`,`name`);
--> statement-breakpoint
ALTER TABLE `reconciliationPeriods` ADD CONSTRAINT `reconciliation_periods_company_uidx` UNIQUE(`userId`,`companyId`,`accountId`,`year`,`month`);
--> statement-breakpoint
ALTER TABLE `statementBalances` ADD CONSTRAINT `statement_balances_company_date_uidx` UNIQUE(`userId`,`companyId`,`accountId`,`asOf`);
--> statement-breakpoint
ALTER TABLE `transactionCategories` ADD CONSTRAINT `transaction_categories_company_name_uidx` UNIQUE(`userId`,`companyId`,`name`);
--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_company_fingerprint_uidx` UNIQUE(`userId`,`companyId`,`fingerprint`);
--> statement-breakpoint
ALTER TABLE `balanceSheetSnapshots` DROP INDEX `balance_sheet_snapshots_user_date_uidx`;
--> statement-breakpoint
ALTER TABLE `bankMovements` DROP INDEX `bank_movements_user_fingerprint_uidx`;
--> statement-breakpoint
ALTER TABLE `companyProfiles` DROP INDEX `company_profiles_user_uidx`;
--> statement-breakpoint
ALTER TABLE `costCenters` DROP INDEX `cost_centers_user_name_uidx`;
--> statement-breakpoint
ALTER TABLE `financialAccounts` DROP INDEX `financial_accounts_user_name_uidx`;
--> statement-breakpoint
ALTER TABLE `patrimonialItems` DROP INDEX `patrimonial_items_user_name_uidx`;
--> statement-breakpoint
ALTER TABLE `reconciliationPeriods` DROP INDEX `reconciliation_periods_uidx`;
--> statement-breakpoint
ALTER TABLE `statementBalances` DROP INDEX `statement_balances_account_date_uidx`;
--> statement-breakpoint
ALTER TABLE `transactionCategories` DROP INDEX `transaction_categories_user_name_uidx`;
--> statement-breakpoint
ALTER TABLE `transactions` DROP INDEX `transactions_user_fingerprint_uidx`;
--> statement-breakpoint
ALTER TABLE `balanceSheetSnapshots` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `bankMovements` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `categoryRules` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `costCenters` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `financialAccounts` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `patrimonialItems` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `reconciliationAudit` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `reconciliationLinks` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `reconciliationPeriods` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `statementBalances` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `transactionCategories` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `transactionImportBatches` MODIFY COLUMN `companyId` int NOT NULL;
--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `companyId` int NOT NULL;
