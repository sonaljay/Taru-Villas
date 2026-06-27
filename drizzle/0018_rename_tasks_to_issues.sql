-- Rename the survey-flagged "tasks" feature to "issues".
-- Shape is unchanged; FKs and indexes auto-follow the rename.
ALTER TABLE tasks RENAME TO issues;
--> statement-breakpoint
ALTER TYPE task_status RENAME TO issue_status;
