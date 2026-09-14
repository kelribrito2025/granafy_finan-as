CREATE TABLE `systemSettings` (
	`settingKey` varchar(64) NOT NULL,
	`settingValue` varchar(255) NOT NULL,
	`updatedByUserId` int,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `systemSettings_settingKey` PRIMARY KEY(`settingKey`)
);
