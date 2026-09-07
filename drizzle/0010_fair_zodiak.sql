ALTER TABLE `patrimonialItems` ADD `assetCategory` enum('equipamento','veiculo','imovel','software','movel','estoque','investimento','direito','outro');--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `costCenter` varchar(120) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `costCenterId` int;--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `sourceAccount` varchar(80) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `sourceAccountId` int;--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `attachmentKey` varchar(255);--> statement-breakpoint
ALTER TABLE `patrimonialItems` ADD `attachmentName` varchar(180);