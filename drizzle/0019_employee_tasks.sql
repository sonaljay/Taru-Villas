CREATE TYPE task_status AS ENUM ('todo','in_progress','stuck','done');
--> statement-breakpoint
CREATE TYPE task_priority AS ENUM ('low','medium','high');
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  name varchar(255) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT task_teams_org_name_unique UNIQUE (org_id, name)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id),
  title text NOT NULL,
  description text,
  status task_status NOT NULL DEFAULT 'todo',
  priority task_priority NOT NULL DEFAULT 'medium',
  property_id uuid REFERENCES properties(id) ON DELETE SET NULL,
  due_date date,
  start_date date,
  position integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_assignees (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT task_assignees_pk UNIQUE (task_id, profile_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS task_team_links (
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES task_teams(id) ON DELETE CASCADE,
  CONSTRAINT task_team_links_pk UNIQUE (task_id, team_id)
);
