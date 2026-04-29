import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  sopCategories,
  sopTemplates,
  type SopCategory,
  type NewSopCategory,
} from '@/lib/db/schema'

export type SopCategoryWithCount = SopCategory & { templateCount: number }

export async function listCategoriesForOrg(
  orgId: string
): Promise<SopCategoryWithCount[]> {
  const rows = await db
    .select({
      category: sopCategories,
      templateCount: sql<number>`count(${sopTemplates.id})::int`.as('template_count'),
    })
    .from(sopCategories)
    .leftJoin(sopTemplates, eq(sopTemplates.categoryId, sopCategories.id))
    .where(eq(sopCategories.orgId, orgId))
    .groupBy(sopCategories.id)
    .orderBy(asc(sopCategories.sortOrder), asc(sopCategories.name))

  return rows.map((r) => ({ ...r.category, templateCount: Number(r.templateCount) }))
}

export async function createCategory(
  data: Pick<NewSopCategory, 'orgId' | 'name'>
): Promise<SopCategory> {
  // Place new categories at the end of the sort order
  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${sopCategories.sortOrder}), -1)::int` })
    .from(sopCategories)
    .where(eq(sopCategories.orgId, data.orgId))

  const results = await db
    .insert(sopCategories)
    .values({ ...data, sortOrder: Number(maxOrder) + 1 })
    .returning()
  return results[0]
}

export async function updateCategory(
  id: string,
  data: { name: string }
): Promise<SopCategory | undefined> {
  const results = await db
    .update(sopCategories)
    .set({ name: data.name, updatedAt: new Date() })
    .where(eq(sopCategories.id, id))
    .returning()
  return results[0]
}

export async function deleteCategory(id: string): Promise<void> {
  await db.delete(sopCategories).where(eq(sopCategories.id, id))
}

export async function countTemplatesUsingCategory(id: string): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(sopTemplates)
    .where(eq(sopTemplates.categoryId, id))
  return Number(count)
}

export async function reorderCategories(
  orgId: string,
  orderedIds: string[]
): Promise<void> {
  if (orderedIds.length === 0) return
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(sopCategories)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(and(eq(sopCategories.id, orderedIds[i]), eq(sopCategories.orgId, orgId)))
    }
  })
}

export async function getCategoryById(
  id: string
): Promise<SopCategory | undefined> {
  const results = await db
    .select()
    .from(sopCategories)
    .where(eq(sopCategories.id, id))
    .limit(1)
  return results[0]
}
