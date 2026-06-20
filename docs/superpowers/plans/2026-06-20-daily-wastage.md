# Daily Wastage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-property, per-day "Daily Wastage" log across six fixed waste categories (kg each), with summary cards and trend charts — modeled on the existing Meter Readings (utilities) feature.

**Architecture:** A single `waste_logs` table (one row per property per day, one numeric column per category) → Drizzle queries → Next.js API routes (`/api/waste`) → a property picker page (`/waste`) and property-scoped management page (`/properties/[propertyId]/waste`) rendered by client components that mirror the utilities UI.

**Tech Stack:** Next.js 16 (App Router, React 19), Drizzle ORM + Supabase Postgres, Zod v4, shadcn/ui, Recharts, Sonner, lucide-react.

## Global Constraints

- DB client must keep `{ prepare: false }` (already set in `src/lib/db/index.ts`) — do not touch.
- All Drizzle mutations (insert/update/delete) MUST use `.returning()`.
- Every `page.tsx` that fetches data MUST `export const dynamic = 'force-dynamic'`.
- Zod: avoid strict `.url()`; kg fields are non-negative numbers (`z.number().min(0)`); numeric columns stored as strings (`String(value)`).
- Next.js 16: dynamic route handlers MUST `await context.params`.
- Pages use `requireAuth()`; API routes use `getProfile()` + property-access check via `getUserProperties()` (admins = all access; `null` return = admin).
- No new npm packages. No public/unauthenticated route. No cost/pricing, no OCR.
- Six fixed categories, in this exact order and labelling:
  `paperKg`→"Paper", `glassKg`→"Glass", `plasticKg`→"Polythene & Plastic", `foodKg`→"Food", `metalKg`→"Metal", `electronicKg`→"Electronic Waste".
- Migration is hand-written (`drizzle/0013_waste_logs.sql`) and applied via the Supabase SQL editor — `drizzle-kit generate/migrate` is NOT used (migration history is broken).
- Per-task verification gate: `npx tsc --noEmit` must pass (fast, reliable locally). `npm run build` is the final gate but may hang on macOS — the authoritative build runs on Coolify/Linux; if it hangs locally rely on `tsc` + the Linux build.

---

## File Structure

**Create:**
- `drizzle/0013_waste_logs.sql` — migration
- `src/lib/waste/categories.ts` — shared category constant (DRY across components)
- `src/lib/db/queries/waste.ts` — all waste queries
- `src/app/api/waste/route.ts` — GET (list) + POST (create)
- `src/app/api/waste/[id]/route.ts` — PATCH + DELETE
- `src/app/api/waste/summary/route.ts` — GET (month summary + history)
- `src/app/(portal)/waste/page.tsx` — property picker
- `src/app/(portal)/properties/[propertyId]/waste/page.tsx` — management page
- `src/components/waste/waste-page-client.tsx` — orchestrator
- `src/components/waste/waste-log-form.tsx` — combined daily entry (create + edit)
- `src/components/waste/waste-log-table.tsx` — daily log table + edit/delete
- `src/components/waste/waste-summary-cards.tsx` — month totals
- `src/components/waste/waste-charts.tsx` — category + trend charts

**Modify:**
- `src/lib/db/schema.ts` — add `wasteLogs` table, relations, type exports
- `src/components/layout/app-sidebar.tsx` — add nav item
- `src/components/layout/header.tsx` — add breadcrumb label

---

### Task 1: Database schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (add table after `utilityMeterReadingsRelations`, ~line 885; add type exports near line 963)
- Create: `drizzle/0013_waste_logs.sql`

**Interfaces:**
- Produces: Drizzle table `wasteLogs`; types `WasteLog`, `NewWasteLog`. Columns: `id, propertyId, logDate, paperKg, glassKg, plasticKg, foodKg, metalKg, electronicKg, note, recordedBy, createdAt, updatedAt`. Unique on `(propertyId, logDate)`.

- [ ] **Step 1: Add the table + relations to schema**

In `src/lib/db/schema.ts`, immediately after the `utilityMeterReadingsRelations` block (ends ~line 885), add:

```typescript
// ---------------------------------------------------------------------------
// Daily Wastage (one combined row per property per day, kg per category)
// ---------------------------------------------------------------------------
export const wasteLogs = pgTable(
  'waste_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    logDate: date('log_date').notNull(),
    paperKg: numeric('paper_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    glassKg: numeric('glass_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    plasticKg: numeric('plastic_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    foodKg: numeric('food_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    metalKg: numeric('metal_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    electronicKg: numeric('electronic_kg', { precision: 10, scale: 2 }).default('0').notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('waste_logs_property_date_unique').on(table.propertyId, table.logDate),
  ]
)

export const wasteLogsRelations = relations(wasteLogs, ({ one }) => ({
  property: one(properties, {
    fields: [wasteLogs.propertyId],
    references: [properties.id],
  }),
  recorder: one(profiles, {
    fields: [wasteLogs.recordedBy],
    references: [profiles.id],
  }),
}))
```

- [ ] **Step 2: Add type exports**

