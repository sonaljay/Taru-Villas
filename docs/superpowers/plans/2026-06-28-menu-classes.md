# Menu Classes (Set Menu + Seven to Seven) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two menu classes per property — a 7-day Set Menu and a Seven to Seven à la carte menu — and seed The Long House with both.

**Architecture:** Introduce a parent `menus` table above the existing `menu_categories` → `menu_items` hierarchy (menu → section → item). The public page opens on a selection screen, then shows either the Set Menu (defaulted to today in Asia/Colombo, browsable Su–Sa) or the à la carte menu. The admin page gains a class switcher and per-day set-menu management. Spec: `docs/superpowers/specs/2026-06-28-menu-classes-set-and-alacarte-design.md`.

**Tech Stack:** Next.js 16 (App Router, RSC), Drizzle ORM + postgres.js (`prepare: false`), Zod v4, shadcn/ui + Tailwind 4, React Hook Form, Sonner.

## Global Constraints

- **No test framework exists** in this repo. Each task's "verify" cycle is: `npx tsc --noEmit` (typecheck) + ESLint on changed files (`npx eslint <files>`) + manual inspection / DB query. Do **not** scaffold jest/vitest. `npm run build` deadlocks locally (macOS/Turbopack) — Linux/Coolify is the authoritative build; do not block on a local build.
- **DB driver:** `postgres(connectionString, { prepare: false })` — never change.
- **Migrations are hand-written SQL**, applied to Supabase/prod directly (drizzle-kit history is broken). Apply additive/guarded migrations to prod **before** the app code merges, or Server Components 500.
- **Zod v4:** import `from 'zod'` (existing menu routes use plain `zod`); no strict `.url()`; coerce nullable `tags`/arrays → `[]` before Drizzle.
- **Next.js 16:** await `context.params`; every data-fetching `page.tsx` has `export const dynamic = 'force-dynamic'`.
- **Auth:** pages use `requireAuth()`/`requireRole()`; API routes use `getProfile()` + property access check; staff are forbidden from menu management (mirror existing categories route).
- **All Drizzle mutations** (insert/update/delete) use `.returning()`.
- **ESLint kills the Coolify build** on unused imports/vars — prefix intentionally-unused params with `_`, drop unused imports.
- **The Long House:** `property_id = 5351150a-080b-446b-a9d5-a2cb93109332`, `slug = the-long-house`.
- **No images** on any seeded menu item.

---

### Task 1: Schema + migration for `menus` table and `menu_categories` columns

**Files:**
- Modify: `src/lib/db/schema.ts` (add `menus` table + relations after `menuItems`, ~line 696; add `menuId`/`priceNote` to `menuCategories` ~line 651; export types ~line 1184)
- Create: `drizzle/0021_menu_classes.sql`

**Interfaces:**
- Produces:
  - `menus` table → `Menu = typeof menus.$inferSelect`, `NewMenu = typeof menus.$inferInsert` with columns `id, propertyId, type ('set'|'a_la_carte'), dayOfWeek (number|null), name, description (string|null), priceNote (string|null), footerNote (string|null), sortOrder, isActive, createdAt, updatedAt`.
  - `menuCategories.menuId: string`, `menuCategories.priceNote: string | null`.

- [ ] **Step 1: Add the `menus` table to `schema.ts`**

Insert after the `menuItemsRelations` block (after line ~696):

```typescript
// ---------------------------------------------------------------------------
// Menus (parent grouping: 'set' = 7 day-specific menus, 'a_la_carte' = one)
// ---------------------------------------------------------------------------
export const menus = pgTable(
  'menus',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // 'set' | 'a_la_carte'
    dayOfWeek: integer('day_of_week'), // 0=Sun..6=Sat; null for a_la_carte
    name: text('name').notNull(),
    description: text('description'),
    priceNote: text('price_note'),
    footerNote: text('footer_note'),
    sortOrder: integer('sort_order').default(0).notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('menus_property_type_day_unique').on(
      table.propertyId,
      table.type,
      table.dayOfWeek
    ),
  ]
)

export const menusRelations = relations(menus, ({ one, many }) => ({
  property: one(properties, {
    fields: [menus.propertyId],
    references: [properties.id],
  }),
  categories: many(menuCategories),
}))
```

- [ ] **Step 2: Add `menuId` + `priceNote` to `menuCategories`**

In the `menuCategories` pgTable definition (line ~651), add after `propertyId`:

```typescript
  menuId: uuid('menu_id')
    .notNull()
    .references(() => menus.id, { onDelete: 'cascade' }),
```

and add after `description`:

```typescript
  priceNote: text('price_note'),
```

Then extend `menuCategoriesRelations` (line ~664) to include the parent menu:

```typescript
export const menuCategoriesRelations = relations(menuCategories, ({ one, many }) => ({
  property: one(properties, {
    fields: [menuCategories.propertyId],
    references: [properties.id],
  }),
  menu: one(menus, {
    fields: [menuCategories.menuId],
    references: [menus.id],
  }),
  menuItems: many(menuItems),
}))
```

- [ ] **Step 3: Export `Menu` types**

Near the existing `MenuCategory` exports (line ~1184), add:

```typescript
export type Menu = typeof menus.$inferSelect
export type NewMenu = typeof menus.$inferInsert
```

- [ ] **Step 4: Write the migration SQL `drizzle/0021_menu_classes.sql`**

```sql
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
```

> Note: if re-run after a partial apply, the `ADD CONSTRAINT` line can error because the
> constraint already exists. Guard at apply time by wrapping that statement, or drop the
> constraint first. For the runner script below, multi-statement simple-query tolerates the
> guarded `IF NOT EXISTS` parts; the two `ALTER ... ADD CONSTRAINT`/`SET NOT NULL` lines are
> only safe to run once — on a clean DB they run fine.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`menus` referenced by `menuCategories` and vice-versa resolves via Drizzle's lazy `() =>` references.)

- [ ] **Step 6: Apply the migration to the database**

Run from the dev box (per project workflow):

```bash
node -e '
const postgres = require("postgres");
const fs = require("fs");
const env = fs.readFileSync(".env.local","utf8");
const url = (env.match(/^POSTGRES_URL=(.*)$/m)||env.match(/^DATABASE_URL=(.*)$/m))[1].replace(/^["\x27]|["\x27]$/g,"");
const sql = postgres(url,{prepare:false});
(async()=>{
  await sql.unsafe(fs.readFileSync("drizzle/0021_menu_classes.sql","utf8"));
  const cols = await sql`select column_name from information_schema.columns where table_name=\x27menu_categories\x27 and column_name in (\x27menu_id\x27,\x27price_note\x27)`;
  const t = await sql`select to_regclass(\x27public.menus\x27) as t`;
  console.log("menus table:", t[0].t, "| new cols:", cols.map(c=>c.column_name).join(","));
  await sql.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
'
```

