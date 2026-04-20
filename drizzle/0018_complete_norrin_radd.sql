ALTER TABLE `io_coaching` MODIFY COLUMN `cap_level` varchar(50);--> statement-breakpoint
ALTER TABLE `io_coaching_nte` MODIFY COLUMN `cap_level` varchar(50) NOT NULL;--> statement-breakpoint
ALTER TABLE `io_employees` DROP COLUMN `password`;--> statement-breakpoint
ALTER TABLE `io_employees` DROP COLUMN `is_locked`;