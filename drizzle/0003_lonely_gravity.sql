CREATE TABLE `passwordResetRequests` (
	`id` varchar(36) NOT NULL,
	`userId` int NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`expiresAt` timestamp NOT NULL,
	`consumedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `passwordResetRequests_id` PRIMARY KEY(`id`)
);
