-- Task status enum
DO $$ BEGIN
  CREATE TYPE "task_status" AS ENUM ('open', 'investigating', 'closed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add primary_pm_id to properties
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "primary_pm_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL;

-- Add issue_description to survey_responses
ALTER TABLE "survey_responses" ADD COLUMN IF NOT EXISTS "issue_description" text;

-- Tasks table
CREATE TABLE IF NOT EXISTS "tasks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id"),
  "submission_id" uuid NOT NULL REFERENCES "survey_submissions"("id"),
  "response_id" uuid NOT NULL REFERENCES "survey_responses"("id"),
  "question_id" uuid NOT NULL REFERENCES "survey_questions"("id"),
  "title" text NOT NULL,
  "description" text,
  "status" "task_status" DEFAULT 'open' NOT NULL,
  "assigned_to" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "is_repeat_issue" boolean DEFAULT false NOT NULL,
  "closing_notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "closed_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS "tasks_org_id_idx" ON "tasks" ("org_id");
CREATE INDEX IF NOT EXISTS "tasks_property_id_idx" ON "tasks" ("property_id");
CREATE INDEX IF NOT EXISTS "tasks_assigned_to_idx" ON "tasks" ("assigned_to");
CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status");
CREATE INDEX IF NOT EXISTS "tasks_question_property_idx" ON "tasks" ("question_id", "property_id");
