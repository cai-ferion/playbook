ALTER TABLE `io_leaves` ADD `tl_reviewer` varchar(255);--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `tl_review_date` varchar(64);--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `om_reviewer` varchar(255);--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `om_review_date` varchar(64);--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `rejection_reason` text;--> statement-breakpoint
ALTER TABLE `io_leaves` ADD `cancelled_at` varchar(64);