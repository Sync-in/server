UPDATE `comments` SET `content` = '' WHERE `content` IS NULL;--> statement-breakpoint
ALTER TABLE `comments` MODIFY COLUMN `content` text NOT NULL;--> statement-breakpoint
DELETE FROM `notifications` WHERE `content` IS NULL;--> statement-breakpoint
ALTER TABLE `notifications` MODIFY COLUMN `content` json NOT NULL;--> statement-breakpoint
CREATE INDEX `created_at_idx` ON `notifications` (`createdAt`);
