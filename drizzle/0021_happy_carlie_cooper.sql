ALTER TABLE `companyProfiles` ADD `isActive` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `companyProfiles` ADD `sortOrder` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `company_profiles_user_order_idx` ON `companyProfiles` (`userId`,`sortOrder`);