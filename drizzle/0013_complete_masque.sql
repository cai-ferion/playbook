CREATE TABLE `io_coaching_nte` (
	`id` varchar(36) NOT NULL,
	`coaching_id` varchar(36) NOT NULL,
	`employee_name` varchar(255) NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`cap_level` varchar(20) NOT NULL,
	`date_of_incident` varchar(64),
	`incident_description` text,
	`policy_violated` text,
	`previous_warnings` text,
	`expected_behavior` text,
	`deadline_for_improvement` varchar(64),
	`issued_by` varchar(255),
	`issued_by_ohr` varchar(20),
	`created_at` varchar(64),
	`updated_at` varchar(64),
	CONSTRAINT `io_coaching_nte_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `compass_coaching_logs` ADD `sme_joiner_2_name` varchar(255);--> statement-breakpoint
ALTER TABLE `compass_coaching_logs` ADD `sme_joiner_2_email` varchar(320);--> statement-breakpoint
ALTER TABLE `compass_coaching_logs` ADD `incident_timestamp` varchar(64);--> statement-breakpoint
ALTER TABLE `compass_coaching_logs` ADD `violation_type` varchar(255);--> statement-breakpoint
ALTER TABLE `compass_coaching_logs` ADD `violation_subtype` text;--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `cap_level` varchar(20);--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `incident_timestamp` varchar(64);--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `violation_type` varchar(255);--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `violation_subtype` text;--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `sme_joiner_2` varchar(255);--> statement-breakpoint
ALTER TABLE `io_coaching` ADD `sme_joiner_2_email` varchar(320);--> statement-breakpoint
ALTER TABLE `io_employees` ADD `offboarding_date` varchar(30);--> statement-breakpoint
ALTER TABLE `io_employees` ADD `resignation_date` varchar(30);--> statement-breakpoint
ALTER TABLE `io_employees` ADD `relieving_date` varchar(30);--> statement-breakpoint
ALTER TABLE `io_employees` ADD `exit_date` varchar(30);--> statement-breakpoint
ALTER TABLE `io_employees` ADD `exit_reason` varchar(255);