Near the other `$inferSelect`/`$inferInsert` exports (e.g. after the `UtilityMeterReading` exports ~line 963), add:

```typescript
export type WasteLog = typeof wasteLogs.$inferSelect
export type NewWasteLog = typeof wasteLogs.$inferInsert
```

- [ ] **Step 3: Write the migration file**

Create `drizzle/0013_waste_logs.sql`:

```sql
-- Daily Wastage: one combined row per property per day, kg per waste category
CREATE TABLE IF NOT EXISTS "waste_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"property_id" uuid NOT NULL,
	"log_date" date NOT NULL,
	"paper_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"glass_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"plastic_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"food_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"metal_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"electronic_kg" numeric(10, 2) DEFAULT '0' NOT NULL,
	"note" text,
	"recorded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "waste_logs_property_date_unique" UNIQUE("property_id","log_date")
);
--> statement-breakpoint

ALTER TABLE "waste_logs"
  ADD CONSTRAINT "waste_logs_property_id_properties_id_fk"
  FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

ALTER TABLE "waste_logs"
  ADD CONSTRAINT "waste_logs_recorded_by_profiles_id_fk"
  FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id")
  ON DELETE set null ON UPDATE no action;
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS (no errors). The new table/types resolve.

- [ ] **Step 5: Apply the migration**

The implementer must apply `drizzle/0013_waste_logs.sql` via the Supabase SQL editor (Project → SQL Editor → New query → paste → Run), then confirm the `waste_logs` table exists. (This is a manual step — note it in the commit message and to the user.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0013_waste_logs.sql
git commit -m "feat(waste): add waste_logs schema + migration"
```

---

### Task 2: Shared category constant + queries

**Files:**
- Create: `src/lib/waste/categories.ts`
- Create: `src/lib/db/queries/waste.ts`

**Interfaces:**
- Consumes: `wasteLogs`, `profiles` from schema (Task 1).
- Produces:
  - `WASTE_CATEGORIES: readonly { key: WasteCategoryKey; label: string }[]`, type `WasteCategoryKey = 'paperKg' | 'glassKg' | 'plasticKg' | 'foodKg' | 'metalKg' | 'electronicKg'`.
  - Query fns:
    - `getWasteLogsForMonth(propertyId: string, year: number, month: number): Promise<(WasteLog & { recorderName: string | null })[]>`
    - `getWasteLogById(id: string): Promise<WasteLog | null>`
    - `createWasteLog(data): Promise<WasteLog>`
    - `updateWasteLog(id, data): Promise<WasteLog>`
    - `deleteWasteLog(id): Promise<WasteLog>`
    - `getWasteSummaryForMonth(propertyId, year, month): Promise<WasteTotals>` where `WasteTotals = { paperKg; glassKg; plasticKg; foodKg; metalKg; electronicKg; total }` (all numbers)
    - `getWasteHistory(propertyId, months?): Promise<({ month: string } & WasteTotals)[]>`

- [ ] **Step 1: Create the shared category constant**

Create `src/lib/waste/categories.ts`:

```typescript
export type WasteCategoryKey =
  | 'paperKg'
  | 'glassKg'
  | 'plasticKg'
  | 'foodKg'
  | 'metalKg'
  | 'electronicKg'

export const WASTE_CATEGORIES: readonly { key: WasteCategoryKey; label: string }[] = [
  { key: 'paperKg', label: 'Paper' },
  { key: 'glassKg', label: 'Glass' },
  { key: 'plasticKg', label: 'Polythene & Plastic' },
  { key: 'foodKg', label: 'Food' },
  { key: 'metalKg', label: 'Metal' },
  { key: 'electronicKg', label: 'Electronic Waste' },
] as const
```

- [ ] **Step 2: Create the queries file**

Create `src/lib/db/queries/waste.ts`:

```typescript
import { eq, and, asc, gte, lte, sql } from 'drizzle-orm'
import { db } from '..'
import { wasteLogs, profiles } from '../schema'
import type { WasteLog } from '../schema'

function monthBounds(year: number, month: number) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`
  return { startDate, endDate }
}

export interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

/** All daily logs for a property in a given month, ascending by date, with recorder name. */
export async function getWasteLogsForMonth(
  propertyId: string,
  year: number,
  month: number // 1-indexed
): Promise<(WasteLog & { recorderName: string | null })[]> {
  const { startDate, endDate } = monthBounds(year, month)

  const logs = await db
    .select()
    .from(wasteLogs)
    .where(
      and(
        eq(wasteLogs.propertyId, propertyId),
        gte(wasteLogs.logDate, startDate),
        lte(wasteLogs.logDate, endDate)
      )
    )
    .orderBy(asc(wasteLogs.logDate))

  const recorderIds = logs.map((l) => l.recordedBy).filter(Boolean) as string[]
  let recorderMap: Record<string, string> = {}
  if (recorderIds.length > 0) {
    const recorders = await db
      .select({ id: profiles.id, fullName: profiles.fullName })
      .from(profiles)
    recorderMap = Object.fromEntries(recorders.map((p) => [p.id, p.fullName]))
  }

  return logs.map((l) => ({
    ...l,
    recorderName: l.recordedBy ? recorderMap[l.recordedBy] ?? null : null,
  }))
}