Expected output: `menus table: menus | new cols: menu_id,price_note` (order may vary). Property 906's stray category now has a non-null `menu_id`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0021_menu_classes.sql
git commit -m "feat(menus): add menus parent table + menu_categories.menu_id/price_note (migration 0021)"
```

---

### Task 2: Queries — menu CRUD + nested public/admin reads

**Files:**
- Modify: `src/lib/db/queries/menus.ts` (replace flat helpers with menu-aware ones; keep item CRUD)

**Interfaces:**
- Consumes: `menus`, `menuCategories`, `menuItems`, `Menu`, `NewMenu` from Task 1.
- Produces:
  - `type MenuWithCategories = Menu & { categories: MenuCategoryWithItems[] }`
  - `getMenusForProperty(propertyId): Promise<MenuWithCategories[]>` (admin, includes inactive)
  - `getSetMenusForProperty(propertyId): Promise<MenuWithCategories[]>` (public, active only)
  - `getALaCarteMenuForProperty(propertyId): Promise<MenuWithCategories | null>` (public, active only)
  - `getMenuById(id): Promise<Menu | undefined>`
  - `createMenu(data: NewMenu): Promise<Menu>`
  - `updateMenu(id, data): Promise<Menu | undefined>`
  - `deleteMenu(id): Promise<void>`
  - `createMenuCategory` now requires `menuId` on its `NewMenuCategory` input (type already includes it after Task 1).

- [ ] **Step 1: Rewrite `menus.ts` category/menu read layer**

Replace the file's top imports and the "Menu Categories" read section. New imports:

```typescript
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
```

- [ ] **Step 2: Add a private helper that nests categories+items under menus**

```typescript
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
```

- [ ] **Step 3: Add the menu read functions**

```typescript
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
```

- [ ] **Step 4: Add menu CRUD functions**

```typescript
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
```

- [ ] **Step 5: Update the existing category/item helpers**

Delete `getMenuCategoriesForProperty` and `getActiveMenuForProperty` (replaced by the menu-aware reads). Keep `getMenuCategoryById`, `createMenuCategory`, `updateMenuCategory`, `deleteMenuCategory`, and all `menuItems` helpers exactly as they are — `createMenuCategory(data: NewMenuCategory)` already accepts `menuId`/`priceNote` because `NewMenuCategory` gained them in Task 1.

- [ ] **Step 6: Typecheck (expect failures at call sites — that's the signal for Tasks 3–5)**

Run: `npx tsc --noEmit`
Expected: errors ONLY in `src/app/api/menus/categories/route.ts`, `src/app/(portal)/properties/[propertyId]/menus/page.tsx`, and `src/app/(excursions)/m/[slug]/page.tsx` (they still import the deleted functions). The `menus.ts` file itself must be error-free. Those call sites are fixed in Tasks 3–5.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/queries/menus.ts
git commit -m "feat(menus): menu CRUD + nested set/a-la-carte read queries"
```

---

### Task 3: API routes — `/api/menus`, `/api/menus/[id]`, updated categories route

**Files:**
- Create: `src/app/api/menus/route.ts`
- Create: `src/app/api/menus/[id]/route.ts`
- Modify: `src/app/api/menus/categories/route.ts` (GET by menuId; POST takes menuId + priceNote)
- Modify: `src/app/api/menus/categories/[id]/route.ts` (PATCH accepts priceNote)

**Interfaces:**
- Consumes: `createMenu`, `getMenusForProperty`, `getMenuById`, `updateMenu`, `deleteMenu` (Task 2); existing `getProfile`, `getUserProperties`.
- Produces: REST endpoints used by the admin client (Task 5).

- [ ] **Step 1: Create `src/app/api/menus/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { createMenu, getMenusForProperty } from '@/lib/db/queries/menus'

const createMenuSchema = z.object({
  propertyId: z.string().uuid(),
  type: z.enum(['set', 'a_la_carte']),
  dayOfWeek: z.number().int().min(0).max(6).nullable().optional(),
  name: z.string().min(1).max(500),
  description: z.string().max(4000).nullable().optional(),
  priceNote: z.string().max(200).nullable().optional(),
  footerNote: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})

async function checkPropertyAccess(
  profile: { id: string; role: string },
  propertyId: string
) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(
    profile.id,
    profile.role as 'admin' | 'property_manager' | 'staff'
  )
  if (!userProps) return true
  return userProps.includes(propertyId)
}

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive)
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const propertyId = request.nextUrl.searchParams.get('propertyId')
    if (!propertyId)
      return NextResponse.json({ error: 'propertyId query parameter is required' }, { status: 400 })

    if (!(await checkPropertyAccess(profile, propertyId)))
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })

    const data = await getMenusForProperty(propertyId)
    return NextResponse.json(data)
  } catch (error) {
    console.error('GET /api/menus error:', error)
    return NextResponse.json({ error: 'Failed to fetch menus' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive)
      return NextResponse.json({ error: 'Account is inactive' }, { status: 403 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = createMenuSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )

    if (!(await checkPropertyAccess(profile, parsed.data.propertyId)))
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })

    const { dayOfWeek, ...rest } = parsed.data
    const menu = await createMenu({ ...rest, dayOfWeek: dayOfWeek ?? null })
    return NextResponse.json(menu, { status: 201 })
  } catch (error) {
    console.error('POST /api/menus error:', error)
    return NextResponse.json({ error: 'Failed to create menu' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `src/app/api/menus/[id]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getMenuById, updateMenu, deleteMenu } from '@/lib/db/queries/menus'

type RouteContext = { params: Promise<{ id: string }> }

const updateMenuSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(4000).nullable().optional(),
  priceNote: z.string().max(200).nullable().optional(),
  footerNote: z.string().max(1000).nullable().optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
})

