-- Parent menus table + menu_categories.menu_id / price_note
-- Idempotent / guarded. Apply to Supabase BEFORE merging app code.

CREATE TABLE IF NOT EXISTS menus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  type text NOT NULL,
  day_of_week integer,
  name text NOT NULL,
  description text,
  price_note text,
  footer_note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT menus_type_check CHECK (type IN ('set','a_la_carte')),
  CONSTRAINT menus_day_check CHECK (type = 'a_la_carte' OR (day_of_week BETWEEN 0 AND 6)),
  CONSTRAINT menus_property_type_day_unique UNIQUE (property_id, type, day_of_week)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_menus_property ON menus(property_id);
--> statement-breakpoint
-- one a_la_carte menu per property (day_of_week is NULL so the UNIQUE above won't enforce it)
CREATE UNIQUE INDEX IF NOT EXISTS ux_menus_alacarte_singleton
  ON menus(property_id) WHERE type = 'a_la_carte';
--> statement-breakpoint
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS menu_id uuid;
--> statement-breakpoint
ALTER TABLE menu_categories ADD COLUMN IF NOT EXISTS price_note text;
--> statement-breakpoint
-- Backfill: every existing category gets a default a_la_carte menu per property
INSERT INTO menus (property_id, type, day_of_week, name, sort_order)
SELECT DISTINCT mc.property_id, 'a_la_carte', NULL, 'Menu', 0
FROM menu_categories mc
WHERE mc.menu_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM menus m
    WHERE m.property_id = mc.property_id AND m.type = 'a_la_carte'
  );
--> statement-breakpoint
UPDATE menu_categories mc
SET menu_id = m.id
FROM menus m
WHERE mc.menu_id IS NULL
  AND m.property_id = mc.property_id
  AND m.type = 'a_la_carte';
--> statement-breakpoint
ALTER TABLE menu_categories
  ADD CONSTRAINT menu_categories_menu_id_fk
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE menu_categories ALTER COLUMN menu_id SET NOT NULL;
