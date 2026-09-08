ALTER TABLE `userPreferences` ADD `sidebarMode` enum('expandido','icones','hover') DEFAULT 'expandido' NOT NULL;--> statement-breakpoint
ALTER TABLE `userPreferences` ADD `sidebarTooltips` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `userPreferences` ADD `sidebarBadges` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `userPreferences` ADD `sidebarRemember` boolean DEFAULT false NOT NULL;