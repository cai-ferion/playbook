CREATE TABLE `io_sync_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sync_type` varchar(50) NOT NULL,
	`trigger` varchar(50) NOT NULL,
	`status` varchar(20) NOT NULL,
	`started_at` varchar(64) NOT NULL,
	`completed_at` varchar(64),
	`duration_ms` int,
	`rows_updated` int DEFAULT 0,
	`rows_appended` int DEFAULT 0,
	`total_db_rows` int DEFAULT 0,
	`total_sheet_rows` int DEFAULT 0,
	`error_message` text,
	`output_log` text,
	CONSTRAINT `io_sync_log_id` PRIMARY KEY(`id`)
);
