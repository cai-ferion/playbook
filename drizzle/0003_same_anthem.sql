CREATE TABLE `io_gchat_queue` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(100) NOT NULL,
	`target_space_id` varchar(100),
	`target_name` varchar(255),
	`card_json` text NOT NULL,
	`fallback_text` text,
	`status` varchar(20) DEFAULT 'pending',
	`metadata` text,
	`created_at` varchar(64),
	`sent_at` varchar(64),
	`error_message` text,
	CONSTRAINT `io_gchat_queue_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `io_ot_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`planning_group` varchar(100) NOT NULL,
	`ot_form_open` boolean NOT NULL DEFAULT false,
	`updated_at` varchar(64),
	`updated_by` varchar(255),
	CONSTRAINT `io_ot_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `io_ot_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`request_id` varchar(50) NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`agent_name` varchar(255) NOT NULL,
	`planning_group` varchar(100),
	`requested_hours` varchar(10) NOT NULL,
	`status` varchar(50) NOT NULL DEFAULT 'pending',
	`submitted_at` varchar(64) NOT NULL,
	`approved_at` varchar(64),
	`applied_date` varchar(30),
	`approved_by` varchar(255),
	`approved_by_ohr` varchar(20),
	CONSTRAINT `io_ot_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `io_employees` ADD `gchat_space_id` varchar(100);--> statement-breakpoint
ALTER TABLE `io_tasks` ADD `record_type` varchar(50) DEFAULT 'task';--> statement-breakpoint
ALTER TABLE `io_tasks` ADD `request_type` varchar(100);--> statement-breakpoint
ALTER TABLE `io_tasks` ADD `approval_status` varchar(50);--> statement-breakpoint
ALTER TABLE `io_employees` DROP COLUMN `access_level`;--> statement-breakpoint
ALTER TABLE `io_tasks` DROP COLUMN `priority`;--> statement-breakpoint
ALTER TABLE `io_tasks` DROP COLUMN `target_entity`;--> statement-breakpoint
ALTER TABLE `io_tasks` DROP COLUMN `target_entity_id`;