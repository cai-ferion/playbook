CREATE TABLE `io_billing_targets_v2` (
	`id` int AUTO_INCREMENT NOT NULL,
	`week_ending` varchar(16) NOT NULL,
	`planning_group` varchar(100) NOT NULL,
	`role` varchar(100) NOT NULL,
	`target_hc` int DEFAULT 0,
	`target_hours` decimal(10,2) DEFAULT '0',
	`created_at` varchar(64),
	`updated_at` varchar(64),
	CONSTRAINT `io_billing_targets_v2_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `io_srt_bill` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(16) NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`srt_id` varchar(50),
	`billing_name` varchar(255),
	`srt_status` varchar(50),
	`actual_vs_projection` varchar(20),
	`role` varchar(100),
	`planning_group` varchar(100),
	`created_at` varchar(64),
	CONSTRAINT `io_srt_bill_id` PRIMARY KEY(`id`)
);
