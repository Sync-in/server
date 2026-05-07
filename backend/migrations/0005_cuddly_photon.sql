UPDATE `files_favorites` SET `createdAt` = CURRENT_TIMESTAMP WHERE `createdAt` IS NULL;
--> statement-breakpoint
ALTER TABLE `files_favorites` MODIFY COLUMN `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP;