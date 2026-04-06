CREATE TABLE `io_productivity_hours` (
	`id` int AUTO_INCREMENT NOT NULL,
	`date` varchar(16) NOT NULL,
	`ohr` varchar(32) NOT NULL,
	`actual_projection` varchar(32) DEFAULT 'Actuals',
	`available` decimal(8,2) DEFAULT '0',
	`non_srt_production` decimal(8,2) DEFAULT '0',
	`fb_training` decimal(8,2) DEFAULT '0',
	`onboarding` decimal(8,2) DEFAULT '0',
	`coaching` decimal(8,2) DEFAULT '0',
	`wellness_support` decimal(8,2) DEFAULT '0',
	`team_meeting` decimal(8,2) DEFAULT '0',
	`total_billable` decimal(8,2) DEFAULT '0',
	`delivered_hours` decimal(8,2) DEFAULT '0',
	`uploaded_at` varchar(64),
	CONSTRAINT `io_productivity_hours_id` PRIMARY KEY(`id`)
);
