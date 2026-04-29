-- SOP Categories (org-level grouping for templates)
CREATE TABLE IF NOT EXISTS "sop_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_categories_org_name_unique" UNIQUE("org_id","name")
);
--> statement-breakpoint

ALTER TABLE "sop_categories"
  ADD CONSTRAINT "sop_categories_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Add category_id to sop_templates (nullable for backfill grace; required at app level for new templates)
ALTER TABLE "sop_templates" ADD COLUMN IF NOT EXISTS "category_id" uuid;
--> statement-breakpoint

ALTER TABLE "sop_templates"
  ADD CONSTRAINT "sop_templates_category_id_sop_categories_id_fk"
  FOREIGN KEY ("category_id") REFERENCES "public"."sop_categories"("id")
  ON DELETE restrict ON UPDATE no action;
