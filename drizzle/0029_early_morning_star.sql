CREATE TABLE `alertDispatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`kind` enum('contas_atrasadas') NOT NULL,
	`sentOn` date NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alertDispatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `alert_dispatches_uidx` UNIQUE(`userId`,`companyId`,`kind`,`sentOn`)
);
--> statement-breakpoint
ALTER TABLE `userPreferences` ADD `alertaContasAtrasadas` boolean DEFAULT true NOT NULL;