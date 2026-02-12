-- 1. Create survey_type enum
DO $$ BEGIN
  CREATE TYPE "public"."survey_type" AS ENUM('internal', 'guest');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add survey_type column to survey_templates (default 'internal')
ALTER TABLE "survey_templates" ADD COLUMN IF NOT EXISTS "survey_type" "survey_type" DEFAULT 'internal' NOT NULL;

-- 3. Create survey_subcategories table
CREATE TABLE IF NOT EXISTS "survey_subcategories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "category_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "survey_subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "survey_categories"("id")
);

-- 4. Add nullable subcategory_id to survey_questions
ALTER TABLE "survey_questions" ADD COLUMN IF NOT EXISTS "subcategory_id" uuid;

-- 5. Data migration: For each existing category, insert a default subcategory,
--    then update all questions in that category to point to the new subcategory.
DO $$
DECLARE
  cat RECORD;
  new_subcat_id uuid;
BEGIN
  FOR cat IN SELECT id, name FROM survey_categories LOOP
    -- Insert a default subcategory named after the category
    INSERT INTO survey_subcategories (id, category_id, name, sort_order)
    VALUES (gen_random_uuid(), cat.id, cat.name, 0)
    RETURNING id INTO new_subcat_id;

    -- Point all questions in this category to the new subcategory
    UPDATE survey_questions
    SET subcategory_id = new_subcat_id
    WHERE category_id = cat.id;
  END LOOP;
END $$;

-- 6. Make subcategory_id NOT NULL and add FK constraint
ALTER TABLE "survey_questions" ALTER COLUMN "subcategory_id" SET NOT NULL;
ALTER TABLE "survey_questions"
  ADD CONSTRAINT "survey_questions_subcategory_id_fkey"
  FOREIGN KEY ("subcategory_id") REFERENCES "survey_subcategories"("id");

-- 7. Drop old category_id FK and column from survey_questions
ALTER TABLE "survey_questions" DROP CONSTRAINT IF EXISTS "survey_questions_category_id_survey_categories_id_fk";
ALTER TABLE "survey_questions" DROP COLUMN IF EXISTS "category_id";

-- 8. Add indexes
CREATE INDEX IF NOT EXISTS "idx_survey_subcategories_category_id" ON "survey_subcategories" ("category_id");
CREATE INDEX IF NOT EXISTS "idx_survey_questions_subcategory_id" ON "survey_questions" ("subcategory_id");
