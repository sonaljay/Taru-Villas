-- Additive, repeatable migration: apply only after 0037.
CREATE UNIQUE INDEX IF NOT EXISTS properties_scope_unique ON properties(id,org_id);
ALTER TABLE guest_profiles ADD COLUMN IF NOT EXISTS first_imported_at timestamptz, ADD COLUMN IF NOT EXISTS questionnaire_status varchar(20);
UPDATE guest_profiles SET first_imported_at=created_at WHERE first_imported_at IS NULL;
UPDATE guest_profiles SET questionnaire_status=CASE WHEN status='pending_approval' THEN 'submitted' ELSE 'not_started' END WHERE questionnaire_status IS NULL;
ALTER TABLE guest_profiles ALTER COLUMN first_imported_at SET DEFAULT now(), ALTER COLUMN first_imported_at SET NOT NULL, ALTER COLUMN questionnaire_status SET DEFAULT 'not_started', ALTER COLUMN questionnaire_status SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS guest_profiles_scope_unique ON guest_profiles(id,org_id,property_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_questionnaire_status') THEN ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_questionnaire_status CHECK (questionnaire_status IN ('not_started','submitted','reviewed')); END IF; END $$;

CREATE TABLE IF NOT EXISTS guest_portal_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  encrypted_token text NOT NULL,
  version integer NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz ,
  issued_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_portal_access_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE,
  UNIQUE(id,org_id,property_id,guest_profile_id),
  UNIQUE(guest_profile_id,version)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_portal_access'::regclass AND conname='guest_portal_access_property_scope') THEN ALTER TABLE guest_portal_access ADD CONSTRAINT guest_portal_access_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_portal_access ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS guest_portal_access_one_active ON guest_portal_access(guest_profile_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS guest_portal_access_property ON guest_portal_access(org_id, property_id);
CREATE TABLE IF NOT EXISTS guest_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  access_id uuid NOT NULL REFERENCES guest_portal_access(id),
  submission_id uuid NOT NULL,
  payload_hash text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dining','excursion','service')),
  item_id uuid ,
  item_kind text ,
  title text NOT NULL,
  notes text NOT NULL DEFAULT '',
  requested_date date ,
  requested_time text ,
  party_size integer CHECK (party_size IS NULL OR party_size BETWEEN 1 AND 50),
  quantity integer CHECK (quantity IS NULL OR quantity BETWEEN 1 AND 50),
  price_note text ,
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','in_progress','completed','declined')),
  public_reply text ,
  internal_note text ,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_requests_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE,
  CONSTRAINT guest_requests_access_scope FOREIGN KEY (access_id,org_id,property_id,guest_profile_id) REFERENCES guest_portal_access(id,org_id,property_id,guest_profile_id),
  UNIQUE(guest_profile_id,submission_id)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_requests'::regclass AND conname='guest_requests_property_scope') THEN ALTER TABLE guest_requests ADD CONSTRAINT guest_requests_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guest_requests_property ON guest_requests(org_id, property_id);
CREATE TABLE IF NOT EXISTS guest_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES guest_requests(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES profiles(id),
  kind text NOT NULL,
  from_state text NOT NULL,
  to_state text NOT NULL,
  public_reply text ,
  internal_note text ,
  reason text ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_request_events_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_request_events'::regclass AND conname='guest_request_events_property_scope') THEN ALTER TABLE guest_request_events ADD CONSTRAINT guest_request_events_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_request_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guest_request_events_property ON guest_request_events(org_id, property_id);
CREATE TABLE IF NOT EXISTS guest_email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  enabled_at timestamptz ,
  enabled_by uuid REFERENCES profiles(id),
  preview_version uuid ,
  preview_count integer ,
  preview_at timestamptz ,
  preview_kind text ,
  preview_hash text ,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_email_settings'::regclass AND conname='guest_email_settings_property_scope') THEN ALTER TABLE guest_email_settings ADD CONSTRAINT guest_email_settings_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_email_settings ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guest_email_settings_property ON guest_email_settings(org_id, property_id);
CREATE TABLE IF NOT EXISTS guest_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  access_id uuid NOT NULL REFERENCES guest_portal_access(id),
  access_version integer NOT NULL,
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('welcome','catch_up','resend')),
  due_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','sending','accepted','failed','held','cancelled')),
  lease_owner uuid ,
  lease_until timestamptz ,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz ,
  started_at timestamptz ,
  encrypted_payload text ,
  recipient_hash text ,
  provider_id text ,
  accepted_at timestamptz ,
  last_error text ,
  requested_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_email_deliveries_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE,
  CONSTRAINT guest_email_deliveries_access_scope FOREIGN KEY (access_id,org_id,property_id,guest_profile_id) REFERENCES guest_portal_access(id,org_id,property_id,guest_profile_id)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_email_deliveries'::regclass AND conname='guest_email_deliveries_property_scope') THEN ALTER TABLE guest_email_deliveries ADD CONSTRAINT guest_email_deliveries_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_email_deliveries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guest_email_deliveries_property ON guest_email_deliveries(org_id, property_id);
CREATE TABLE IF NOT EXISTS guest_portal_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  access_id uuid NOT NULL REFERENCES guest_portal_access(id),
  object_path text NOT NULL UNIQUE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','application/pdf')),
  byte_size integer NOT NULL CHECK (byte_size BETWEEN 1 AND 8388608),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','submitted','deleted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT guest_portal_uploads_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE,
  CONSTRAINT guest_portal_uploads_access_scope FOREIGN KEY (access_id,org_id,property_id,guest_profile_id) REFERENCES guest_portal_access(id,org_id,property_id,guest_profile_id)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_portal_uploads'::regclass AND conname='guest_portal_uploads_property_scope') THEN ALTER TABLE guest_portal_uploads ADD CONSTRAINT guest_portal_uploads_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_portal_uploads ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS guest_portal_uploads_property ON guest_portal_uploads(org_id, property_id);
CREATE TABLE IF NOT EXISTS pre_arrival_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  guest_profile_id uuid NOT NULL REFERENCES guest_profiles(id) ON DELETE CASCADE,
  submission_id uuid NOT NULL,
  payload_hash text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz ,
  reviewed_by uuid REFERENCES profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_arrival_submissions_booking_scope FOREIGN KEY (guest_profile_id,org_id,property_id) REFERENCES guest_profiles(id,org_id,property_id) ON DELETE CASCADE,
  UNIQUE(guest_profile_id,submission_id)
);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pre_arrival_submissions'::regclass AND conname='pre_arrival_submissions_property_scope') THEN ALTER TABLE pre_arrival_submissions ADD CONSTRAINT pre_arrival_submissions_property_scope FOREIGN KEY (property_id,org_id) REFERENCES properties(id,org_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE pre_arrival_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS pre_arrival_submissions_property ON pre_arrival_submissions(org_id, property_id);
ALTER TABLE pre_arrival_answers ADD COLUMN IF NOT EXISTS submission_id uuid REFERENCES pre_arrival_submissions(id) ON DELETE CASCADE, ADD COLUMN IF NOT EXISTS upload_id uuid REFERENCES guest_portal_uploads(id), ADD COLUMN IF NOT EXISTS type_snapshot text, ADD COLUMN IF NOT EXISTS options_snapshot text[] NOT NULL DEFAULT '{}';
CREATE UNIQUE INDEX IF NOT EXISTS pre_arrival_one_active_eta ON pre_arrival_questions(property_id) WHERE is_active AND maps_to_eta;
CREATE INDEX IF NOT EXISTS guest_email_deliveries_queue ON guest_email_deliveries(state, next_attempt_at, due_at);

