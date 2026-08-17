ALTER TABLE `users` ADD `externalId` varchar(255);--> statement-breakpoint
ALTER TABLE `users` ADD CONSTRAINT `external_id_idx` UNIQUE(`externalId`);