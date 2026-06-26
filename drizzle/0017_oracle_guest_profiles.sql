DO $$ BEGIN
  CREATE TYPE "guest_profile_status" AS ENUM ('pending_questionnaire', 'pending_approval', 'pending_checkin', 'checked_in', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "pre_arrival_question_type" AS ENUM ('short_text', 'long_text', 'single_choice', 'multi_choice', 'date', 'time', 'yes_no', 'file');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "oracle_hotel_id" varchar(50);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "oracle_reservation_id" varchar(255) NOT NULL,
  "confirmation_number" varchar(255),
  "guest_name" text,
  "guest_email" text,
  "arrival_date" date,
  "departure_date" date,
  "room_type" varchar(100),
  "room_number" varchar(50),
  "status" "guest_profile_status" DEFAULT 'pending_questionnaire' NOT NULL,
  "oracle_reservation_status" varchar(100),
  "token" varchar(255) NOT NULL UNIQUE,
  "posted_at" timestamptz,
  "posted_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "oracle_error" text,
  "last_pulled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "guest_profiles_property_reservation_unique" UNIQUE ("property_id", "oracle_reservation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_arrival_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "prompt" varchar(500) NOT NULL,
  "type" "pre_arrival_question_type" NOT NULL,
  "options" text[] DEFAULT '{}'::text[] NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "maps_to_eta" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_arrival_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guest_profile_id" uuid NOT NULL REFERENCES "guest_profiles"("id") ON DELETE CASCADE,
  "question_id" uuid REFERENCES "pre_arrival_questions"("id") ON DELETE SET NULL,
  "prompt_snapshot" varchar(500) NOT NULL,
  "value_text" text,
  "value_options" text[] DEFAULT '{}'::text[] NOT NULL,
  "file_url" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
