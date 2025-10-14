ALTER TABLE `shares` ADD `storageUsage` bigint unsigned DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `shares` ADD `storageQuota` bigint unsigned;--> statement-breakpoint
ALTER TABLE `shares` ADD `storageIndexing` boolean DEFAULT true NOT NULL;