async function canAccessProperty(
  profile: { id: string; role: string },
  propertyId: string
) {
  if (profile.role === 'admin') return true
  const userProps = await getUserProperties(
    profile.id,
    profile.role as 'admin' | 'property_manager' | 'staff'
  )
  if (!userProps) return true
  return userProps.includes(propertyId)
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const menu = await getMenuById(id)
    if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canAccessProperty(profile, menu.propertyId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = updateMenuSchema.safeParse(body)
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )

    const updated = await updateMenu(id, parsed.data)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/menus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update menu' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role === 'staff')
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const menu = await getMenuById(id)
    if (!menu) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (!(await canAccessProperty(profile, menu.propertyId)))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    await deleteMenu(id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('DELETE /api/menus/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete menu' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Update `src/app/api/menus/categories/route.ts`**

GET: switch from `propertyId` to `menuId`-scoped fetch. Replace the import and the GET body's data line. Change the import:

```typescript
import { getMenuById, createMenuCategory } from '@/lib/db/queries/menus'
import { db } from '@/lib/db'
import { menuCategories, menuItems } from '@/lib/db/schema'
import { eq, asc, inArray, and } from 'drizzle-orm'
```

Replace the GET handler's parameter + data fetch: read `menuId` from query, look up the menu (for the property access check), then return that menu's categories with items:

```typescript
    const menuId = request.nextUrl.searchParams.get('menuId')
    if (!menuId)
      return NextResponse.json({ error: 'menuId query parameter is required' }, { status: 400 })
    const menu = await getMenuById(menuId)
    if (!menu) return NextResponse.json({ error: 'Menu not found' }, { status: 404 })
    const hasAccess = await checkPropertyAccess(profile, menu.propertyId)
    if (!hasAccess)
      return NextResponse.json({ error: 'Forbidden: no access to this property' }, { status: 403 })

    const cats = await db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.menuId, menuId))
      .orderBy(asc(menuCategories.sortOrder), asc(menuCategories.createdAt))
    const ids = cats.map((c) => c.id)
    const items = ids.length
      ? await db.select().from(menuItems).where(inArray(menuItems.categoryId, ids))
          .orderBy(asc(menuItems.sortOrder), asc(menuItems.createdAt))
      : []
    const byCat = new Map<string, typeof items>()
    for (const it of items) {
      const l = byCat.get(it.categoryId) ?? []
      l.push(it)
      byCat.set(it.categoryId, l)
    }
    return NextResponse.json(cats.map((c) => ({ ...c, menuItems: byCat.get(c.id) ?? [] })))
```

POST: add `menuId` (required) and `priceNote` to the schema. Replace `createCategorySchema`:

```typescript
const createCategorySchema = z.object({
  propertyId: z.string().uuid(),
  menuId: z.string().uuid(),
  name: z.string().min(1).max(500),
  description: z.string().max(2000).nullable().optional(),
  priceNote: z.string().max(200).nullable().optional(),
  sortOrder: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
})
```

The existing `createMenuCategory(parsed.data)` call now passes `menuId`/`priceNote` straight through. (`and` import is unused if not referenced — remove it to avoid the ESLint unused-var build break; only import what you use.)

- [ ] **Step 4: Update `src/app/api/menus/categories/[id]/route.ts` PATCH schema**

Add `priceNote` to whatever Zod object the PATCH handler validates:

```typescript
  priceNote: z.string().max(200).nullable().optional(),
```

(Read the file first; insert the line into the existing update schema object. No other change.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: the two API route errors from Task 2 are gone. Remaining errors only in the two page.tsx files (fixed in Tasks 4–5).

- [ ] **Step 6: Lint the changed files**

Run: `npx eslint src/app/api/menus`
Expected: clean (no unused imports/vars).

- [ ] **Step 7: Commit**

```bash
git add src/app/api/menus
git commit -m "feat(menus): menu CRUD API + menuId-scoped categories endpoints"
```

---

### Task 4: Public page — selection screen + Set Menu (today, browsable) + à la carte

**Files:**
- Modify: `src/app/(excursions)/m/[slug]/page.tsx` (fetch set + à la carte; compute today; force-dynamic)
- Rewrite: `src/components/menus/menus-public-page.tsx` (selection screen + two views)
- Reuse: `src/components/menus/traditional-menu-layout.tsx` (unchanged)

**Interfaces:**
- Consumes: `getSetMenusForProperty`, `getALaCarteMenuForProperty`, `MenuWithCategories` (Task 2); `getPropertyBySlug` (existing); `TraditionalMenuLayout` (existing).
- Produces: public rendering only (no downstream consumers).

- [ ] **Step 1: Update the server page**

Replace `src/app/(excursions)/m/[slug]/page.tsx` body (keep `generateMetadata`):

```typescript
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPropertyBySlug } from '@/lib/db/queries/excursions'
import {
  getSetMenusForProperty,
  getALaCarteMenuForProperty,
} from '@/lib/db/queries/menus'
import { MenusPublicPage } from '@/components/menus/menus-public-page'

export const dynamic = 'force-dynamic'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) return { title: 'Not Found' }
  return {
    title: `Our Menu — ${property.name}`,
    description: `Explore the menu at ${property.name}${property.location ? `, ${property.location}` : ''}.`,
  }
}

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const property = await getPropertyBySlug(slug)
  if (!property) notFound()

  const [setMenus, aLaCarte] = await Promise.all([
    getSetMenusForProperty(property.id),
    getALaCarteMenuForProperty(property.id),
  ])

  // Day-of-week (0=Sun..6=Sat) in Sri Lanka time.
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Colombo',
    weekday: 'short',
  }).format(new Date())
  const todayDow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday)

  return (
    <MenusPublicPage
      property={property}
      setMenus={setMenus}
      aLaCarte={aLaCarte}
      todayDow={todayDow}
    />
  )
}
```

- [ ] **Step 2: Rewrite the public client component**

Replace `src/components/menus/menus-public-page.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { MapPin, UtensilsCrossed, ChefHat, ArrowLeft } from 'lucide-react'
import { TraditionalMenuLayout } from '@/components/menus/traditional-menu-layout'
import type { Property } from '@/lib/db/schema'
import type { MenuWithCategories } from '@/lib/db/queries/menus'

interface MenusPublicPageProps {
  property: Property
  setMenus: MenuWithCategories[]
  aLaCarte: MenuWithCategories | null
  todayDow: number
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type View = 'select' | 'set' | 'alacarte'

export function MenusPublicPage({
  property,
  setMenus,
  aLaCarte,
  todayDow,
}: MenusPublicPageProps) {
  const heroImage = property.menuCoverImageUrl || property.imageUrl
  const hasSet = setMenus.length > 0
  const hasALaCarte = !!aLaCarte && aLaCarte.categories.some((c) => c.menuItems.length > 0)

  // Default selected set-menu day: today if it exists, else the first available.
  const todayMenu = setMenus.find((m) => m.dayOfWeek === todayDow)
  const [view, setView] = useState<View>('select')
  const [selectedDow, setSelectedDow] = useState<number>(
    todayMenu ? todayDow : (setMenus[0]?.dayOfWeek ?? todayDow)
  )

  const activeSet = setMenus.find((m) => m.dayOfWeek === selectedDow) ?? null

  return (
    <>
      {/* Hero */}
      <section className="relative isolate overflow-hidden">
        {heroImage ? (
          <>
            <img src={heroImage} alt="" aria-hidden className="absolute inset-0 -z-20 h-full w-full object-cover" />
            <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/60 via-black/50 to-black/70" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-emerald-900 via-teal-800 to-emerald-950" />
        )}
        <div className="mx-auto max-w-6xl px-4 py-20 sm:py-28">
          <div className="mb-6 h-px w-16 bg-white/40" />
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.25em] text-white/70">Our Menu</p>
          <h1 className="text-4xl font-light tracking-tight text-white sm:text-5xl md:text-6xl">{property.name}</h1>
          {property.location && (
            <div className="mt-5 flex items-center gap-2 text-white/70">
              <MapPin className="size-4" strokeWidth={1.5} />
              <span className="text-sm tracking-wide">{property.location}</span>
            </div>
          )}
        </div>
      </section>

      {/* Body */}
      {!hasSet && !hasALaCarte ? (
        <ComingSoon />
      ) : view === 'select' ? (
        <SelectionScreen
          hasSet={hasSet}
          hasALaCarte={hasALaCarte}
          onPick={(v) => setView(v)}
        />
      ) : view === 'set' && activeSet ? (
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <BackBar onBack={() => setView('select')} other={hasALaCarte ? { label: 'Seven to Seven', go: () => setView('alacarte') } : null} />
          {/* Day switcher */}
          <div className="mb-8 flex flex-wrap justify-center gap-2">
            {setMenus.map((m) => {
              const dow = m.dayOfWeek ?? 0
              const isSel = dow === selectedDow
              const isToday = dow === todayDow
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedDow(dow)}
                  className={`relative rounded-full px-4 py-1.5 text-sm transition ${
                    isSel
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:bg-muted/70'
                  }`}
                >
                  {DAY_LABELS[dow]}
                  {isToday && (
                    <span className="ml-1.5 text-[10px] uppercase tracking-wide opacity-70">
                      tonight
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <SetMenuView menu={activeSet} />
        </div>
      ) : view === 'alacarte' && aLaCarte ? (
        <div className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
          <BackBar onBack={() => setView('select')} other={hasSet ? { label: 'Set Menu', go: () => setView('set') } : null} />
          {aLaCarte.footerNote && (
            <p className="mb-8 text-center text-xs italic text-muted-foreground">{aLaCarte.footerNote}</p>
          )}
          <TraditionalMenuLayout categories={aLaCarte.categories.filter((c) => c.menuItems.length > 0)} />
        </div>
      ) : (
        <ComingSoon />
      )}

      <style>{`
        @keyframes menuHeroFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes menuCardIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </>
  )
}

function BackBar({ onBack, other }: { onBack: () => void; other: { label: string; go: () => void } | null }) {
  return (
    <div className="mb-8 flex items-center justify-between">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Menus
      </button>
      {other && (
        <button onClick={other.go} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {other.label} &rarr;
        </button>
      )}
    </div>
  )
}

function SelectionScreen({
  hasSet,
  hasALaCarte,
  onPick,
}: {
  hasSet: boolean
  hasALaCarte: boolean
  onPick: (v: View) => void
}) {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:py-24">
      <div className="grid gap-6 sm:grid-cols-2">
        {hasSet && (
          <button
            onClick={() => onPick('set')}
            className="group flex flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center transition hover:shadow-lg"
          >
            <ChefHat className="size-10 text-foreground/70" strokeWidth={1.25} />
            <div>
              <h2 className="text-xl font-light tracking-wide">Set Menu</h2>
              <p className="mt-2 text-sm text-muted-foreground">Tonight&rsquo;s curated prix-fixe, changing daily.</p>
            </div>
          </button>
        )}
        {hasALaCarte && (
          <button
            onClick={() => onPick('alacarte')}
            className="group flex flex-col items-center gap-4 rounded-2xl border bg-card p-10 text-center transition hover:shadow-lg"
          >
            <UtensilsCrossed className="size-10 text-foreground/70" strokeWidth={1.25} />
            <div>
              <h2 className="text-xl font-light tracking-wide">Seven to Seven</h2>
              <p className="mt-2 text-sm text-muted-foreground">Our all-day à la carte selection.</p>
            </div>
          </button>
        )}
      </div>
    </section>
  )
}

function SetMenuView({ menu }: { menu: MenuWithCategories }) {
  const sections = menu.categories.filter((c) => c.menuItems.length > 0)
  return (
    <div>
      <div className="mb-8 text-center">
        <h2 className="text-3xl font-light tracking-wide" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
          {menu.name}
        </h2>
        {menu.priceNote && <p className="mt-2 text-sm font-medium text-foreground/80">{menu.priceNote}</p>}
        {menu.description && (
          <p className="mx-auto mt-4 max-w-xl text-sm italic leading-relaxed text-muted-foreground">{menu.description}</p>
        )}
      </div>
      <TraditionalMenuLayout categories={sections} />
      {menu.footerNote && (
        <p className="mt-10 text-center text-xs italic text-muted-foreground">{menu.footerNote}</p>
      )}
    </div>
  )
}

function ComingSoon() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-12 sm:py-16">
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-6 h-px w-12 bg-border" />
        <p className="text-lg font-light tracking-wide text-muted-foreground">Menu coming soon</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground/70">
          We&rsquo;re preparing a curated dining experience for you. Check back shortly.
        </p>
      </div>
    </section>
  )
}
```

> Note: `TraditionalMenuLayout` renders a section's `price_note`? It does not today. The
> Chef's Special `$25 per person` is shown by passing it through the category `description`
> is NOT desired. Instead, Step 3 adds section price rendering.

- [ ] **Step 3: Show section-level `price_note` in `TraditionalMenuLayout`**

In `src/components/menus/traditional-menu-layout.tsx`, the category type is
`MenuCategoryWithItems` which now has `priceNote`. Under the category heading block (after
the `category.description` paragraph, before the closing `</div>` of the heading), add:

```typescript
              {category.priceNote && (
                <p className="mt-1 text-sm font-medium text-foreground/70">
                  {category.priceNote}
                </p>
              )}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: the `m/[slug]/page.tsx` error from Task 2 is gone. Only the admin page error remains (Task 5).

