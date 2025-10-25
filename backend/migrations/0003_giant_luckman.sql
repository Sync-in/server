ALTER TABLE `users` MODIFY COLUMN `language` varchar(10);--> statement-breakpoint
ALTER TABLE `users` ADD COLUMN IF NOT EXISTS `storageIndexing` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `spaces` ADD COLUMN IF NOT EXISTS `storageIndexing` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `shares` ADD COLUMN IF NOT EXISTS `storageUsage` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shares` ADD COLUMN IF NOT EXISTS `storageQuota` bigint unsigned;--> statement-breakpoint
ALTER TABLE `shares` ADD COLUMN IF NOT EXISTS `storageIndexing` boolean DEFAULT true NOT NULL;