import { eq, and, asc, inArray } from 'drizzle-orm'
import { db } from '..'
import {
  menus,
  menuCategories,
  menuItems,
  type Menu,
  type NewMenu,
  type MenuCategory,
  type NewMenuCategory,
  type MenuItem,
  type NewMenuItem,
} from '../schema'

export type MenuCategoryWithItems = MenuCategory & { menuItems: MenuItem[] }
export type MenuWithCategories = Menu & { categories: MenuCategoryWithItems[] }

// ---------------------------------------------------------------------------
// Private helper
// ---------------------------------------------------------------------------

/** Attach active|all categories (each with items) to the given menus. */
async function attachCategories(
  menuRows: Menu[],
  opts: { activeOnly: boolean }
): Promise<MenuWithCategories[]> {
  if (menuRows.length === 0) return []
  const menuIds = menuRows.map((m) => m.id)

  const catConds = [inArray(menuCategories.menuId, menuIds)]
  if (opts.activeOnly) catConds.push(eq(menuCategories.isActive, true))
  const categories = await db
    .select()
    .from(menuCategories)
    .where(and(...catConds))
    .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt))

  const categoryIds = categories.map((c) => c.id)
  const items =
    categoryIds.length === 0
      ? []
      : await db
          .select()
          .from(menuItems)
          .where(
            opts.activeOnly
              ? and(inArray(menuItems.categoryId, categoryIds), eq(menuItems.isActive, true))
              : inArray(menuItems.categoryId, categoryIds)
          )
          .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt))

  const itemsByCategory = new Map<string, MenuItem[]>()
  for (const item of items) {
    const list = itemsByCategory.get(item.categoryId) ?? []
    list.push(item)
    itemsByCategory.set(item.categoryId, list)
  }

  const catsWithItems: MenuCategoryWithItems[] = categories.map((cat) => ({
    ...cat,
    menuItems: itemsByCategory.get(cat.id) ?? [],
  }))

  const catsByMenu = new Map<string, MenuCategoryWithItems[]>()
  for (const cat of catsWithItems) {
    const list = catsByMenu.get(cat.menuId) ?? []
    list.push(cat)
    catsByMenu.set(cat.menuId, list)
  }

  return menuRows.map((m) => ({ ...m, categories: catsByMenu.get(m.id) ?? [] }))
}

// ---------------------------------------------------------------------------
// Menu reads
// ---------------------------------------------------------------------------

/** Admin: all menus for a property, nested, including inactive. */
export async function getMenusForProperty(
  propertyId: string
): Promise<MenuWithCategories[]> {
  const rows = await db
    .select()
    .from(menus)
    .where(eq(menus.propertyId, propertyId))
    .orderBy(asc(menus.type), asc(menus.dayOfWeek), asc(menus.sortOrder))
  return attachCategories(rows, { activeOnly: false })
}

/** Public: the 7 active set menus, nested with active categories/items. */
export async function getSetMenusForProperty(
  propertyId: string
): Promise<MenuWithCategories[]> {
  const rows = await db
    .select()
    .from(menus)
    .where(
      and(
        eq(menus.propertyId, propertyId),
        eq(menus.type, 'set'),
        eq(menus.isActive, true)
      )
    )
    .orderBy(asc(menus.dayOfWeek))
  return attachCategories(rows, { activeOnly: true })
}

/** Public: the single active à la carte menu, nested. */
export async function getALaCarteMenuForProperty(
  propertyId: string
): Promise<MenuWithCategories | null> {
  const rows = await db
    .select()
    .from(menus)
    .where(
      and(
        eq(menus.propertyId, propertyId),
        eq(menus.type, 'a_la_carte'),
        eq(menus.isActive, true)
      )
    )
    .limit(1)
  const nested = await attachCategories(rows, { activeOnly: true })
  return nested[0] ?? null
}

// ---------------------------------------------------------------------------
// Menu CRUD
// ---------------------------------------------------------------------------

export async function getMenuById(id: string): Promise<Menu | undefined> {
  const rows = await db.select().from(menus).where(eq(menus.id, id)).limit(1)
  return rows[0]
}

export async function createMenu(data: NewMenu): Promise<Menu> {
  const [created] = await db.insert(menus).values(data).returning()
  return created
}

export async function updateMenu(
  id: string,
  data: Partial<Omit<NewMenu, 'id'>>
): Promise<Menu | undefined> {
  const [updated] = await db
    .update(menus)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(menus.id, id))
    .returning()
  return updated
}

export async function deleteMenu(id: string): Promise<void> {
  await db.delete(menus).where(eq(menus.id, id))
}

// ---------------------------------------------------------------------------
// Menu Categories
// ---------------------------------------------------------------------------

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