- [ ] **Step 5: Lint**

Run: `npx eslint src/components/menus src/app/(excursions)/m`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/menus src/app/\(excursions\)/m
git commit -m "feat(menus): public selection screen + set-menu day switcher + a-la-carte view"
```

---

### Task 5: Admin page — class switcher + per-day set-menu management

**Files:**
- Modify: `src/app/(portal)/properties/[propertyId]/menus/page.tsx` (pass `getMenusForProperty`)
- Rewrite: `src/components/admin/menus-page-client.tsx` (class/day switcher; menu-aware CRUD)
- Modify: `src/components/admin/menu-category-form.tsx` (accept `menuId` + `priceNote`)
- Create: `src/components/admin/menu-meta-form.tsx` (edit a menu's name/price/intro/footer)

**Interfaces:**
- Consumes: `getMenusForProperty`, `MenuWithCategories` (Task 2); `/api/menus`, `/api/menus/[id]`, `/api/menus/categories` (Task 3); existing `MenuItemForm`, `MenuItemCard`, `CoverImageInput`.
- Produces: admin UI only.

- [ ] **Step 1: Update the server page**

Replace the data line + prop in `src/app/(portal)/properties/[propertyId]/menus/page.tsx`:

```typescript
import { getMenusForProperty } from '@/lib/db/queries/menus'
// ...
  const menus = await getMenusForProperty(propertyId)
  return <MenusPageClient property={property} menus={menus} />
