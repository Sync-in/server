ALTER TABLE `users` MODIFY COLUMN `currentIp` varchar(45);--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `lastIp` varchar(45);--> statement-breakpoint
ALTER TABLE `sync_clients` MODIFY COLUMN `currentIp` varchar(45);--> statement-breakpoint
ALTER TABLE `sync_clients` MODIFY COLUMN `lastIp` varchar(45);