CREATE UNIQUE INDEX IF NOT EXISTS guest_requests_scope_unique ON guest_requests(id,org_id,property_id,guest_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS guest_portal_uploads_scope_unique ON guest_portal_uploads(id,guest_profile_id);
CREATE UNIQUE INDEX IF NOT EXISTS pre_arrival_submissions_scope_unique ON pre_arrival_submissions(id,guest_profile_id);
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_request_events'::regclass AND conname='guest_request_events_request_scope') THEN ALTER TABLE guest_request_events ADD CONSTRAINT guest_request_events_request_scope FOREIGN KEY (request_id,org_id,property_id,guest_profile_id) REFERENCES guest_requests(id,org_id,property_id,guest_profile_id) ON DELETE CASCADE; END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pre_arrival_answers'::regclass AND conname='pre_arrival_answers_upload_owner') THEN ALTER TABLE pre_arrival_answers ADD CONSTRAINT pre_arrival_answers_upload_owner FOREIGN KEY (upload_id,guest_profile_id) REFERENCES guest_portal_uploads(id,guest_profile_id); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='pre_arrival_answers'::regclass AND conname='pre_arrival_answers_submission_owner') THEN ALTER TABLE pre_arrival_answers ADD CONSTRAINT pre_arrival_answers_submission_owner FOREIGN KEY (submission_id,guest_profile_id) REFERENCES pre_arrival_submissions(id,guest_profile_id) ON DELETE CASCADE; END IF; END $$;
ALTER TABLE guest_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE pre_arrival_answers ENABLE ROW LEVEL SECURITY;