```

Add `export const dynamic = 'force-dynamic'` below the imports (currently missing).

- [ ] **Step 2: Update `MenuCategoryForm` to take `menuId` + `priceNote`**

In `src/components/admin/menu-category-form.tsx`:
- Add `menuId: string` to `MenuCategoryFormProps`.
- Add `priceNote` to the Zod schema: `priceNote: z.string().max(200).optional(),` and to `defaultValues`: `priceNote: category?.priceNote ?? '',`.
- Add a price-note input after the description field:

```tsx
      <div className="space-y-2">
        <Label htmlFor="priceNote">Price note (optional)</Label>
        <Input id="priceNote" placeholder="e.g. $25 per person" {...register('priceNote')} />
      </div>
```

- In `onSubmit`, send `priceNote: data.priceNote || null` and include `menuId` on create:

```typescript
        body: JSON.stringify({
          ...data,
          description: data.description || null,
          priceNote: data.priceNote || null,
          ...(!isEditing && { propertyId, menuId }),
        }),
```

- [ ] **Step 3: Create `src/components/admin/menu-meta-form.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import type { Menu } from '@/lib/db/schema'

interface MenuMetaFormProps {
  menu: Menu
  onSuccess?: () => void
}

interface MetaValues {
  name: string
  priceNote: string
  description: string
  footerNote: string
}

