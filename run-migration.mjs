/**
 * One-time migration: Mark auto-created subcategories as transparent.
 *
 * When subcategories were first introduced, every category got a default
 * subcategory whose name matched the parent category name.  This migration
 * sets those names to '' so the UI treats them as "no subcategory".
 *
 * Usage:  node run-migration.mjs
 */

import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
import postgres from 'postgres'

const url = (process.env.POSTGRES_URL || process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Missing DATABASE_URL or POSTGRES_URL')
  process.exit(1)
}

const sql = postgres(url, { prepare: false })

try {
  const result = await sql`
    UPDATE survey_subcategories sc
    SET name = ''
    FROM survey_categories c
    WHERE sc.category_id = c.id
      AND sc.name = c.name
  `
  console.log('Migration complete — rows updated:', result.count)
} catch (err) {
  console.error('Migration failed:', err)
  process.exit(1)
} finally {
  await sql.end()
}
