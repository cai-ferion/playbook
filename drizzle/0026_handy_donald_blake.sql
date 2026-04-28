CREATE TABLE `io_group_tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`task_id` varchar(20) NOT NULL,
	`title` varchar(500) NOT NULL,
	`description` text,
	`category` varchar(100),
	`planning_groups` text,
	`departments` text,
	`roles` text,
	`excluded_ohrs` text,
	`due_date` varchar(64),
	`status` varchar(50) DEFAULT 'Active',
	`created_by_ohr` varchar(20) NOT NULL,
	`created_by_name` varchar(255),
	`created_at` varchar(64),
	`updated_at` varchar(64),
	CONSTRAINT `io_group_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `io_task_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`group_task_id` int NOT NULL,
	`employee_ohr` varchar(20) NOT NULL,
	`employee_name` varchar(255),
	`status` varchar(50) DEFAULT 'Pending',
	`completed_at` varchar(64),
	`created_at` varchar(64),
	CONSTRAINT `io_task_assignments_id` PRIMARY KEY(`id`)
);
