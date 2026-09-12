CREATE TABLE IF NOT EXISTS visit_report_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_report_reasons_org_name_unique UNIQUE(org_id, name)
);

CREATE TABLE IF NOT EXISTS visit_report_observation_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  primary_reason_id uuid NOT NULL REFERENCES visit_report_reasons(id) ON DELETE RESTRICT,
  name varchar(255) NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visit_report_observation_categories_reason_name_unique UNIQUE(primary_reason_id, name)
);

ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS primary_reason_id uuid REFERENCES visit_report_reasons(id) ON DELETE RESTRICT;
ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS primary_reason_name text;
ALTER TABLE fleet_trip_reports ADD COLUMN IF NOT EXISTS open_comments text;

CREATE TABLE IF NOT EXISTS fleet_trip_report_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  report_id uuid NOT NULL REFERENCES fleet_trip_reports(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES visit_report_observation_categories(id) ON DELETE RESTRICT,
  category_name text NOT NULL,
  finding text NOT NULL,
  task_id uuid REFERENCES tasks(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_trip_report_observations_report_idx ON fleet_trip_report_observations(report_id);

INSERT INTO visit_report_reasons (org_id, name, sort_order)
SELECT organizations.id, defaults.name, defaults.sort_order
FROM organizations
CROSS JOIN (VALUES
  ('Food & Beverage', 10),
  ('Training & Development', 20),
  ('Finance', 30),
  ('Sales & Marketing', 40)
) AS defaults(name, sort_order)
ON CONFLICT (org_id, name) DO NOTHING;

INSERT INTO visit_report_observation_categories (org_id, primary_reason_id, name, sort_order)
SELECT reasons.org_id, reasons.id, defaults.name, defaults.sort_order
FROM visit_report_reasons AS reasons
JOIN (VALUES
  ('Food & Beverage', 'Food quality & menu execution', 10),
  ('Food & Beverage', 'Service standards & guest experience', 20),
  ('Food & Beverage', 'Hygiene, food safety & compliance', 30),
  ('Food & Beverage', 'Beverage programme & bar operations', 40),
  ('Food & Beverage', 'Cost control, inventory & waste', 50),
  ('Training & Development', 'Service skills & SOP adherence', 10),
  ('Training & Development', 'Onboarding, knowledge gaps & coaching', 20),
  ('Training & Development', 'Leadership & team engagement', 30),
  ('Training & Development', 'Health, safety & emergency readiness', 40),
  ('Training & Development', 'Digital systems & reporting adoption', 50),
  ('Finance', 'Revenue controls & cash handling', 10),
  ('Finance', 'Budget & cost variance', 20),
  ('Finance', 'Procurement, inventory & supplier controls', 30),
  ('Finance', 'Payroll & labour productivity', 40),
  ('Finance', 'Asset, audit & compliance', 50),
  ('Sales & Marketing', 'Brand standards & collateral', 10),
  ('Sales & Marketing', 'Guest feedback, reputation & recovery', 20),
  ('Sales & Marketing', 'Distribution, OTAs & reservations', 30),
  ('Sales & Marketing', 'Sales pipeline & partnerships', 40),
  ('Sales & Marketing', 'Campaign performance & digital presence', 50)
) AS defaults(reason_name, name, sort_order) ON defaults.reason_name = reasons.name
ON CONFLICT (primary_reason_id, name) DO NOTHING;

-- Bring every live request into the new, request-time report lifecycle.
INSERT INTO fleet_trip_reports (org_id, request_id, task_id, submitted_by, due_at, details)
SELECT requests.org_id,
  requests.id,
  requests.task_id,
  COALESCE(requests.report_owner_id, requests.requested_by),
  NULL,
  jsonb_build_object('visitPurpose', COALESCE(requests.purpose, ''), 'visitLocation', COALESCE(properties.name, requests.destination_text, ''), 'visitDate', requests.end_date)
FROM fleet_requests AS requests
LEFT JOIN properties ON properties.id = requests.target_property_id
LEFT JOIN fleet_trip_reports AS reports ON reports.request_id = requests.id
WHERE requests.status <> 'cancelled' AND reports.id IS NULL;