/** Single log by id. */
export async function getWasteLogById(id: string): Promise<WasteLog | null> {
  const results = await db.select().from(wasteLogs).where(eq(wasteLogs.id, id)).limit(1)
  return results[0] ?? null
}

/** Create a daily waste log. */
export async function createWasteLog(data: {
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note?: string | null
  recordedBy?: string | null
}): Promise<WasteLog> {
  const [inserted] = await db.insert(wasteLogs).values(data).returning()
  return inserted
}

/** Update a daily waste log. */
export async function updateWasteLog(
  id: string,
  data: {
    logDate?: string
    paperKg?: string
    glassKg?: string
    plasticKg?: string
    foodKg?: string
    metalKg?: string
    electronicKg?: string
    note?: string | null
  }
): Promise<WasteLog> {
  const [updated] = await db
    .update(wasteLogs)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(wasteLogs.id, id))
    .returning()
  return updated
}

/** Delete a daily waste log. */
export async function deleteWasteLog(id: string): Promise<WasteLog> {
  const [deleted] = await db.delete(wasteLogs).where(eq(wasteLogs.id, id)).returning()
  return deleted
}

/** Per-category totals + grand total for a property/month. */
export async function getWasteSummaryForMonth(
  propertyId: string,
  year: number,
  month: number
): Promise<WasteTotals> {
  const { startDate, endDate } = monthBounds(year, month)

  const [row] = await db
    .select({
      paperKg: sql<number>`COALESCE(SUM(${wasteLogs.paperKg}), 0)::float`,
      glassKg: sql<number>`COALESCE(SUM(${wasteLogs.glassKg}), 0)::float`,
      plasticKg: sql<number>`COALESCE(SUM(${wasteLogs.plasticKg}), 0)::float`,
      foodKg: sql<number>`COALESCE(SUM(${wasteLogs.foodKg}), 0)::float`,
      metalKg: sql<number>`COALESCE(SUM(${wasteLogs.metalKg}), 0)::float`,
      electronicKg: sql<number>`COALESCE(SUM(${wasteLogs.electronicKg}), 0)::float`,
    })
    .from(wasteLogs)
    .where(
      and(
        eq(wasteLogs.propertyId, propertyId),
        gte(wasteLogs.logDate, startDate),
        lte(wasteLogs.logDate, endDate)
      )
    )

  const totals = {
    paperKg: Number(row?.paperKg ?? 0),
    glassKg: Number(row?.glassKg ?? 0),
    plasticKg: Number(row?.plasticKg ?? 0),
    foodKg: Number(row?.foodKg ?? 0),
    metalKg: Number(row?.metalKg ?? 0),
    electronicKg: Number(row?.electronicKg ?? 0),
  }
  const total =
    totals.paperKg +
    totals.glassKg +
    totals.plasticKg +
    totals.foodKg +
    totals.metalKg +
    totals.electronicKg

  return { ...totals, total }
}

/** Monthly per-category totals for the last N months (for trend charts). */
export async function getWasteHistory(
  propertyId: string,
  months: number = 6
): Promise<({ month: string } & WasteTotals)[]> {
  const cutoffDate = new Date()
  cutoffDate.setMonth(cutoffDate.getMonth() - months)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const rows = await db
    .select({
      month: sql<string>`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`.as('month'),
      paperKg: sql<number>`COALESCE(SUM(${wasteLogs.paperKg}), 0)::float`,
      glassKg: sql<number>`COALESCE(SUM(${wasteLogs.glassKg}), 0)::float`,
      plasticKg: sql<number>`COALESCE(SUM(${wasteLogs.plasticKg}), 0)::float`,
      foodKg: sql<number>`COALESCE(SUM(${wasteLogs.foodKg}), 0)::float`,
      metalKg: sql<number>`COALESCE(SUM(${wasteLogs.metalKg}), 0)::float`,
      electronicKg: sql<number>`COALESCE(SUM(${wasteLogs.electronicKg}), 0)::float`,
    })
    .from(wasteLogs)
    .where(and(eq(wasteLogs.propertyId, propertyId), gte(wasteLogs.logDate, cutoff)))
    .groupBy(sql`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${wasteLogs.logDate}::date, 'YYYY-MM')`)

  return rows.map((r) => {
    const totals = {
      paperKg: Number(r.paperKg),
      glassKg: Number(r.glassKg),
      plasticKg: Number(r.plasticKg),
      foodKg: Number(r.foodKg),
      metalKg: Number(r.metalKg),
      electronicKg: Number(r.electronicKg),
    }
    const total =
      totals.paperKg +
      totals.glassKg +
      totals.plasticKg +
      totals.foodKg +
      totals.metalKg +
      totals.electronicKg
    return { month: r.month, ...totals, total }
  })
}
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/waste/categories.ts src/lib/db/queries/waste.ts
git commit -m "feat(waste): category constant + db queries"
```

---

### Task 3: API routes

**Files:**
- Create: `src/app/api/waste/route.ts`
- Create: `src/app/api/waste/[id]/route.ts`
- Create: `src/app/api/waste/summary/route.ts`

**Interfaces:**
- Consumes: all query fns from Task 2.
- Produces HTTP endpoints:
  - `GET /api/waste?propertyId&year&month` → `(WasteLog & { recorderName })[]`
  - `POST /api/waste` body `{ propertyId, logDate, paperKg, glassKg, plasticKg, foodKg, metalKg, electronicKg, note? }` → 201 `WasteLog`; 409 on duplicate date.
  - `PATCH /api/waste/[id]` body = any subset of `{ logDate, paperKg.., note }` → `WasteLog`
  - `DELETE /api/waste/[id]` → `{ success, deleted }`
  - `GET /api/waste/summary?propertyId&year&month` → `{ summary: WasteTotals, history: ({month}&WasteTotals)[], logCount }`

- [ ] **Step 1: Create list + create route**

Create `src/app/api/waste/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWasteLogsForMonth, createWasteLog } from '@/lib/db/queries/waste'

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

