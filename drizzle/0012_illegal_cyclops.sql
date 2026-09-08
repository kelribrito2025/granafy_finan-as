CREATE TABLE `companyProfiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`legalName` varchar(180) NOT NULL DEFAULT '',
	`tradeName` varchar(180) NOT NULL DEFAULT '',
	`taxId` varchar(20) NOT NULL DEFAULT '',
	`stateRegistration` varchar(30) NOT NULL DEFAULT '',
	`taxRegime` enum('simples','presumido','real','mei','outro') NOT NULL DEFAULT 'simples',
	`financeEmail` varchar(320) NOT NULL DEFAULT '',
	`logoKey` varchar(255),
	`logoName` varchar(180),
	`zipCode` varchar(9) NOT NULL DEFAULT '',
	`street` varchar(180) NOT NULL DEFAULT '',
	`streetNumber` varchar(20) NOT NULL DEFAULT '',
	`complement` varchar(120) NOT NULL DEFAULT '',
	`district` varchar(120) NOT NULL DEFAULT '',
	`city` varchar(120) NOT NULL DEFAULT '',
	`state` varchar(2) NOT NULL DEFAULT '',
	`country` varchar(60) NOT NULL DEFAULT 'Brasil',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `companyProfiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `company_profiles_user_uidx` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `userPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`defaultPeriod` enum('diario','semanal','mensal') NOT NULL DEFAULT 'mensal',
	`currency` enum('BRL','USD','EUR') NOT NULL DEFAULT 'BRL',
	`timeZone` varchar(60) NOT NULL DEFAULT 'America/Sao_Paulo',
	`dateFormat` enum('dmy','mdy','iso') NOT NULL DEFAULT 'dmy',
	`fiscalYearStartMonth` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userPreferences_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_preferences_user_uidx` UNIQUE(`userId`)
);
