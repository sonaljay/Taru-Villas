BEGIN;
CREATE TABLE task_committees (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
 name text NOT NULL, is_operations boolean NOT NULL DEFAULT false, archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,name), UNIQUE(id,org_id)
);
CREATE UNIQUE INDEX task_operations_unique ON task_committees(org_id) WHERE is_operations;
CREATE TABLE task_committee_members (
 committee_id uuid NOT NULL REFERENCES task_committees(id), profile_id uuid NOT NULL REFERENCES profiles(id),
 PRIMARY KEY(committee_id,profile_id)
);
ALTER TABLE tasks ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE tasks ADD COLUMN committee_id uuid;
ALTER TABLE tasks ADD COLUMN approval text NOT NULL DEFAULT 'not_required' CHECK(approval IN ('not_required','pending','approved','rejected'));
ALTER TABLE tasks ADD COLUMN approval_cycle integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN version integer NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN paused_status task_status;
ALTER TABLE tasks ADD COLUMN archived_at timestamptz;
ALTER TABLE tasks ADD COLUMN deadline_version integer NOT NULL DEFAULT 0;
INSERT INTO task_committees(org_id,name,is_operations) SELECT id,'Operations Committee',true FROM organizations;
UPDATE tasks SET committee_id=c.id FROM task_committees c WHERE c.org_id=tasks.org_id AND c.is_operations;
ALTER TABLE tasks ALTER COLUMN committee_id SET NOT NULL;
ALTER TABLE tasks ADD CONSTRAINT task_committee_org_fk FOREIGN KEY(committee_id,org_id) REFERENCES task_committees(id,org_id);
CREATE INDEX task_scope_idx ON tasks(org_id,committee_id,property_id);
CREATE TABLE task_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id uuid NOT NULL REFERENCES organizations(id),
 task_id uuid REFERENCES tasks(id), committee_id uuid REFERENCES task_committees(id),
 actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL, actor_name text NOT NULL,
 kind text NOT NULL, before_value jsonb, after_value jsonb,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_events_page ON task_events(task_id,created_at,id);
CREATE TABLE task_approval_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id),
 cycle integer NOT NULL, committee_id uuid NOT NULL REFERENCES task_committees(id),
 actor_id uuid NOT NULL REFERENCES profiles(id), decision text NOT NULL CHECK(decision IN ('approved','rejected')),
 note text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(task_id,cycle)
);
CREATE TABLE task_comments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id),
 actor_id uuid NOT NULL REFERENCES profiles(id), body text NOT NULL CHECK(length(trim(body))>0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_attachments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id),
 actor_id uuid NOT NULL REFERENCES profiles(id), name text NOT NULL, storage_path text NOT NULL UNIQUE,
 content_type text NOT NULL, size integer NOT NULL CHECK(size>0 AND size<=10485760),
 removed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE task_notification_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), task_id uuid NOT NULL REFERENCES tasks(id),
 profile_id uuid NOT NULL REFERENCES profiles(id), event_key text NOT NULL, kind text NOT NULL,
 channel text NOT NULL CHECK(channel IN ('in_app','email')), payload jsonb NOT NULL DEFAULT '{}',
 state text NOT NULL DEFAULT 'pending', attempts integer NOT NULL DEFAULT 0,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, sent_at timestamptz,
 provider_id text, error text, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(event_key,profile_id,channel)
);
CREATE INDEX task_delivery_pending ON task_notification_deliveries(state,available_at);
CREATE TABLE task_file_cleanup (
 storage_path text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO task_events(org_id,task_id,actor_name,kind,after_value)
 SELECT org_id,id,'Migration','migration',jsonb_build_object('committeeId',committee_id,'approval',approval) FROM tasks;
CREATE FUNCTION task_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Task history is append-only'; END $$;
CREATE TRIGGER task_event_immutable BEFORE UPDATE OR DELETE ON task_events FOR EACH ROW EXECUTE FUNCTION task_append_only();
CREATE TRIGGER task_decision_immutable BEFORE UPDATE OR DELETE ON task_approval_decisions FOR EACH ROW EXECUTE FUNCTION task_append_only();
CREATE TRIGGER task_comment_immutable BEFORE UPDATE OR DELETE ON task_comments FOR EACH ROW EXECUTE FUNCTION task_append_only();
CREATE FUNCTION task_actor() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.task_actor',true),'')::uuid $$;
CREATE FUNCTION task_actor_name() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce((SELECT full_name FROM profiles WHERE id=task_actor()),nullif(current_setting('app.task_source',true),''),'System') $$;
CREATE FUNCTION task_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Archive tasks instead of deleting audit history'; END IF;
 IF TG_OP='INSERT' AND NEW.committee_id IS NULL THEN
  INSERT INTO task_committees(org_id,name,is_operations) VALUES(NEW.org_id,'Operations Committee',true) ON CONFLICT DO NOTHING;
  SELECT id INTO NEW.committee_id FROM task_committees WHERE org_id=NEW.org_id AND is_operations;
 END IF;
 IF NEW.property_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM properties WHERE id=NEW.property_id AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'Invalid task property'; END IF;
 IF NEW.project_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM projects WHERE id=NEW.project_id AND org_id=NEW.org_id) THEN RAISE EXCEPTION 'Invalid task project'; END IF;
 IF TG_OP='UPDATE' THEN
  IF NEW.org_id<>OLD.org_id THEN RAISE EXCEPTION 'Task organization cannot change'; END IF;
  NEW.version:=OLD.version+1; NEW.updated_at:=now();
  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN NEW.deadline_version:=OLD.deadline_version+1; END IF;
  IF NEW.committee_id<>OLD.committee_id THEN
   IF OLD.status='done' THEN RAISE EXCEPTION 'Reopen completed tasks before transfer'; END IF;
   NEW.approval:='pending'; NEW.approval_cycle:=OLD.approval_cycle+1;
  END IF;
  IF OLD.approval='approved' AND (NEW.title,NEW.description,NEW.property_id,NEW.project_id) IS DISTINCT FROM (OLD.title,OLD.description,OLD.property_id,OLD.project_id) THEN
   NEW.approval:='pending'; NEW.approval_cycle:=OLD.approval_cycle+1;
  END IF;
  IF NEW.approval IN ('pending','rejected') AND OLD.approval IS DISTINCT FROM NEW.approval AND OLD.status='in_progress' THEN
   NEW.paused_status:=OLD.status; NEW.status:='stuck';
  END IF;
 END IF;
 IF NEW.approval IN ('pending','rejected') AND NEW.status IN ('in_progress','done') THEN RAISE EXCEPTION 'Task approval required before starting or completing'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status='done' THEN NEW.completed_at:=coalesce(NEW.completed_at,now()); END IF;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  NEW.completed_at:=CASE WHEN NEW.status='done' THEN now() ELSE NULL END;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_guard_before BEFORE INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION task_guard();
