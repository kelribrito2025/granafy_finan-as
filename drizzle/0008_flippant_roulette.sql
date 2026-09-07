CREATE TABLE `costCenters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`color` varchar(7) NOT NULL DEFAULT '#4C6355',
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `costCenters_id` PRIMARY KEY(`id`),
	CONSTRAINT `cost_centers_user_name_uidx` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `transactions` MODIFY COLUMN `type` enum('entrada','saida','transferencia') NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `costCenter` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `costCenterId` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `recurringMonths` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `attachmentKey` varchar(255);--> statement-breakpoint
ALTER TABLE `transactions` ADD `attachmentName` varchar(180);--> statement-breakpoint
ALTER TABLE `transactions` ADD `transferGroupId` varchar(36);--> statement-breakpoint
CREATE INDEX `cost_centers_user_active_idx` ON `costCenters` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `transactions_user_cost_center_idx` ON `transactions` (`userId`,`costCenterId`);--> statement-breakpoint
CREATE INDEX `transactions_user_transfer_group_idx` ON `transactions` (`userId`,`transferGroupId`);