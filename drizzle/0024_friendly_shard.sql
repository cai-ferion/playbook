CREATE TABLE `io_role_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`srt_id` varchar(50),
	`employee_name` varchar(255) NOT NULL,
	`original_role` varchar(100) NOT NULL,
	`original_pg` varchar(100) NOT NULL,
	`new_role` varchar(100) NOT NULL,
	`new_pg` varchar(100) NOT NULL,
	`date_from` varchar(10) NOT NULL,
	`date_to` varchar(10) NOT NULL,
	`week_ending` varchar(10) NOT NULL,
	`created_by` varchar(255),
	`created_by_ohr` varchar(20),
	`email_generated_at` varchar(64),
	`attendance_updated` boolean DEFAULT false,
	`created_at` varchar(64),
	CONSTRAINT `io_role_changes_id` PRIMARY KEY(`id`)
);
