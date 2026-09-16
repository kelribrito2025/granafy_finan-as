CREATE TABLE `companyAccess` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`companyId` int NOT NULL,
	`role` enum('contador') NOT NULL DEFAULT 'contador',
	`grantedBy` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`revokedAt` timestamp,
	CONSTRAINT `companyAccess_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `company_access_user_revoked_idx` ON `companyAccess` (`userId`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `company_access_company_idx` ON `companyAccess` (`companyId`);
