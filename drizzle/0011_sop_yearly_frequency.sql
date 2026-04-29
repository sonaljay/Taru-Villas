-- Add yearly to sop_frequency enum
-- Note: ALTER TYPE ... ADD VALUE cannot run inside a transaction block.
-- Supabase SQL editor handles this fine when run as a standalone query.
ALTER TYPE "public"."sop_frequency" ADD VALUE IF NOT EXISTS 'yearly';
--> statement-breakpoint

-- Add deadline_month for yearly assignments (1-12). Null for daily/weekly/monthly.
ALTER TABLE "sop_assignments" ADD COLUMN IF NOT EXISTS "deadline_month" integer;
