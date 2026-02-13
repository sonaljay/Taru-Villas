-- Guest Survey Links table
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
);

CREATE INDEX IF NOT EXISTS "guest_survey_links_token_idx" ON "guest_survey_links" ("token");

-- Modify survey_submissions: make submitted_by nullable, add guest columns
ALTER TABLE "survey_submissions" ALTER COLUMN "submitted_by" DROP NOT NULL;

ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_name" text;
ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_email" text;
ALTER TABLE "survey_submissions" ADD COLUMN IF NOT EXISTS "guest_link_id" uuid REFERENCES "guest_survey_links"("id") ON DELETE SET NULL;
