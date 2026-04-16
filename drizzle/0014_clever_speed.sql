CREATE TABLE `io_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ohr_id` varchar(20) NOT NULL,
	`permission_key` varchar(100) NOT NULL,
	`granted` boolean NOT NULL DEFAULT false,
	`updated_by` varchar(20),
	`updated_at` timestamp DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `io_permissions_id` PRIMARY KEY(`id`)
);
