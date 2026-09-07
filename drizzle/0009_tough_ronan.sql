ALTER TABLE `transactions` ADD `recurrenceGroupId` varchar(36);--> statement-breakpoint
ALTER TABLE `transactions` ADD `recurrenceIndex` int;--> statement-breakpoint
CREATE INDEX `transactions_user_recurrence_group_idx` ON `transactions` (`userId`,`recurrenceGroupId`);