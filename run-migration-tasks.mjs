/**
 * Migration: Add tasks table, issue_description to responses, primary_pm_id to properties.
 *
 * Usage:  node run-migration-tasks.mjs
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import postgres from 'postgres'

const url = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Missing DATABASE_URL or POSTGRES_URL')
  process.exit(1)
}

const sql = postgres(url, { prepare: false })

try {
  // Create task_status enum
  await sql`
    DO $$ BEGIN
      CREATE TYPE "task_status" AS ENUM ('open', 'investigating', 'closed');
    EXCEPTION WHEN duplicate_object THEN null;
    END $$
  `
  console.log('Created task_status enum')

  // Add primary_pm_id to properties
  await sql`ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "primary_pm_id" uuid REFERENCES "profiles"("id") ON DELETE SET NULL`
  console.log('Added primary_pm_id to properties')

  // Add issue_description to survey_responses
  await sql`ALTER TABLE "survey_responses" ADD COLUMN IF NOT EXISTS "issue_description" text`
  console.log('Added issue_description to survey_responses')

  // Create tasks table
  await sql`
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
    )
  `
  console.log('Created tasks table')

  // Create indexes
  await sql`CREATE INDEX IF NOT EXISTS "tasks_org_id_idx" ON "tasks" ("org_id")`
  await sql`CREATE INDEX IF NOT EXISTS "tasks_property_id_idx" ON "tasks" ("property_id")`
  await sql`CREATE INDEX IF NOT EXISTS "tasks_assigned_to_idx" ON "tasks" ("assigned_to")`
  await sql`CREATE INDEX IF NOT EXISTS "tasks_status_idx" ON "tasks" ("status")`
  await sql`CREATE INDEX IF NOT EXISTS "tasks_question_property_idx" ON "tasks" ("question_id", "property_id")`
  console.log('Created indexes')

  console.log('Migration complete!')
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}
