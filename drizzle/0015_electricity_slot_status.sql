DO $$ BEGIN
  CREATE TYPE "reading_slot_status" AS ENUM ('manual', 'autofilled', 'edited');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "morning_status" "reading_slot_status";--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "evening_status" "reading_slot_status";--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "night_status" "reading_slot_status";
