CREATE TABLE `io_wfm_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`schedule_date` varchar(10) NOT NULL,
	`wfm_value` varchar(50) NOT NULL,
	`uploaded_at` varchar(64),
	`uploaded_by` varchar(255),
	CONSTRAINT `io_wfm_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `io_attendance` ADD `wfm_tag` varchar(50);