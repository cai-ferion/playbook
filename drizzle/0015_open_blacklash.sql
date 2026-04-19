CREATE TABLE `wfm_session_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`login_at` varchar(64) NOT NULL,
	`ip_address` varchar(64),
	`user_agent` text,
	`action` varchar(50) DEFAULT 'login',
	`details` text,
	CONSTRAINT `wfm_session_log_id` PRIMARY KEY(`id`)
);
