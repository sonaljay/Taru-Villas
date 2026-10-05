-- Additive, repeatable email review and bounded-enqueue state. Apply after 0038.
ALTER TABLE guest_email_settings ADD COLUMN IF NOT EXISTS preview_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE guest_email_settings ADD COLUMN IF NOT EXISTS enqueue_cursor uuid;
ALTER TABLE guest_email_deliveries ADD COLUMN IF NOT EXISTS reviewed_source_hash text;
CREATE INDEX IF NOT EXISTS guest_email_deliveries_ready ON guest_email_deliveries(state,due_at,next_attempt_at);
CREATE INDEX IF NOT EXISTS guest_profiles_email_candidates ON guest_profiles(property_id,id) WHERE stay_state='reserved' AND oracle_environment='production';
