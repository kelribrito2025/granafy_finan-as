CREATE TABLE `bankMovements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`movementDate` date NOT NULL,
	`description` varchar(255) NOT NULL,
	`contact` varchar(120) NOT NULL DEFAULT '',
	`amount` decimal(15,2) NOT NULL,
	`status` enum('sem_par','sugerido','conciliado','classificado') NOT NULL DEFAULT 'sem_par',
	`classification` enum('transferencia','pessoal','duplicidade','estorno','fora_dos_relatorios'),
	`classificationNote` varchar(500) NOT NULL DEFAULT '',
	`relatedMovementId` int,
	`importBatchId` varchar(36),
	`externalId` varchar(160),
	`fingerprint` varchar(64) NOT NULL,
	`reconciledAt` timestamp,
	`reconciledBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bankMovements_id` PRIMARY KEY(`id`),
	CONSTRAINT `bank_movements_user_fingerprint_uidx` UNIQUE(`userId`,`fingerprint`)
);
--> statement-breakpoint
CREATE TABLE `reconciliationAudit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`movementId` int,
	`transactionId` int,
	`action` varchar(40) NOT NULL,
	`previousStatus` varchar(40) NOT NULL DEFAULT '',
	`newStatus` varchar(40) NOT NULL DEFAULT '',
	`ruleId` int,
	`detail` varchar(500) NOT NULL DEFAULT '',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reconciliationAudit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reconciliationLinks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`movementId` int NOT NULL,
	`transactionId` int NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`origin` enum('sugestao','manual','regra','importacao') NOT NULL DEFAULT 'manual',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`createdBy` int,
	CONSTRAINT `reconciliationLinks_id` PRIMARY KEY(`id`),
	CONSTRAINT `reconciliation_links_pair_uidx` UNIQUE(`movementId`,`transactionId`)
);
--> statement-breakpoint
ALTER TABLE `transactionImportBatches` ADD `statementBalance` decimal(15,2);--> statement-breakpoint
ALTER TABLE `transactionImportBatches` ADD `statementBalanceDate` date;--> statement-breakpoint
CREATE INDEX `bank_movements_user_account_date_idx` ON `bankMovements` (`userId`,`accountId`,`movementDate`);--> statement-breakpoint
CREATE INDEX `bank_movements_user_status_idx` ON `bankMovements` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `bank_movements_user_batch_idx` ON `bankMovements` (`userId`,`importBatchId`);--> statement-breakpoint
CREATE INDEX `reconciliation_audit_user_date_idx` ON `reconciliationAudit` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `reconciliation_audit_user_movement_idx` ON `reconciliationAudit` (`userId`,`movementId`);--> statement-breakpoint
CREATE INDEX `reconciliation_links_user_movement_idx` ON `reconciliationLinks` (`userId`,`movementId`);--> statement-breakpoint
CREATE INDEX `reconciliation_links_user_transaction_idx` ON `reconciliationLinks` (`userId`,`transactionId`);