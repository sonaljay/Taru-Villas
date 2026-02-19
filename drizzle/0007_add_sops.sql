-- SOP Enums
CREATE TYPE "public"."sop_frequency" AS ENUM('daily', 'weekly', 'monthly');
--> statement-breakpoint
CREATE TYPE "public"."sop_completion_status" AS ENUM('pending', 'completed');
--> statement-breakpoint

-- SOP Templates
CREATE TABLE IF NOT EXISTS "sop_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- SOP Sections
CREATE TABLE IF NOT EXISTS "sop_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- SOP Items
CREATE TABLE IF NOT EXISTS "sop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"section_id" uuid,
	"content" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- SOP Assignments
CREATE TABLE IF NOT EXISTS "sop_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"property_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"frequency" "sop_frequency" NOT NULL,
	"deadline_time" text NOT NULL,
	"deadline_day" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"notify_on_overdue" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_assignments_template_property_user_unique" UNIQUE("template_id","property_id","user_id")
);
--> statement-breakpoint

-- SOP Completions
CREATE TABLE IF NOT EXISTS "sop_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"due_date" date NOT NULL,
	"status" "sop_completion_status" DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_completions_assignment_due_date_unique" UNIQUE("assignment_id","due_date")
);
--> statement-breakpoint

-- SOP Item Completions
CREATE TABLE IF NOT EXISTS "sop_item_completions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"completion_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"note" text,
	"checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sop_item_completions_completion_item_unique" UNIQUE("completion_id","item_id")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "sop_templates" ADD CONSTRAINT "sop_templates_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_sections" ADD CONSTRAINT "sop_sections_template_id_sop_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sop_templates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_items" ADD CONSTRAINT "sop_items_template_id_sop_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sop_templates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_items" ADD CONSTRAINT "sop_items_section_id_sop_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sop_sections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_assignments" ADD CONSTRAINT "sop_assignments_template_id_sop_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."sop_templates"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_assignments" ADD CONSTRAINT "sop_assignments_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_assignments" ADD CONSTRAINT "sop_assignments_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_completions" ADD CONSTRAINT "sop_completions_assignment_id_sop_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."sop_assignments"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_item_completions" ADD CONSTRAINT "sop_item_completions_completion_id_sop_completions_id_fk" FOREIGN KEY ("completion_id") REFERENCES "public"."sop_completions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "sop_item_completions" ADD CONSTRAINT "sop_item_completions_item_id_sop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."sop_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

-- Indexes for performance
CREATE INDEX "sop_assignments_user_id_idx" ON "sop_assignments" ("user_id");
--> statement-breakpoint
CREATE INDEX "sop_completions_assignment_due_date_idx" ON "sop_completions" ("assignment_id", "due_date");
