ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "evening_reading" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "night_reading" numeric(12, 2);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "daily_occupancy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "log_date" date NOT NULL,
  "guest_count" integer DEFAULT 0 NOT NULL,
  "staff_count" integer DEFAULT 0 NOT NULL,
  "note" text,
  "recorded_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "daily_occupancy_property_date_unique" UNIQUE("property_id", "log_date")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "electricity_kpi_bands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "min_guests" integer NOT NULL,
  "target_units" numeric(12, 2) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "electricity_kpi_bands_property_minguests_unique" UNIQUE("property_id", "min_guests")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "utility_kpi_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "utility_type" "utility_type" NOT NULL,
  "daily_target_units" numeric(12, 2) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "utility_kpi_targets_property_type_unique" UNIQUE("property_id", "utility_type")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "electricity_slot_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "morning_time" time DEFAULT '05:30' NOT NULL,
  "evening_time" time DEFAULT '17:30' NOT NULL,
  "night_time" time DEFAULT '22:30' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "electricity_slot_config_org_unique" UNIQUE("org_id")
);
