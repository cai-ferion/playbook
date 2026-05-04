CREATE TABLE `io_admin_ohrs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`full_name` varchar(255),
	`added_by` varchar(255),
	`added_by_ohr` varchar(20),
	`added_at` varchar(64),
	CONSTRAINT `io_admin_ohrs_id` PRIMARY KEY(`id`)
);