CREATE FUNCTION task_record_event() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE event_id uuid; event_kind text;
BEGIN
 event_kind:=coalesce(nullif(current_setting('app.task_action',true),''),lower(TG_OP));
 INSERT INTO task_events(org_id,task_id,actor_id,actor_name,kind,before_value,after_value)
 VALUES(NEW.org_id,NEW.id,task_actor(),task_actor_name(),event_kind,CASE WHEN TG_OP='UPDATE' THEN to_jsonb(OLD) END,to_jsonb(NEW)) RETURNING id INTO event_id;
 IF NEW.approval='pending' AND (TG_OP='INSERT' OR OLD.approval<>'pending' OR OLD.approval_cycle<>NEW.approval_cycle) THEN
  INSERT INTO task_notification_deliveries(task_id,profile_id,event_key,kind,channel,payload)
  SELECT NEW.id,m.profile_id,event_id::text,'approval_request',ch,jsonb_build_object('cycle',NEW.approval_cycle,'committeeId',NEW.committee_id)
  FROM task_committee_members m JOIN profiles p ON p.id=m.profile_id CROSS JOIN unnest(ARRAY['in_app','email']) ch
  WHERE m.committee_id=NEW.committee_id AND p.is_active AND p.org_id=NEW.org_id;
 ELSIF TG_OP='UPDATE' AND NEW.approval IN ('approved','rejected') AND NEW.approval IS DISTINCT FROM OLD.approval THEN
  INSERT INTO task_notification_deliveries(task_id,profile_id,event_key,kind,channel)
  SELECT NEW.id,a.profile_id,event_id::text,'approval_'||NEW.approval,ch FROM task_assignees a
  CROSS JOIN unnest(ARRAY['in_app','email']) ch WHERE a.task_id=NEW.id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER task_event_after AFTER INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION task_record_event();
CREATE FUNCTION task_related_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE tid uuid; org uuid; event_id uuid; row_value jsonb;
BEGIN
 row_value:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
 tid:=(row_value->>'task_id')::uuid;
 SELECT org_id INTO org FROM tasks WHERE id=tid FOR UPDATE;
 IF TG_TABLE_NAME='task_assignees' AND TG_OP='INSERT' AND NOT EXISTS(SELECT 1 FROM profiles WHERE id=(row_value->>'profile_id')::uuid AND org_id=org AND is_active) THEN RAISE EXCEPTION 'Invalid task assignee'; END IF;
 IF TG_TABLE_NAME IN ('task_assignees','task_attachments') THEN
  UPDATE tasks SET approval=CASE WHEN approval='approved' THEN 'pending' ELSE approval END,
   approval_cycle=approval_cycle+CASE WHEN approval='approved' THEN 1 ELSE 0 END WHERE id=tid;
 END IF;
 INSERT INTO task_events(org_id,task_id,actor_id,actor_name,kind,before_value,after_value)
 VALUES(org,tid,task_actor(),task_actor_name(),TG_TABLE_NAME||'_'||lower(TG_OP),CASE WHEN TG_OP<>'INSERT' THEN to_jsonb(OLD) END,CASE WHEN TG_OP<>'DELETE' THEN to_jsonb(NEW) END) RETURNING id INTO event_id;
 IF TG_TABLE_NAME='task_assignees' AND TG_OP='INSERT' THEN
  INSERT INTO task_notification_deliveries(task_id,profile_id,event_key,kind,channel)
   SELECT tid,(row_value->>'profile_id')::uuid,event_id::text,'assignment',ch FROM unnest(ARRAY['in_app','email']) ch;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER task_assignee_audit AFTER INSERT OR DELETE ON task_assignees FOR EACH ROW EXECUTE FUNCTION task_related_audit();
CREATE TRIGGER task_comment_audit AFTER INSERT ON task_comments FOR EACH ROW EXECUTE FUNCTION task_related_audit();
CREATE TRIGGER task_attachment_audit AFTER INSERT OR UPDATE ON task_attachments FOR EACH ROW EXECUTE FUNCTION task_related_audit();
CREATE FUNCTION task_org_default() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 INSERT INTO task_committees(org_id,name,is_operations) VALUES(NEW.id,'Operations Committee',true);
 RETURN NEW;
END $$;
CREATE TRIGGER task_org_default_after AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION task_org_default();
ALTER TABLE task_committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_approval_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_file_cleanup ENABLE ROW LEVEL SECURITY;
COMMIT;
