CREATE TABLE `reconciliationPeriods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`statementBalance` decimal(15,2) NOT NULL,
	`systemBalance` decimal(15,2) NOT NULL,
	`movementCount` int NOT NULL DEFAULT 0,
	`closedAt` timestamp NOT NULL DEFAULT (now()),
	`closedBy` int,
	`reopenedAt` timestamp,
	`reopenedBy` int,
	`reopenReason` varchar(500) NOT NULL DEFAULT '',
	CONSTRAINT `reconciliationPeriods_id` PRIMARY KEY(`id`),
	CONSTRAINT `reconciliation_periods_uidx` UNIQUE(`userId`,`accountId`,`year`,`month`)
);
--> statement-breakpoint
ALTER TABLE `categoryRules` ADD `autoReconcile` boolean DEFAULT false NOT NULL;