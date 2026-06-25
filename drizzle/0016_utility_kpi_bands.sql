DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='electricity_kpi_bands')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name='utility_kpi_bands') THEN
    ALTER TABLE "electricity_kpi_bands" RENAME TO "utility_kpi_bands";
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" ADD COLUMN IF NOT EXISTS "utility_type" "utility_type";--> statement-breakpoint
UPDATE "utility_kpi_bands" SET "utility_type"='electricity' WHERE "utility_type" IS NULL;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" ALTER COLUMN "utility_type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "utility_kpi_bands" DROP CONSTRAINT IF EXISTS "electricity_kpi_bands_property_minguests_unique";--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='utility_kpi_bands_property_type_minguests_unique') THEN
    ALTER TABLE "utility_kpi_bands" ADD CONSTRAINT "utility_kpi_bands_property_type_minguests_unique" UNIQUE("property_id","utility_type","min_guests");
  END IF;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS "utility_kpi_targets";--> statement-breakpoint
INSERT INTO "utility_kpi_bands" ("property_id","utility_type","min_guests","target_units") VALUES
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',0,7),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',1,10),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',6,10),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',11,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',16,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',21,11),
  ('5351150a-080b-446b-a9d5-a2cb93109332','water',26,4)
ON CONFLICT ("property_id","utility_type","min_guests") DO NOTHING;
