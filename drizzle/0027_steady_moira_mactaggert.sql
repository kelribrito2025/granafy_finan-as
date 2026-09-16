CREATE TABLE `companyInvites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`lote` varchar(36) NOT NULL,
	`email` varchar(320) NOT NULL,
	`companyId` int NOT NULL,
	`role` enum('contador') NOT NULL DEFAULT 'contador',
	`invitedBy` int NOT NULL,
	`tokenHash` varchar(64) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp,
	`revokedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `companyInvites_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `company_invites_token_idx` ON `companyInvites` (`tokenHash`);--> statement-breakpoint
CREATE INDEX `company_invites_inviter_idx` ON `companyInvites` (`invitedBy`,`revokedAt`);--> statement-breakpoint
CREATE INDEX `company_invites_lote_idx` ON `companyInvites` (`lote`);