CREATE TABLE `io_leave_periods` (
	`id` int AUTO_INCREMENT NOT NULL,
	`month` int NOT NULL,
	`year` int NOT NULL,
	`start_week_ending` varchar(10) NOT NULL,
	`created_by` varchar(255),
	`created_by_ohr` varchar(20),
	`created_at` varchar(64),
	`updated_at` varchar(64),
	CONSTRAINT `io_leave_periods_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `io_attendance` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_coaching_nte` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_corrective_actions` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_employees` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_insights` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_shift_extensions` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_tardiness` ADD `version` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `io_tasks` ADD `version` int DEFAULT 1 NOT NULL;