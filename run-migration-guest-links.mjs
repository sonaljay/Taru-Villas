/**
 * Migration: Add guest survey links table and guest columns to submissions.
 *
 * Usage:  node run-migration-guest-links.mjs
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
  await sql`
    CREATE TABLE IF NOT EXISTS "guest_survey_links" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "token" varchar(255) NOT NULL UNIQUE,
      "template_id" uuid NOT NULL REFERENCES "survey_templates"("id"),
      "property_id" uuid NOT NULL REFERENCES "properties"("id"),
      "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
      "is_active" boolean DEFAULT true NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT "guest_survey_links_template_property_unique" UNIQUE("template_id", "property_id")
    )
  `
  console.log('Created guest_survey_links table')

  await sql`CREATE INDEX IF NOT EXISTS "guest_survey_links_token_idx" ON "guest_survey_links" ("token")`
  console.log('Created token index')

  await sql`ALTER TABLE "survey_submissions" ALTER COLUMN "submitted_by" DROP NOT NULL`
  console.log('Made submitted_by nullable')

  await sql`ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_name" text`
  await sql`ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_email" text`
  await sql`ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_link_id" uuid REFERENCES "guest_survey_links"("id") ON DELETE SET NULL`
  console.log('Added guest columns to survey_submissions')

  console.log('Migration complete!')
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}
