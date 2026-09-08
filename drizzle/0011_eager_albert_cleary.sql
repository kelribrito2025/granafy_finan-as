CREATE TABLE `categoryRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`matchType` enum('descricao','contato','conta') NOT NULL,
	`matchValue` varchar(180) NOT NULL,
	`categoryId` int,
	`category` varchar(120) NOT NULL DEFAULT '',
	`costCenterId` int,
	`costCenter` varchar(120) NOT NULL DEFAULT '',
	`priority` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `categoryRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `category_rules_user_priority_idx` ON `categoryRules` (`userId`,`isActive`,`priority`);