CREATE TABLE `accessLog` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`event` enum('entrada','troca','exportacao') NOT NULL,
	`detail` varchar(120),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accessLog_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `access_log_company_created_idx` ON `accessLog` (`companyId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `access_log_user_idx` ON `accessLog` (`userId`);