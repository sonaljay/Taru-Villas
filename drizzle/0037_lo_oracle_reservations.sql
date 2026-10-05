-- Additive, repeatable migration. No shared database changes during development.
CREATE TABLE IF NOT EXISTS oracle_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  environment varchar(20) NOT NULL DEFAULT 'production' CHECK (environment = 'production'),
  from_date date NOT NULL, to_date date NOT NULL,
  phase text NOT NULL DEFAULT 'arrivals:0', "offset" integer NOT NULL DEFAULT 0,
  state varchar(20) NOT NULL DEFAULT 'running' CHECK (state IN ('running','complete','failed')),
  lease_owner uuid, lease_until timestamptz, error text,
  started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oracle_sync_runs_range CHECK (to_date >= from_date AND "offset" >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS oracle_sync_runs_one_running ON oracle_sync_runs(property_id) WHERE state='running';
CREATE TABLE IF NOT EXISTS oracle_sync_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oracle_sync_runs(id) ON DELETE CASCADE,
  oracle_reservation_id varchar(255) NOT NULL, booking jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT oracle_sync_staging_run_reservation_unique UNIQUE(run_id, oracle_reservation_id)
);
ALTER TABLE guest_profiles
  ADD COLUMN IF NOT EXISTS guest_phone text,
  ADD COLUMN IF NOT EXISTS room_quantity integer,
  ADD COLUMN IF NOT EXISTS adult_count integer,
  ADD COLUMN IF NOT EXISTS child_count integer,
  ADD COLUMN IF NOT EXISTS stay_state varchar(30) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS channel_code text,
  ADD COLUMN IF NOT EXISTS source_code text,
  ADD COLUMN IF NOT EXISTS market_code text,
  ADD COLUMN IF NOT EXISTS is_room_reservation boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_pseudo_room boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventory_group_id text,
  ADD COLUMN IF NOT EXISTS inventory_disposition varchar(30) NOT NULL DEFAULT 'unresolved',
  ADD COLUMN IF NOT EXISTS oracle_environment varchar(20) NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS last_synced_run_id uuid REFERENCES oracle_sync_runs(id) ON DELETE SET NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_room_quantity') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_room_quantity CHECK (room_quantity IS NULL OR room_quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_adult_count') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_adult_count CHECK (adult_count IS NULL OR adult_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_child_count') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_child_count CHECK (child_count IS NULL OR child_count >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_stay_state') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_stay_state CHECK (stay_state IN ('reserved','in_house','checked_out','cancelled','no_show','waitlist','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_inventory_disposition') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_inventory_disposition CHECK (inventory_disposition IN ('count','secondary_share','unresolved'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='guest_profiles'::regclass AND conname='guest_profiles_oracle_environment') THEN
    ALTER TABLE guest_profiles ADD CONSTRAINT guest_profiles_oracle_environment CHECK (oracle_environment='production');
  END IF;
END $$;
-- Block direct browser-role access to imported PII and staging; server DB role handles scope.
ALTER TABLE oracle_sync_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oracle_sync_staging ENABLE ROW LEVEL SECURITY;