export function MenuMetaForm({ menu, onSuccess }: MenuMetaFormProps) {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const { register, handleSubmit } = useForm<MetaValues>({
    defaultValues: {
      name: menu.name,
      priceNote: menu.priceNote ?? '',
      description: menu.description ?? '',
      footerNote: menu.footerNote ?? '',
    },
  })

  async function onSubmit(data: MetaValues) {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/menus/${menu.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          priceNote: data.priceNote || null,
          description: data.description || null,
          footerNote: data.footerNote || null,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save')
      }
      toast.success('Menu details saved')
      onSuccess?.()
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" {...register('name', { required: true })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="priceNote">Price note</Label>
        <Input id="priceNote" placeholder="$40 per person" {...register('priceNote')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Intro / description</Label>
        <Textarea id="description" rows={4} {...register('description')} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footerNote">Footer note</Label>
        <Textarea id="footerNote" rows={2} {...register('footerNote')} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save Details'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Rewrite `menus-page-client.tsx`**

Replace the whole file. It now: receives `menus: MenuWithCategories[]`; shows a class switcher (Set Menu / Seven to Seven); for Set Menu shows a Mon–Sun selector with create-if-missing; renders the selected menu's meta + sections + items; reuses category/item dialogs. Full file:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Link2, UtensilsCrossed, Pencil, Power, Trash2, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { MenuCategoryForm } from '@/components/admin/menu-category-form'
import { MenuItemForm } from '@/components/admin/menu-item-form'
import { MenuItemCard } from '@/components/admin/menu-item-card'
import { MenuMetaForm } from '@/components/admin/menu-meta-form'
import { CoverImageInput } from '@/components/admin/cover-image-input'
import type { Property } from '@/lib/db/schema'
import type { MenuWithCategories, MenuCategoryWithItems } from '@/lib/db/queries/menus'

interface MenusPageClientProps {
  property: Property
  menus: MenuWithCategories[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon..Sun

const SET_INTRO =
  "At The Long House, our food reflects the Southern coastline — bold, vibrant, and rooted in tradition. These are today's set menu selections. Should you wish to order à la carte, our Seven to Seven menu is available as well."
const SET_FOOTER =
  'Includes a selection of tea, coffee & petit fours. All prices are inclusive of government taxes & service charges.'

export function MenusPageClient({ property, menus }: MenusPageClientProps) {
  const router = useRouter()
  const [tab, setTab] = useState<'set' | 'alacarte'>('set')
  const [selectedDow, setSelectedDow] = useState<number>(1) // Monday
  const [busy, setBusy] = useState(false)

  // dialogs
  const [metaMenu, setMetaMenu] = useState<MenuWithCategories | null>(null)
  const [createCatMenuId, setCreateCatMenuId] = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState<MenuCategoryWithItems | null>(null)
  const [deleteCategory, setDeleteCategory] = useState<MenuCategoryWithItems | null>(null)
  const [addItemCategoryId, setAddItemCategoryId] = useState<string | null>(null)
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [togglingCategoryId, setTogglingCategoryId] = useState<string | null>(null)

  const setMenus = menus.filter((m) => m.type === 'set')
  const aLaCarte = menus.find((m) => m.type === 'a_la_carte') ?? null
  const activeSet = setMenus.find((m) => m.dayOfWeek === selectedDow) ?? null
  const current = tab === 'set' ? activeSet : aLaCarte

  function copyPublicLink() {
    navigator.clipboard.writeText(`${window.location.origin}/m/${property.slug}`)
    toast.success('Public link copied to clipboard')
  }

  async function createMenu(payload: Record<string, unknown>) {
    setBusy(true)
    try {
      const res = await fetch('/api/menus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId: property.id, ...payload }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to create menu')
      }
      toast.success('Menu created')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create menu')
    } finally {
      setBusy(false)
    }
  }

  async function handleToggleCategory(cat: MenuCategoryWithItems) {
    setTogglingCategoryId(cat.id)
    try {
      const res = await fetch(`/api/menus/categories/${cat.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !cat.isActive }),
      })
      if (!res.ok) throw new Error('Failed to update category')
      toast.success(cat.isActive ? 'Section deactivated' : 'Section activated')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update section')
    } finally {
      setTogglingCategoryId(null)
    }
  }

  async function handleDeleteCategory() {
    if (!deleteCategory) return
    setIsDeletingCategory(true)
    try {
      const res = await fetch(`/api/menus/categories/${deleteCategory.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete section')
      toast.success('Section deleted')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete section')
    } finally {
      setIsDeletingCategory(false)
      setDeleteCategory(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/menus')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Menu</h1>
            <p className="text-sm text-muted-foreground">Manage the menu for {property.name}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={copyPublicLink}>
          <Link2 className="size-4" /> Copy Public Link
        </Button>
      </div>

      <CoverImageInput
        propertyId={property.id}
        fieldName="menuCoverImageUrl"
        currentUrl={property.menuCoverImageUrl}
        label="Menu Cover Image"
      />

      {/* Class switcher */}
      <div className="flex gap-2 border-b">
        {(['set', 'alacarte'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'set' ? 'Set Menu' : 'Seven to Seven'}
          </button>
        ))}
      </div>

      {/* Set-menu day selector */}
      {tab === 'set' && (
        <div className="flex flex-wrap gap-2">
          {DAY_ORDER.map((dow) => {
            const exists = setMenus.some((m) => m.dayOfWeek === dow)
            return (
              <button
                key={dow}
                onClick={() => setSelectedDow(dow)}
                className={`rounded-full px-3 py-1 text-sm transition ${
                  selectedDow === dow ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground hover:bg-muted/70'
                } ${exists ? '' : 'opacity-50'}`}
              >
                {DAY_NAMES[dow]}
              </button>
            )
          })}
        </div>
      )}

      {/* Current menu body */}
      {current ? (
        <div className="space-y-8">
          {/* Menu meta bar */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-4">
            <div>
              <p className="font-medium">{current.name}</p>
              {current.priceNote && <p className="text-sm text-muted-foreground">{current.priceNote}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setMetaMenu(current)}>
                <Settings2 className="size-4" /> Edit Details
              </Button>
              <Button size="sm" onClick={() => setCreateCatMenuId(current.id)}>
                <Plus className="size-4" /> Add Section
              </Button>
            </div>
          </div>

          {current.categories.length > 0 ? (
            current.categories.map((cat) => (
              <section key={cat.id}>
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold">{cat.name}</h2>
                    {cat.priceNote && <Badge variant="outline" className="text-[10px]">{cat.priceNote}</Badge>}
                    {!cat.isActive && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => setEditCategory(cat)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="size-7" onClick={() => handleToggleCategory(cat)} disabled={togglingCategoryId === cat.id}>
                      <Power className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon-xs" className="size-7 text-destructive hover:text-destructive" onClick={() => setDeleteCategory(cat)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
                {cat.description && <p className="mb-4 text-sm text-muted-foreground">{cat.description}</p>}
                {cat.menuItems.length > 0 ? (
                  <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                    {cat.menuItems.map((item) => (
                      <MenuItemCard key={item.id} item={item} categoryId={cat.id} />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed py-8 text-center">
                    <p className="text-sm text-muted-foreground">No items in this section yet</p>
                  </div>
                )}
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setAddItemCategoryId(cat.id)}>
                  <Plus className="size-4" /> Add Item
                </Button>
              </section>
            ))
          ) : (
            <div className="rounded-lg border border-dashed py-12 text-center">
              <p className="text-sm text-muted-foreground">No sections yet. Add the first one.</p>
            </div>
          )}
        </div>
      ) : (
        // No menu for this slot — offer to create
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
          <UtensilsCrossed className="size-10 text-muted-foreground/50" />
          <h3 className="mt-4 text-sm font-semibold">
            {tab === 'set' ? `No set menu for ${DAY_NAMES[selectedDow]}` : 'No à la carte menu yet'}
          </h3>
          <Button
            variant="outline"
            className="mt-4"
            disabled={busy}
            onClick={() =>
              tab === 'set'
                ? createMenu({ type: 'set', dayOfWeek: selectedDow, name: DAY_NAMES[selectedDow], priceNote: '$40 per person', description: SET_INTRO, footerNote: SET_FOOTER })
                : createMenu({ type: 'a_la_carte', name: 'Seven to Seven', footerNote: 'Prices are inclusive of service charge & applicable taxes.' })
            }
          >
            <Plus className="size-4" />
            {tab === 'set' ? `Create ${DAY_NAMES[selectedDow]} set menu` : 'Create Seven to Seven menu'}
          </Button>
        </div>
      )}

      {/* Edit meta dialog */}
      <Dialog open={!!metaMenu} onOpenChange={(o) => !o && setMetaMenu(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Menu Details</DialogTitle>
            <DialogDescription>Edit the heading, pricing and notes for this menu.</DialogDescription>
          </DialogHeader>
          {metaMenu && <MenuMetaForm menu={metaMenu} onSuccess={() => setMetaMenu(null)} />}
        </DialogContent>
      </Dialog>

      {/* Create section dialog */}
      <Dialog open={!!createCatMenuId} onOpenChange={(o) => !o && setCreateCatMenuId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Section</DialogTitle>
            <DialogDescription>Create a new section for this menu.</DialogDescription>
          </DialogHeader>
          {createCatMenuId && (
            <MenuCategoryForm propertyId={property.id} menuId={createCatMenuId} onSuccess={() => setCreateCatMenuId(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit section dialog */}
      <Dialog open={!!editCategory} onOpenChange={(o) => !o && setEditCategory(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Section</DialogTitle>
            <DialogDescription>Update the details for {editCategory?.name}.</DialogDescription>
          </DialogHeader>
          {editCategory && (
            <MenuCategoryForm propertyId={property.id} menuId={editCategory.menuId} category={editCategory} onSuccess={() => setEditCategory(null)} />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete section alert */}
      <AlertDialog open={!!deleteCategory} onOpenChange={(o) => !o && setDeleteCategory(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Section</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium text-foreground">{deleteCategory?.name}</span> and all its items? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={handleDeleteCategory} disabled={isDeletingCategory}>
              {isDeletingCategory ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add item dialog */}
      <Dialog open={!!addItemCategoryId} onOpenChange={(o) => !o && setAddItemCategoryId(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Menu Item</DialogTitle>
            <DialogDescription>Add a new item to this section.</DialogDescription>
          </DialogHeader>
          {addItemCategoryId && <MenuItemForm categoryId={addItemCategoryId} onSuccess={() => setAddItemCategoryId(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

- [ ] **Step 5: Typecheck + lint**

Run: `npx tsc --noEmit` → expected: **zero errors across the repo now**.
Run: `npx eslint src/components/admin/menus-page-client.tsx src/components/admin/menu-category-form.tsx src/components/admin/menu-meta-form.tsx "src/app/(portal)/properties/[propertyId]/menus/page.tsx"` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/components/admin src/app/\(portal\)/properties/\[propertyId\]/menus/page.tsx
git commit -m "feat(menus): admin class switcher + per-day set-menu management"
```

---

### Task 6: Seed The Long House (set menus + Seven to Seven)

**Files:**
- Create: `scripts/seed-long-house-menus.mjs`
- Create (temp): rendered PDF page PNGs for reading à la carte prices (not committed)

**Interfaces:**
- Consumes: live DB via `POSTGRES_URL`; the two source PDFs in `~/Downloads`.
- Produces: DB rows only.

- [ ] **Step 1: Render the à la carte PDF to images and read exact prices**

The à la carte USD prices do not map reliably via text extraction. Render and read them:

```bash
# Install poppler if missing (enables the Read tool's PDF rendering too)
brew install poppler
# Render each page of the à la carte menu to PNG into the scratchpad
pdftoppm -png -r 150 "/Users/sonaljayawickrama/Downloads/Taru Villas Temp Menus.pdf" \
  /private/tmp/claude-501/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/6fd17813-a807-45a1-b649-3cd7b3e9ca79/scratchpad/sevenToSeven
```

Then use the Read tool on each generated PNG (`scratchpad/sevenToSeven-02.png` … `-13.png`)
to transcribe each dish's price exactly. Record the final dish→price map; this is the
source of truth for Step 3's à la carte block. (If `brew install poppler` is unavailable,
use the Read tool's PDF `pages` parameter directly on the PDF now that poppler is present.)

- [ ] **Step 2: Write the seed script skeleton**

`scripts/seed-long-house-menus.mjs` — connects, wipes The Long House menus, and inserts.
Structure (fill the data objects from the spec §8 set-menu transcription and the Step-1
verified à la carte prices):

```javascript
import postgres from 'postgres'
import fs from 'node:fs'

const env = fs.readFileSync('.env.local', 'utf8')
const url = (env.match(/^POSTGRES_URL=(.*)$/m) || env.match(/^DATABASE_URL=(.*)$/m))[1]
  .replace(/^["']|["']$/g, '')
const sql = postgres(url, { prepare: false })

const PROPERTY_ID = '5351150a-080b-446b-a9d5-a2cb93109332' // The Long House

const SET_INTRO =
  "At The Long House, our food reflects the Southern coastline — bold, vibrant, and rooted in tradition. Fresh seafood takes centre stage, complemented by local ingredients like coconut, lime, goraka, and aromatic spices. These are today's set menu selections. Should you wish to order à la carte, our Seven to Seven menu is available as well."
const SET_FOOTER =
  'Includes a selection of tea, coffee & petit fours. All prices are inclusive of government taxes & service charges.'

// helper: a dish -> { title, description, tags }
const veg = (title, description) => ({ title, description, tags: ['Vegetarian'] })
const dish = (title, description) => ({ title, description, tags: [] })

// Rice & Curry chef's special shared across Mon/Fri/Sun
const RICE_AND_CURRY = {
  name: "Chef's Special — Rice & Curry",
  priceNote: '$25 per person',
  description:
    'Choose your rice (White / Red), a fresh side (Mallum / Ruhunu Achcharu) and one main curry below — served with four vegetable curries, papadam, fried dry chilli, and pickle.',
  items: [
    dish('Black Pork Curry', null),
    dish('Ceylonese Red Chicken Curry', null),
    dish('Spicy Lagoon Prawn Curry', null),
    dish('Fish Ambulthiyal', null),
    dish('Beef Curry', null),
    dish('Cashew Nut Curry', null),
  ],
}
const KOTTU = {
  name: "Chef's Special — Sri Lankan Kottu Roti",
  priceNote: '$25 per person',
  description:
    'Chopped godamba roti stir-fried with vegetables & onions. Please select one option, served with a selection of side dishes.',
  items: [
    dish('Roast Chicken Kottu', 'Godamba roti stir-fried with roast chicken, vegetables & spices'),
    dish('Hot Butter Cuttlefish', 'Crispy cuttlefish tossed in a Chinese–Sri Lankan style hot butter sauce'),
    dish('Deviled Beef', 'Stir-fried beef with onions, capsicum & spicy deviled sauce'),
    dish('Pork Stew', 'Slow-cooked pork in a mildly spiced gravy'),
  ],
}
const STRING_HOPPER = {
  name: "Chef's Special — String Hopper Pilau",
  priceNote: '$25 per person',
  description:
    'Tempered string hoppers with vegetables, aromatic spices & coconut gravy. Please select one option, served with a selection of side dishes.',
  items: [
    dish('Mustard Fish or Prawn Curry', 'Prepared with ground mustard, garlic & unroasted curry powder'),
    dish('Deviled Crab', 'Spicy stir-fried crab with onions and chili'),
    dish('Black Chicken or Pork Curry', 'Slow-cooked meat curry, flavoured with roasted curry powder'),
  ],
}
const REFRESHER = dish("Tonight's Signature Taste Refresher", 'A seasonal palate cleanser, selected by the chef')
const FRUIT = dish('Seasonal Fruit Platter', null)

// dayOfWeek -> set menu definition (sections: Starter & Soup, Mains, Dessert, Chef's Special)
const SET_MENUS = {
  1: { // Monday
    starters: [
      dish('Prawn Squid Salad', 'With mint, coriander, coconut, peanut, pomegranate & tamarind sauce'),
      veg('Roasted Carrot Soup', 'With garlic bread, crème fraiche & basil leaf'),
      REFRESHER,
    ],
    mains: [
      dish('Asian Herb Crust Baked Barramundi', 'With stir fried green bean, sweet potato lyonnaise & red curry lemongrass cream'),
      veg('Pumpkin Gnocchi', 'With sun dried tomato salsa, basil oil & garlic cream sauce'),
      dish('Pork Skewer', 'With braised leeks, pickled red cabbage & garlic cream'),
      dish('Baked Mediterranean Chicken', 'With curry leaf hummus, wilted spinach & mint curd'),
    ],
    desserts: [
      dish('Coconut & Passion Fruit Crème Brûlée', 'With cashew nut crumbs & torched sugar'),
      dish('Baked Alaska', 'With Milo, coconut & cinnamon honey ice cream'),
      FRUIT,
    ],
    chefsSpecial: RICE_AND_CURRY,
  },
  2: { /* Tuesday — fill from spec §8 */ chefsSpecial: KOTTU /* starters/mains/desserts ... */ },
  3: { /* Wednesday */ chefsSpecial: STRING_HOPPER },
  4: { /* Thursday */ chefsSpecial: KOTTU },
  5: { /* Friday */ chefsSpecial: RICE_AND_CURRY },
  6: { /* Saturday */ chefsSpecial: STRING_HOPPER },
  0: { /* Sunday */ chefsSpecial: RICE_AND_CURRY },
}

// à la carte — fill prices from Step 1 render. price stored as `USD <n>`.
const A_LA_CARTE = {
  name: 'Seven to Seven',
  footerNote: 'Prices are inclusive of service charge & applicable taxes.',
  sections: [
    // { name, description, items: [{ title, description, price }] }
  ],
}

async function insertMenuWithSections(menu) {
  const [m] = await sql`
    insert into menus (property_id, type, day_of_week, name, description, price_note, footer_note, sort_order)
    values (${PROPERTY_ID}, ${menu.type}, ${menu.dayOfWeek ?? null}, ${menu.name},
            ${menu.description ?? null}, ${menu.priceNote ?? null}, ${menu.footerNote ?? null}, ${menu.sortOrder ?? 0})
    returning id`
  let catSort = 0
  for (const section of menu.sections) {
    const [c] = await sql`
      insert into menu_categories (property_id, menu_id, name, description, price_note, sort_order)
      values (${PROPERTY_ID}, ${m.id}, ${section.name}, ${section.description ?? null}, ${section.priceNote ?? null}, ${catSort++})
      returning id`
    let itemSort = 0
    for (const it of section.items) {
      await sql`
        insert into menu_items (category_id, title, description, price, tags, sort_order)
        values (${c.id}, ${it.title}, ${it.description ?? null}, ${it.price ?? null},
                ${it.tags ?? []}, ${itemSort++})`
    }
  }
  return m.id
}

async function main() {
  await sql.begin(async (tx) => {
    void tx
  })
  // wipe existing menus for this property (cascade clears categories + items)
  await sql`delete from menus where property_id = ${PROPERTY_ID}`
  // also clear any orphan categories that predate the menus table for this property
  await sql`delete from menu_categories where property_id = ${PROPERTY_ID}`

  // set menus
  let sort = 0
  for (const dow of [1, 2, 3, 4, 5, 6, 0]) {
    const def = SET_MENUS[dow]
    const sections = [
      { name: 'Starter & Soup', items: def.starters },
      { name: 'Mains', items: def.mains },
      { name: 'Dessert', items: def.desserts },
      { name: def.chefsSpecial.name, description: def.chefsSpecial.description, priceNote: def.chefsSpecial.priceNote, items: def.chefsSpecial.items },
    ]
    await insertMenuWithSections({
      type: 'set', dayOfWeek: dow,
      name: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dow],
      description: SET_INTRO, priceNote: '$40 per person', footerNote: SET_FOOTER,
      sortOrder: sort++, sections,
    })
  }

  // à la carte
  await insertMenuWithSections({ type: 'a_la_carte', dayOfWeek: null, ...A_LA_CARTE, sortOrder: 100 })

  const counts = await sql`
    select m.type, count(distinct m.id) menus, count(distinct mc.id) sections, count(mi.id) items
    from menus m
    left join menu_categories mc on mc.menu_id = m.id
    left join menu_items mi on mi.category_id = mc.id
    where m.property_id = ${PROPERTY_ID}
    group by m.type`
  console.log(counts)
  await sql.end()
}
main().catch((e) => { console.error(e); process.exit(1) })
```

> Fill every commented day (`2,3,4,5,6,0`) with the exact dishes from spec §8, and populate
> `A_LA_CARTE.sections` from the Step-1 verified prices. Do not leave placeholder comments in
> the final script. Vegetarian `(V)` dishes use the `veg(...)` helper (adds the `Vegetarian`
> tag); the `(V)` suffix is omitted from the title.

- [ ] **Step 3: Run the seed**

Run: `node scripts/seed-long-house-menus.mjs`
Expected: a counts table showing `set` = 7 menus / ~28 sections / ~70+ items, and
`a_la_carte` = 1 menu / 11 sections / ~60 items.

- [ ] **Step 4: Verify in DB**

```bash
node -e '
const postgres=require("postgres");const fs=require("fs");
const url=(fs.readFileSync(".env.local","utf8").match(/^POSTGRES_URL=(.*)$/m))[1].replace(/^["\x27]|["\x27]$/g,"");
const sql=postgres(url,{prepare:false});
(async()=>{
  const r=await sql`select type, day_of_week, name from menus where property_id=\x275351150a-080b-446b-a9d5-a2cb93109332\x27 order by type, day_of_week`;
  console.table(r);
  await sql.end();
})().catch(e=>{console.error(e.message);process.exit(1)});
'
```

Expected: 7 `set` rows (day_of_week 0–6) + 1 `a_la_carte` row.

- [ ] **Step 5: Commit the seed script**

```bash
git add scripts/seed-long-house-menus.mjs
git commit -m "chore(menus): seed The Long House set menus + Seven to Seven"
```

---

### Task 7: Final verification + finish branch

**Files:** none (verification only)

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors.

- [ ] **Step 2: Lint the whole touched surface**

Run: `npx eslint src/app/api/menus src/components/menus src/components/admin "src/app/(excursions)/m" "src/app/(portal)/properties/[propertyId]/menus"`
Expected: clean (no unused-vars — these break the Coolify build).

- [ ] **Step 3: Manual smoke (describe expected, verify by reading rendered data)**

The public route `/m/the-long-house` should: show the selection screen (Set Menu + Seven to
Seven cards); Set Menu defaults to today's day (Asia/Colombo) badged "tonight" and lets you
switch days; Seven to Seven lists all 11 sections with USD prices. The admin route
`/properties/5351150a-…/menus` should switch classes and days and allow section/item CRUD.
(Local `npm run dev` is optional; the authoritative runtime is Coolify.)

- [ ] **Step 4: User visual verification of seeded copy/prices**

Ask the user to open `/m/the-long-house` and confirm the 7 set menus and à la carte prices
match the source PDFs before merge.

- [ ] **Step 5: Finish the branch**

Migration `0021` is already applied to prod (Task 1 Step 6) and is additive/guarded, so the
ordering constraint is satisfied. Invoke `superpowers:finishing-a-development-branch` to
choose merge/PR. Push `feat/menu-classes` and open a PR to `main`; merge triggers the
Coolify build.

---

## Self-Review Notes

- **Spec coverage:** §3 schema → Task 1; §4 queries → Task 2; §5 API → Task 3; §6 public →
  Task 4; §7 admin → Task 5; §8 seed → Task 6; §10 verification → Task 7. ✓
- **Apply-before-merge risk (§11):** migration applied in Task 1 Step 6, before any merge. ✓
- **Type consistency:** `MenuWithCategories` (Task 2) is the prop type for both public (Task
  4) and admin (Task 5) clients; `menuId` added to `MenuCategoryForm` (Task 5 Step 2) matches
  its use in the rewritten admin client. ✓
- **No-test-framework:** every task verifies via `tsc` + `eslint` + DB query, not jest. ✓
