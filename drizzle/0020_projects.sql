CREATE TYPE project_status AS ENUM ('active', 'archived');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  description text,
  color varchar(32),
  status project_status NOT NULL DEFAULT 'active',
  target_date date,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
INSERT INTO projects (id, org_id, name, status, created_at, updated_at)
SELECT gen_random_uuid(), id, 'M&S x TVPL', 'active', now(), now()
FROM organizations
LIMIT 1
ON CONFLICT ON CONSTRAINT projects_org_name_unique DO NOTHING;
--> statement-breakpoint
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE RESTRICT;
--> statement-breakpoint
UPDATE tasks SET project_id = (
  SELECT p.id FROM projects p WHERE p.name = 'M&S x TVPL' AND p.org_id = tasks.org_id LIMIT 1
) WHERE project_id IS NULL;
--> statement-breakpoint
ALTER TABLE tasks ALTER COLUMN project_id SET NOT NULL;
