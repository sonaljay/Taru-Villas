import { eq, and, asc } from 'drizzle-orm'
import { db } from '..'
import {
  excursions,
  properties,
  type Excursion,
  type NewExcursion,
} from '../schema'

/**
 * Get all excursions for a property (admin view — includes inactive).
 */
export async function getExcursionsForProperty(propertyId: string): Promise<Excursion[]> {
  return db
    .select()
    .from(excursions)
    .where(eq(excursions.propertyId, propertyId))
    .orderBy(asc(excursions.sortOrder), asc(excursions.createdAt))
}

/**
 * Get active excursions for a property (public page).
 */
export async function getActiveExcursionsForProperty(propertyId: string): Promise<Excursion[]> {
  return db
    .select()
    .from(excursions)
    .where(
      and(
        eq(excursions.propertyId, propertyId),
        eq(excursions.isActive, true)
      )
    )
    .orderBy(asc(excursions.sortOrder), asc(excursions.createdAt))
}

/**
 * Look up an active property by its slug (for public page).
 */
export async function getPropertyBySlug(slug: string) {
  const results = await db
    .select()
    .from(properties)
    .where(
      and(
        eq(properties.slug, slug),
        eq(properties.isActive, true)
      )
    )
    .limit(1)

  return results[0] ?? null
}

/**
 * Get a single excursion by ID.
 */
export async function getExcursionById(id: string): Promise<Excursion | undefined> {
  const results = await db
    .select()
    .from(excursions)
    .where(eq(excursions.id, id))
    .limit(1)

  return results[0]
}

/**
 * Create a new excursion.
 */
export async function createExcursion(data: NewExcursion): Promise<Excursion> {
  const results = await db.insert(excursions).values(data).returning()
  return results[0]
}

/**
 * Update an existing excursion.
 */
export async function updateExcursion(
  id: string,
  data: Partial<Omit<NewExcursion, 'id'>>
): Promise<Excursion | undefined> {
  const results = await db
    .update(excursions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(excursions.id, id))
    .returning()

  return results[0]
}

/**
 * Permanently delete an excursion.
 */
export async function deleteExcursion(id: string): Promise<void> {
  await db.delete(excursions).where(eq(excursions.id, id))
}
