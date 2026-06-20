-- Daily Wastage: one combined row per property per day, kg per waste category
CREATE TABLE IF NOT EXISTS "waste_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"paper_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"glass_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"plastic_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"food_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"metal_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"electronic_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waste_logs_property_date_unique" UNIQUE("property_id","log_date")
);
--> statement-breakpoint

ALTER TABLE "waste_logs"
  ADD CONSTRAINT "waste_logs_property_id_properties_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "waste_logs"
  ADD CONSTRAINT "waste_logs_recorded_by_profiles_id_fk"
  FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id")
  ON DELETE set null ON UPDATE no action;
