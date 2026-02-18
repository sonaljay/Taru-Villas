import { eq, and, asc, inArray } from 'drizzle-orm'
import { db } from '..'
import {
  menuCategories,
  menuItems,
  type MenuCategory,
  type NewMenuCategory,
  type MenuItem,
  type NewMenuItem,
} from '../schema'

// ---------------------------------------------------------------------------
// Menu Categories
// ---------------------------------------------------------------------------

export type MenuCategoryWithItems = MenuCategory & { menuItems: MenuItem[] }

/**
 * Get all categories for a property with nested items (admin view — includes inactive).
 */
export async function getMenuCategoriesForProperty(
  propertyId: string
): Promise<MenuCategoryWithItems[]> {
  const categories = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.propertyId, propertyId))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt))

  if (categories.length === 0) return []

  const categoryIds = categories.map((c) => c.id)
  const items = await db
    .select()
    .from(menuItems)
    .where(inArray(menuItems.categoryId, categoryIds))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt))

  const itemsByCategory = new Map<string, MenuItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? []
    list.push(item)
    itemsByCategory.set(item.categoryId, list)
  }

  return categories.map((cat) => ({
    ...cat,
    menuItems: itemsByCategory.get(cat.id) ?? [],
  }))
}

/**
 * Get active categories with active items for a property (public page).
 * Filters out empty categories (no active items).
 */
export async function getActiveMenuForProperty(
  propertyId: string
): Promise<MenuCategoryWithItems[]> {
  const categories = await db
    .select()
    .from(menuCategories)
    .where(
      and(
        eq(menuCategories.propertyId, propertyId),
        eq(menuCategories.isActive, true)
      )
    )
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt))

  if (categories.length === 0) return []

  const categoryIds = categories.map((c) => c.id)
  const items = await db
    .select()
    .from(menuItems)
    .where(
      and(
        inArray(menuItems.categoryId, categoryIds),
        eq(menuItems.isActive, true)
      )
    )
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt))

  const itemsByCategory = new Map<string, MenuItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? []
    list.push(item)
    itemsByCategory.set(item.categoryId, list)
  }

  return categories
    .map((cat) => ({
      ...cat,
      menuItems: itemsByCategory.get(cat.id) ?? [],
    }))
    .filter((cat) => cat.menuItems.length > 0)
}

/**
 * Get a single category by ID.
 */
export async function getMenuCategoryById(
  id: string
): Promise<MenuCategory | undefined> {
  const results = await db
    .select()
    .from(menuCategories)
    .where(eq(menuCategories.id, id))
    .limit(1)

  return results[0]
}

/**
 * Create a new menu category.
 */
export async function createMenuCategory(
  data: NewMenuCategory
): Promise<MenuCategory> {
  const results = await db.insert(menuCategories).values(data).returning()
  return results[0]
}

/**
 * Update an existing menu category.
 */
export async function updateMenuCategory(
  id: string,
  data: Partial<Omit<NewMenuCategory, 'id'>>
): Promise<MenuCategory | undefined> {
  const results = await db
    .update(menuCategories)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(menuCategories.id, id))
    .returning()

  return results[0]
}

/**
 * Delete a menu category (items cascade-delete).
 */
export async function deleteMenuCategory(id: string): Promise<void> {
  await db.delete(menuCategories).where(eq(menuCategories.id, id))
}

// ---------------------------------------------------------------------------
// Menu Items
// ---------------------------------------------------------------------------

/**
 * Get a single menu item by ID.
 */
export async function getMenuItemById(
  id: string
): Promise<MenuItem | undefined> {
  const results = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.id, id))
    .limit(1)

  return results[0]
}

/**
 * Get all menu items for a category.
 */
export async function getMenuItemsForCategory(
  categoryId: string
): Promise<MenuItem[]> {
  return db
    .select()
    .from(menuItems)
    .where(eq(menuItems.categoryId, categoryId))
    .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt))
}

/**
 * Create a new menu item.
 */
export async function createMenuItem(data: NewMenuItem): Promise<MenuItem> {
  const results = await db.insert(menuItems).values(data).returning()
  return results[0]
}

/**
 * Update an existing menu item.
 */
export async function updateMenuItem(
  id: string,
  data: Partial<Omit<NewMenuItem, 'id'>>
): Promise<MenuItem | undefined> {
  const results = await db
    .update(menuItems)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(menuItems.id, id))
    .returning()

  return results[0]
}

/**
 * Delete a menu item.
 */
export async function deleteMenuItem(id: string): Promise<void> {
  await db.delete(menuItems).where(eq(menuItems.id, id))
}
