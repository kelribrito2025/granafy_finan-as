ALTER TABLE `transactions` ADD `settledAt` date;--> statement-breakpoint
CREATE INDEX `transactions_user_settled_idx` ON `transactions` (`userId`,`status`,`settledAt`);