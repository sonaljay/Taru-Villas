-- Allowed Emails (whitelist for email/password auth)
CREATE TABLE IF NOT EXISTS "allowed_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"added_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_emails_email_unique" UNIQUE("email")
);
--> statement-breakpoint

-- Foreign keys
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_added_by_profiles_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;
