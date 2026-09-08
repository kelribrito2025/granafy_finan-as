CREATE TABLE `loginAttempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `loginAttempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `login_attempts_email_created_idx` ON `loginAttempts` (`email`,`createdAt`);--> statement-breakpoint
CREATE INDEX `login_attempts_created_idx` ON `loginAttempts` (`createdAt`);