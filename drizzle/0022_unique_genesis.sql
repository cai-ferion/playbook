ALTER TABLE `io_insights` ADD `initial_review_date` varchar(64);--> statement-breakpoint
ALTER TABLE `io_insights` ADD `initial_review_comments` text;--> statement-breakpoint
ALTER TABLE `io_insights` ADD `final_reviewer` varchar(255);--> statement-breakpoint
ALTER TABLE `io_insights` ADD `final_review_date` varchar(64);--> statement-breakpoint
ALTER TABLE `io_insights` ADD `final_review_comments` text;