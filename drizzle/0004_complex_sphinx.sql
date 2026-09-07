CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`type` enum('entrada','saida') NOT NULL,
	`transactionDate` date NOT NULL,
	`description` varchar(180) NOT NULL,
	`contact` varchar(120) NOT NULL DEFAULT '',
	`category` varchar(120) NOT NULL,
	`amount` decimal(15,2) NOT NULL,
	`account` varchar(80) NOT NULL,
	`status` enum('Pago','Pendente') NOT NULL DEFAULT 'Pendente',
	`recurring` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `transactions_user_date_idx` ON `transactions` (`userId`,`transactionDate`);--> statement-breakpoint
CREATE INDEX `transactions_user_status_idx` ON `transactions` (`userId`,`status`);