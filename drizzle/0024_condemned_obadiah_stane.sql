ALTER TABLE `companyProfiles` ADD `onboardingCompletedAt` timestamp;--> statement-breakpoint
ALTER TABLE `companyProfiles` ADD `categoryDefaultsVersion` int DEFAULT 0 NOT NULL;