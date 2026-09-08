CREATE TABLE `statementBalances` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accountId` int NOT NULL,
	`asOf` date NOT NULL,
	`balance` decimal(15,2) NOT NULL,
	`informedBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `statementBalances_id` PRIMARY KEY(`id`),
	CONSTRAINT `statement_balances_account_date_uidx` UNIQUE(`userId`,`accountId`,`asOf`)
);
--> statement-breakpoint
CREATE INDEX `statement_balances_user_account_idx` ON `statementBalances` (`userId`,`accountId`);