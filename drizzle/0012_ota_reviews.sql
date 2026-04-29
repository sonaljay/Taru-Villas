CREATE TABLE IF NOT EXISTS "ota_review_sources" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL,
  "source" text NOT NULL,
  "external_id" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "last_fetched_at" timestamp with time zone,
  "last_fetch_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ota_review_sources_property_source_unique" UNIQUE ("property_id", "source"),
  CONSTRAINT "ota_review_sources_source_check" CHECK ("source" IN ('google'))
);
--> statement-breakpoint

ALTER TABLE "ota_review_sources"
  ADD CONSTRAINT "ota_review_sources_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ota_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "source_id" uuid NOT NULL,
  "property_id" uuid NOT NULL,
  "external_review_id" text NOT NULL,
  "author_name" text,
  "rating" integer NOT NULL,
  "text" text,
  "language" text,
  "reviewed_at" timestamp with time zone NOT NULL,
  "fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
  "raw_payload" jsonb,
  CONSTRAINT "ota_reviews_source_external_id_unique" UNIQUE ("source_id", "external_review_id")
);
--> statement-breakpoint

ALTER TABLE "ota_reviews"
  ADD CONSTRAINT "ota_reviews_source_id_fk"
  FOREIGN KEY ("source_id") REFERENCES "ota_review_sources"("id") ON DELETE CASCADE;
--> statement-breakpoint

ALTER TABLE "ota_reviews"
  ADD CONSTRAINT "ota_reviews_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ota_reviews_property_reviewed_at_idx"
  ON "ota_reviews" ("property_id", "reviewed_at" DESC);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "ota_syntheses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL,
  "generated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "window_start" timestamp with time zone NOT NULL,
  "window_end" timestamp with time zone NOT NULL,
  "reviews_analyzed" integer NOT NULL,
  "avg_rating" numeric(3,2),
  "aspect_scores" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "strengths" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "weaknesses" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "repetitive_issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'ok' NOT NULL,
  "error_message" text,
  "model_used" text NOT NULL,
  "prompt_version" text NOT NULL,
  "cost_usd" numeric(8,4),
  CONSTRAINT "ota_syntheses_status_check" CHECK ("status" IN ('ok','insufficient_data','error'))
);
--> statement-breakpoint

ALTER TABLE "ota_syntheses"
  ADD CONSTRAINT "ota_syntheses_property_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "ota_syntheses_property_generated_at_idx"
  ON "ota_syntheses" ("property_id", "generated_at" DESC);