const createSchema = z.object({
  propertyId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  paperKg: z.number().min(0),
  glassKg: z.number().min(0),
  plasticKg: z.number().min(0),
  foodKg: z.number().min(0),
  metalKg: z.number().min(0),
  electronicKg: z.number().min(0),
  note: z.string().max(500).nullable().optional(),
})

// GET /api/waste?propertyId=xxx&year=2026&month=6
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, year, and month are required' },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const logs = await getWasteLogsForMonth(propertyId, parseInt(year), parseInt(month))
    return NextResponse.json(logs)
  } catch (error) {
    console.error('GET /api/waste error:', error)
    return NextResponse.json({ error: 'Failed to fetch waste logs' }, { status: 500 })
  }
}

// POST /api/waste
export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, parsed.data.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const log = await createWasteLog({
      propertyId: parsed.data.propertyId,
      logDate: parsed.data.logDate,
      paperKg: String(parsed.data.paperKg),
      glassKg: String(parsed.data.glassKg),
      plasticKg: String(parsed.data.plasticKg),
      foodKg: String(parsed.data.foodKg),
      metalKg: String(parsed.data.metalKg),
      electronicKg: String(parsed.data.electronicKg),
      note: parsed.data.note ?? null,
      recordedBy: profile.id,
    })

    return NextResponse.json(log, { status: 201 })
  } catch (error: unknown) {
    if (error instanceof Error && error.message.includes('unique')) {
      return NextResponse.json(
        { error: 'A waste log already exists for this date — edit the existing row instead.' },
        { status: 409 }
      )
    }
    console.error('POST /api/waste error:', error)
    return NextResponse.json({ error: 'Failed to create waste log' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create the [id] route**

Create `src/app/api/waste/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWasteLogById, updateWasteLog, deleteWasteLog } from '@/lib/db/queries/waste'

type RouteContext = { params: Promise<{ id: string }> }

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

const updateSchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  paperKg: z.number().min(0).optional(),
  glassKg: z.number().min(0).optional(),
  plasticKg: z.number().min(0).optional(),
  foodKg: z.number().min(0).optional(),
  metalKg: z.number().min(0).optional(),
  electronicKg: z.number().min(0).optional(),
  note: z.string().max(500).nullable().optional(),
})

// PATCH /api/waste/[id]
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const existing = await getWasteLogById(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const updateData: {
      logDate?: string
      paperKg?: string
      glassKg?: string
      plasticKg?: string
      foodKg?: string
      metalKg?: string
      electronicKg?: string
      note?: string | null
    } = {}
    if (parsed.data.logDate !== undefined) updateData.logDate = parsed.data.logDate
    if (parsed.data.paperKg !== undefined) updateData.paperKg = String(parsed.data.paperKg)
    if (parsed.data.glassKg !== undefined) updateData.glassKg = String(parsed.data.glassKg)
    if (parsed.data.plasticKg !== undefined) updateData.plasticKg = String(parsed.data.plasticKg)
    if (parsed.data.foodKg !== undefined) updateData.foodKg = String(parsed.data.foodKg)
    if (parsed.data.metalKg !== undefined) updateData.metalKg = String(parsed.data.metalKg)
    if (parsed.data.electronicKg !== undefined) updateData.electronicKg = String(parsed.data.electronicKg)
    if (parsed.data.note !== undefined) updateData.note = parsed.data.note

    const updated = await updateWasteLog(id, updateData)
    return NextResponse.json(updated)
  } catch (error) {
    console.error('PATCH /api/waste/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update waste log' }, { status: 500 })
  }
}

// DELETE /api/waste/[id]
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await context.params
    const existing = await getWasteLogById(id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const hasAccess = await checkPropertyAccess(profile, existing.propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const deleted = await deleteWasteLog(id)
    return NextResponse.json({ success: true, deleted })
  } catch (error) {
    console.error('DELETE /api/waste/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete waste log' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create the summary route**

Create `src/app/api/waste/summary/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getWasteSummaryForMonth,
  getWasteHistory,
  getWasteLogsForMonth,
} from '@/lib/db/queries/waste'

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

// GET /api/waste/summary?propertyId=xxx&year=2026&month=6
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const year = searchParams.get('year')
    const month = searchParams.get('month')

    if (!propertyId || !year || !month) {
      return NextResponse.json(
        { error: 'propertyId, year, and month are required' },
        { status: 400 }
      )
    }

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const yearNum = parseInt(year)
    const monthNum = parseInt(month)

    const [summary, history, monthLogs] = await Promise.all([
      getWasteSummaryForMonth(propertyId, yearNum, monthNum),
      getWasteHistory(propertyId, 6),
      getWasteLogsForMonth(propertyId, yearNum, monthNum),
    ])

    return NextResponse.json({ summary, history, logCount: monthLogs.length })
  } catch (error) {
    console.error('GET /api/waste/summary error:', error)
    return NextResponse.json({ error: 'Failed to compute summary' }, { status: 500 })
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/waste
git commit -m "feat(waste): API routes (list, create, update, delete, summary)"
```

---

### Task 4: Leaf components (summary cards, charts, form, table)

**Files:**
- Create: `src/components/waste/waste-summary-cards.tsx`
- Create: `src/components/waste/waste-charts.tsx`
- Create: `src/components/waste/waste-log-form.tsx`
- Create: `src/components/waste/waste-log-table.tsx`

**Interfaces:**
- Consumes: `WASTE_CATEGORIES`, `WasteCategoryKey` (Task 2); API endpoints (Task 3).
- Produces (shared client type — define inline in each file that needs it):
  ```typescript
  interface WasteLogEntry {
    id: string
    propertyId: string
    logDate: string
    paperKg: string
    glassKg: string
    plasticKg: string
    foodKg: string
    metalKg: string
    electronicKg: string
    note: string | null
    recordedBy: string | null
    recorderName: string | null
    createdAt: string
    updatedAt: string
  }
  interface WasteTotals { paperKg: number; glassKg: number; plasticKg: number; foodKg: number; metalKg: number; electronicKg: number; total: number }
  ```
- Produces components:
  - `WasteSummaryCards({ summary: WasteTotals | null, loading: boolean })`
  - `WasteCharts({ summary: WasteTotals | null, history: ({month:string}&WasteTotals)[], loading: boolean })`
  - `WasteLogForm({ propertyId, initialData?, onSuccess, onCancel? })`
  - `WasteLogTable({ logs: WasteLogEntry[], propertyId, onRefresh })`

- [ ] **Step 1: Summary cards**

Create `src/components/waste/waste-summary-cards.tsx`:

```typescript
'use client'

import { Trash2, Newspaper, Wine, ShoppingBag, Utensils, Wrench, Cpu } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { WasteCategoryKey } from '@/lib/waste/categories'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface WasteSummaryCardsProps {
  summary: WasteTotals | null
  loading: boolean
}

const CARD_META: { key: WasteCategoryKey; label: string; icon: typeof Newspaper }[] = [
  { key: 'paperKg', label: 'Paper', icon: Newspaper },
  { key: 'glassKg', label: 'Glass', icon: Wine },
  { key: 'plasticKg', label: 'Polythene & Plastic', icon: ShoppingBag },
  { key: 'foodKg', label: 'Food', icon: Utensils },
  { key: 'metalKg', label: 'Metal', icon: Wrench },
  { key: 'electronicKg', label: 'Electronic Waste', icon: Cpu },
]

export function WasteSummaryCards({ summary, loading }: WasteSummaryCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-primary/5">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total This Month
          </CardTitle>
          <Trash2 className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {loading ? '—' : `${(summary?.total ?? 0).toFixed(1)} kg`}
          </div>
        </CardContent>
      </Card>

      {CARD_META.map((c) => (
        <Card key={c.key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {c.label}
            </CardTitle>
            <c.icon className="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? '—' : `${(summary?.[c.key] ?? 0).toFixed(1)} kg`}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Charts**

Create `src/components/waste/waste-charts.tsx`:

```typescript
'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { WASTE_CATEGORIES } from '@/lib/waste/categories'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface WasteChartsProps {
  summary: WasteTotals | null
  history: ({ month: string } & WasteTotals)[]
  loading: boolean
}

function formatMonth(monthStr: string) {
  const [y, m] = monthStr.split('-')
  return new Date(Number(y), Number(m) - 1).toLocaleDateString('en-US', {
    month: 'short',
    year: '2-digit',
  })
}

export function WasteCharts({ summary, history, loading }: WasteChartsProps) {
  const categoryData = WASTE_CATEGORIES.map((c) => ({
    name: c.label,
    kg: summary?.[c.key] ?? 0,
  }))

  const monthlyData = history.map((h) => ({
    month: formatMonth(h.month),
    total: h.total,
  }))

  const hasCategoryData = (summary?.total ?? 0) > 0

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* This month by category */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">This Month by Category</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Loading...
            </div>
          ) : hasCategoryData ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={categoryData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} kg`, 'Waste']
                  }}
                />
                <Bar dataKey="kg" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              No waste logged this month yet
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly total trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Monthly Total Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              Loading...
            </div>
          ) : monthlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={false} width={50} />
                <Tooltip
                  formatter={(value: unknown) => {
                    const v = typeof value === 'number' ? value : Number(value)
                    return [`${v.toFixed(1)} kg`, 'Total']
                  }}
                />
                <Bar dataKey="total" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-sm text-muted-foreground">
              No historical data yet
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 3: Log form (create + edit)**

Create `src/components/waste/waste-log-form.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { WASTE_CATEGORIES, type WasteCategoryKey } from '@/lib/waste/categories'

interface WasteLogEntry {
  id: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
}

interface WasteLogFormProps {
  propertyId: string
  initialData?: WasteLogEntry | null
  onSuccess: () => void
  onCancel?: () => void
}

type KgState = Record<WasteCategoryKey, string>

function emptyKg(): KgState {
  return {
    paperKg: '',
    glassKg: '',
    plasticKg: '',
    foodKg: '',
    metalKg: '',
    electronicKg: '',
  }
}

export function WasteLogForm({ propertyId, initialData, onSuccess, onCancel }: WasteLogFormProps) {
  const today = new Date().toISOString().split('T')[0]
  const isEditing = !!initialData

  const [logDate, setLogDate] = useState(initialData?.logDate ?? today)
  const [kg, setKg] = useState<KgState>(
    initialData
      ? {
          paperKg: initialData.paperKg,
          glassKg: initialData.glassKg,
          plasticKg: initialData.plasticKg,
          foodKg: initialData.foodKg,
          metalKg: initialData.metalKg,
          electronicKg: initialData.electronicKg,
        }
      : emptyKg()
  )
  const [note, setNote] = useState(initialData?.note ?? '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  function setField(key: WasteCategoryKey, value: string) {
    setKg((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const numeric: Record<WasteCategoryKey, number> = emptyKg() as unknown as Record<WasteCategoryKey, number>
    for (const { key } of WASTE_CATEGORIES) {
      const raw = kg[key].trim()
      const n = raw === '' ? 0 : parseFloat(raw)
      if (isNaN(n) || n < 0) {
        toast.error('Enter valid non-negative kg values')
        return
      }
      numeric[key] = n
    }

    setIsSubmitting(true)
    try {
      const url = isEditing ? `/api/waste/${initialData!.id}` : '/api/waste'
      const res = await fetch(url, {
        method: isEditing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          logDate,
          ...numeric,
          note: note || null,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save')
      }

      toast.success(isEditing ? 'Waste log updated' : 'Waste log saved')
      if (!isEditing) {
        setKg(emptyKg())
        setNote('')
      }
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="waste-date">Date</Label>
        <Input
          id="waste-date"
          type="date"
          value={logDate}
          onChange={(e) => setLogDate(e.target.value)}
          required
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {WASTE_CATEGORIES.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <Label htmlFor={`waste-${c.key}`}>{c.label} (kg)</Label>
            <Input
              id={`waste-${c.key}`}
              type="number"
              step="0.01"
              min="0"
              placeholder="0"
              value={kg[c.key]}
              onChange={(e) => setField(c.key, e.target.value)}
            />
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <Label htmlFor="waste-note">Note (optional)</Label>
        <Textarea
          id="waste-note"
          placeholder="Any observations..."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
        />
      </div>

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isEditing
              ? 'Saving...'
              : 'Saving...'
            : isEditing
              ? 'Save Changes'
              : 'Save Entry'}
        </Button>
      </div>
    </form>
  )
}
```

- [ ] **Step 4: Log table (with edit dialog + delete)**

Create `src/components/waste/waste-log-table.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { WASTE_CATEGORIES } from '@/lib/waste/categories'
import { WasteLogForm } from './waste-log-form'

interface WasteLogEntry {
  id: string
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

interface WasteLogTableProps {
  logs: WasteLogEntry[]
  propertyId: string
  onRefresh: () => void
}

function rowTotal(log: WasteLogEntry) {
  return WASTE_CATEGORIES.reduce((sum, c) => sum + parseFloat(log[c.key] || '0'), 0)
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function WasteLogTable({ logs, propertyId, onRefresh }: WasteLogTableProps) {
  const [deleteLog, setDeleteLog] = useState<WasteLogEntry | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [editLog, setEditLog] = useState<WasteLogEntry | null>(null)

  // Newest first
  const displayLogs = [...logs].reverse()

  async function handleDelete() {
    if (!deleteLog) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/waste/${deleteLog.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete')
      toast.success('Waste log deleted')
      setDeleteLog(null)
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily Log</CardTitle>
        </CardHeader>
        <CardContent>
          {displayLogs.length > 0 ? (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    {WASTE_CATEGORIES.map((c) => (
                      <TableHead key={c.key} className="text-right">
                        {c.label}
                      </TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Recorded By</TableHead>
                    <TableHead className="w-[80px]" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {displayLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium">{formatDate(log.logDate)}</TableCell>
                      {WASTE_CATEGORIES.map((c) => (
                        <TableCell key={c.key} className="text-right tabular-nums">
                          {parseFloat(log[c.key] || '0').toFixed(1)}
                        </TableCell>
                      ))}
                      <TableCell className="text-right tabular-nums font-semibold">
                        {rowTotal(log).toFixed(1)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {log.recorderName ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setEditLog(log)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-8"
                            onClick={() => setDeleteLog(log)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No waste logged for this month.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editLog} onOpenChange={(open) => !open && setEditLog(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Entry — {editLog && formatDate(editLog.logDate)}</DialogTitle>
          </DialogHeader>
          {editLog && (
            <WasteLogForm
              propertyId={propertyId}
              initialData={editLog}
              onSuccess={() => {
                setEditLog(null)
                onRefresh()
              }}
              onCancel={() => setEditLog(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteLog} onOpenChange={(o) => !o && setDeleteLog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the waste log for{' '}
              {deleteLog && formatDate(deleteLog.logDate)}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel variant="outline" size="default">Cancel</AlertDialogCancel>
            <AlertDialogAction variant="default" size="default" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS. (If `AlertDialogCancel`/`AlertDialogAction` reject `variant`/`size` props, check `src/components/ui/alert-dialog.tsx` — the utilities table uses these exact props, so they are supported.)

- [ ] **Step 6: Commit**

```bash
git add src/components/waste
git commit -m "feat(waste): summary cards, charts, log form, log table"
```

---

### Task 5: Page orchestrator, pages, and navigation wiring

**Files:**
- Create: `src/components/waste/waste-page-client.tsx`
- Create: `src/app/(portal)/waste/page.tsx`
- Create: `src/app/(portal)/properties/[propertyId]/waste/page.tsx`
- Modify: `src/components/layout/app-sidebar.tsx` (add `Trash2` import + nav item)
- Modify: `src/components/layout/header.tsx` (add breadcrumb label)

**Interfaces:**
- Consumes: `WasteSummaryCards`, `WasteCharts`, `WasteLogForm`, `WasteLogTable` (Task 4); `/api/waste` + `/api/waste/summary` (Task 3); `requireAuth`, `getUserProperties` (`src/lib/auth/guards`); `getPropertyById`, `getPropertiesForUser` (`src/lib/db/queries/properties`).
- Produces: `WastePageClient({ property: { id; name; code; slug }, isAdmin })`.

- [ ] **Step 1: Page client orchestrator**

Create `src/components/waste/waste-page-client.tsx`:

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { WasteSummaryCards } from '@/components/waste/waste-summary-cards'
import { WasteCharts } from '@/components/waste/waste-charts'
import { WasteLogTable } from '@/components/waste/waste-log-table'
import { WasteLogForm } from '@/components/waste/waste-log-form'

interface WasteTotals {
  paperKg: number
  glassKg: number
  plasticKg: number
  foodKg: number
  metalKg: number
  electronicKg: number
  total: number
}

interface SummaryData {
  summary: WasteTotals
  history: ({ month: string } & WasteTotals)[]
  logCount: number
}

interface WasteLogEntry {
  id: string
  propertyId: string
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
  recordedBy: string | null
  recorderName: string | null
  createdAt: string
  updatedAt: string
}

interface WastePageClientProps {
  property: { id: string; name: string; code: string; slug: string }
  isAdmin: boolean
}

export function WastePageClient({ property }: WastePageClientProps) {
  const router = useRouter()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [logs, setLogs] = useState<WasteLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, logsRes] = await Promise.all([
        fetch(`/api/waste/summary?propertyId=${property.id}&year=${year}&month=${month}`),
        fetch(`/api/waste?propertyId=${property.id}&year=${year}&month=${month}`),
      ])
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (logsRes.ok) setLogs(await logsRes.json())
    } catch (error) {
      console.error('Failed to fetch waste data:', error)
    } finally {
      setLoading(false)
    }
  }, [property.id, year, month])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/waste')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Daily Wastage — {property.name}
            </h1>
            <p className="text-sm text-muted-foreground">
              Log daily waste by category and monitor trends
            </p>
          </div>
        </div>

        {/* Month / Year controls */}
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {monthNames.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <WasteSummaryCards summary={summary?.summary ?? null} loading={loading} />

      {/* Charts */}
      <WasteCharts
        summary={summary?.summary ?? null}
        history={summary?.history ?? []}
        loading={loading}
      />

      {/* Log table + entry form */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <WasteLogTable logs={logs} propertyId={property.id} onRefresh={fetchData} />
        </div>
        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Add Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <WasteLogForm propertyId={property.id} onSuccess={fetchData} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Property picker page**

Create `src/app/(portal)/waste/page.tsx`:

```typescript
import Link from 'next/link'
import Image from 'next/image'
import { MapPin } from 'lucide-react'
import { requireAuth } from '@/lib/auth/guards'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { Card, CardContent } from '@/components/ui/card'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Daily Wastage | Taru Villas',
}

export default async function WastePickerPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const properties = await getPropertiesForUser(profile.id)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Daily Wastage</h1>
        <p className="text-sm text-muted-foreground">
          Select a property to log its daily waste
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => {
          const imageSrc = property.imageUrl || `/properties/${property.code}.png`
          return (
            <Link key={property.id} href={`/properties/${property.id}/waste`}>
              <Card className="group overflow-hidden py-0 gap-0 transition-all hover:shadow-md hover:-translate-y-0.5">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-muted">
                  <Image
                    src={imageSrc}
                    alt={property.name}
                    fill
                    className="object-cover transition-transform duration-300 group-hover:scale-105"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                <CardContent className="space-y-1.5 p-5">
                  <h3 className="font-semibold text-sm">{property.name}</h3>
                  {property.location && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin className="size-3 shrink-0" />
                      {property.location}
                    </div>
                  )}
                </CardContent>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Property-scoped management page**

Create `src/app/(portal)/properties/[propertyId]/waste/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { WastePageClient } from '@/components/waste/waste-page-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Daily Wastage | Taru Villas',
}

export default async function PropertyWastePage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireAuth()
  if (!profile) return null

  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(
      profile.id,
      profile.role as 'admin' | 'property_manager' | 'staff'
    )
    if (userProps && !userProps.includes(propertyId)) {
      notFound()
    }
  }

  const property = await getPropertyById(propertyId)
  if (!property) notFound()

  return (
    <WastePageClient
      property={{ id: property.id, name: property.name, code: property.code, slug: property.slug }}
      isAdmin={profile.role === 'admin'}
    />
  )
}
```

- [ ] **Step 4: Sidebar nav item**

In `src/components/layout/app-sidebar.tsx`:

First, add `Trash2` to the existing `lucide-react` import block (the `Gauge` import lives there ~line 18). Add `Trash2,` alongside it.

Then add to `mainNavItems` (after the Meter Readings line, ~line 65):

```typescript
  { title: 'Daily Wastage', href: '/waste', icon: Trash2 },
```

So the array becomes:

```typescript
const mainNavItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Surveys', href: '/surveys', icon: ClipboardCheck },
  { title: 'Tasks', href: '/tasks', icon: ListTodo },
  { title: 'SOPs', href: '/sops', icon: ListChecks },
  { title: 'Meter Readings', href: '/utilities', icon: Gauge },
  { title: 'Daily Wastage', href: '/waste', icon: Trash2 },
  { title: 'Settings', href: '/settings', icon: Settings },
]
```

(If `Trash2` is already imported elsewhere in the file, do not duplicate the import.)

- [ ] **Step 5: Breadcrumb label**

In `src/components/layout/header.tsx`, inside the `segmentLabels` object (near the `utilities: 'Meter Readings'` entry ~line 31), add:

```typescript
  waste: 'Daily Wastage',
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Production build**

Run: `npm run build`
Expected: PASS (compiles, type-checks, generates routes incl. `/waste` and `/properties/[propertyId]/waste`).
Note: if the build hangs on macOS (known Turbopack/type-check quirk — see project MEMORY), rely on `npx tsc --noEmit` passing here; the authoritative build runs on Coolify/Linux after push.

- [ ] **Step 8: Commit**

```bash
git add src/components/waste/waste-page-client.tsx \
        "src/app/(portal)/waste/page.tsx" \
        "src/app/(portal)/properties/[propertyId]/waste/page.tsx" \
        src/components/layout/app-sidebar.tsx \
        src/components/layout/header.tsx
git commit -m "feat(waste): page client, picker + management pages, nav + breadcrumb"
```

---

## Manual Verification (after Task 5)

The project has no automated test suite; verify the feature manually in the running app (`npm run dev`):

1. Sidebar shows **Daily Wastage**; clicking it lands on `/waste` with property cards.
2. Selecting a property opens `/properties/[id]/waste`; breadcrumb reads "Daily Wastage".
3. Add an entry: pick today, enter a few kg values, save → toast "Waste log saved"; row appears in the table with correct per-category values and Total; summary cards + "This Month by Category" chart update.
4. Add a second entry for a different date → "Monthly Total Trend" reflects totals.
5. Try to add a second entry for an existing date → friendly 409 toast ("...edit the existing row instead.").
6. Edit a row via the pencil → dialog prefilled with 6 values; change one, save → table + summary update.
7. Delete a row → confirm dialog → row removed; totals update.
8. Empty-kg fields submit as `0` (not errors).
9. As a non-admin/staff user assigned to the property, all of the above work (logging is open to all users).

---

## Self-Review

- **Spec coverage:** table/migration (T1), queries incl. summary + history (T2), all 5 API endpoints (T3), summary cards + charts + form + table (T4), picker + management pages + nav + breadcrumb (T5), 409-on-duplicate + edit-via-table (T3/T4), all-user access (auth checks in T3/T5). ✓ No "OCR/pricing/public route" tasks — correctly out of scope.
- **Placeholder scan:** none — every code step is complete.
- **Type consistency:** `WasteLogEntry`/`WasteTotals` client shapes are repeated verbatim where used (per "repeat the code" guidance); query fn names and signatures in T2's Interfaces match their call sites in T3/T5; `WASTE_CATEGORIES`/`WasteCategoryKey` consistent across T2/T4.
- **Note:** `WastePageClient` accepts `isAdmin` (kept for parity with utilities and future admin-only controls) but does not currently branch on it; the prop is destructured out to avoid an unused-var lint error.
