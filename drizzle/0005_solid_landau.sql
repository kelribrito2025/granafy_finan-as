CREATE TABLE `financialAccounts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`institution` varchar(100) NOT NULL DEFAULT '',
	`accountType` enum('corrente','poupanca','carteira','cartao','gateway','outro') NOT NULL DEFAULT 'corrente',
	`color` varchar(7) NOT NULL DEFAULT '#12B85C',
	`initialBalance` decimal(15,2) NOT NULL DEFAULT '0.00',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `financialAccounts_id` PRIMARY KEY(`id`),
	CONSTRAINT `financial_accounts_user_name_uidx` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `transactionCategories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`type` enum('entrada','saida','ambos') NOT NULL DEFAULT 'ambos',
	`color` varchar(7) NOT NULL DEFAULT '#4C6355',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactionCategories_id` PRIMARY KEY(`id`),
	CONSTRAINT `transaction_categories_user_name_uidx` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `transactionImportBatches` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`format` enum('csv','ofx') NOT NULL,
	`accountId` int NOT NULL,
	`importedCount` int NOT NULL DEFAULT 0,
	`duplicateCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `transactionImportBatches_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `transactions` ADD `accountId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `categoryId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `importBatchId` varchar(36);--> statement-breakpoint
ALTER TABLE `transactions` ADD `externalId` varchar(160);--> statement-breakpoint
ALTER TABLE `transactions` ADD `fingerprint` varchar(64);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_user_fingerprint_uidx` UNIQUE(`userId`,`fingerprint`);--> statement-breakpoint
CREATE INDEX `financial_accounts_user_active_idx` ON `financialAccounts` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `transaction_categories_user_active_idx` ON `transactionCategories` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `transaction_import_batches_user_date_idx` ON `transactionImportBatches` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `transactions_user_account_idx` ON `transactions` (`userId`,`accountId`);--> statement-breakpoint
CREATE INDEX `transactions_user_category_idx` ON `transactions` (`userId`,`categoryId`);