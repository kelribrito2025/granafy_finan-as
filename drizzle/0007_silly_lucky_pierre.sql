CREATE TABLE `balanceSheetSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`referenceDate` date NOT NULL,
	`cashAndEquivalents` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentAssets` decimal(15,2) NOT NULL DEFAULT '0.00',
	`nonCurrentAssets` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentLiabilities` decimal(15,2) NOT NULL DEFAULT '0.00',
	`nonCurrentLiabilities` decimal(15,2) NOT NULL DEFAULT '0.00',
	`declaredEquity` decimal(15,2) NOT NULL DEFAULT '0.00',
	`totalAssets` decimal(15,2) NOT NULL DEFAULT '0.00',
	`totalLiabilities` decimal(15,2) NOT NULL DEFAULT '0.00',
	`netWorth` decimal(15,2) NOT NULL DEFAULT '0.00',
	`itemCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `balanceSheetSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `balance_sheet_snapshots_user_date_uidx` UNIQUE(`userId`,`referenceDate`)
);
--> statement-breakpoint
CREATE TABLE `patrimonialItems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`balanceGroup` enum('ativo_circulante','ativo_nao_circulante','passivo_circulante','passivo_nao_circulante','patrimonio_liquido') NOT NULL,
	`itemType` enum('bem','direito','estoque','investimento','obrigacao','capital','ajuste','outro') NOT NULL DEFAULT 'outro',
	`acquisitionDate` date,
	`acquisitionValue` decimal(15,2) NOT NULL DEFAULT '0.00',
	`currentValue` decimal(15,2) NOT NULL,
	`valuationMethod` enum('manual','depreciacao_linear') NOT NULL DEFAULT 'manual',
	`usefulLifeMonths` int,
	`residualValue` decimal(15,2) NOT NULL DEFAULT '0.00',
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patrimonialItems_id` PRIMARY KEY(`id`),
	CONSTRAINT `patrimonial_items_user_name_uidx` UNIQUE(`userId`,`name`)
);
--> statement-breakpoint
CREATE INDEX `balance_sheet_snapshots_user_created_idx` ON `balanceSheetSnapshots` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `patrimonial_items_user_group_idx` ON `patrimonialItems` (`userId`,`balanceGroup`);--> statement-breakpoint
CREATE INDEX `patrimonial_items_user_active_idx` ON `patrimonialItems` (`userId`,`isActive`);