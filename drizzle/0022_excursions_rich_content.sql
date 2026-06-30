-- Excursions: richer content captured from the property experiences sheets.
-- Adds Experience, What's included, activity tags, and named locations (with map links).
ALTER TABLE "excursions" ADD COLUMN IF NOT EXISTS "experience" text;--> statement-breakpoint
ALTER TABLE "excursions" ADD COLUMN IF NOT EXISTS "whats_included" text;--> statement-breakpoint
ALTER TABLE "excursions" ADD COLUMN IF NOT EXISTS "tags" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "excursions" ADD COLUMN IF NOT EXISTS "locations" jsonb DEFAULT '[]'::jsonb NOT NULL;
