# Electricity Time-of-Use Readings, Occupancy & Daily KPIs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three time-of-use electricity readings per day (Day/Peak/Off-Peak breakdown), daily guest+staff occupancy tracking, and guest-count-banded electricity / flat water daily KPIs with "% of days achieved" stats on the Utilities page and org dashboard.

**Architecture:** Extend the existing `utility_meter_readings` table with two nullable slot columns (one row per property/utility/date, backward compatible). Add `daily_occupancy`, `electricity_kpi_bands`, `utility_kpi_targets`, and `electricity_slot_config` tables. Pure breakdown/KPI math lives in `src/lib/utilities/calculations.ts`; DB access in `src/lib/db/queries/utilities.ts`; config UIs mirror the existing `UtilityTierForm` replace-all pattern.

**Tech Stack:** Next.js 16 App Router (RSC + `'use client'`), Drizzle ORM + postgres.js, Zod v4, shadcn/ui, Recharts, lucide-react, Sonner. Spec: `docs/superpowers/specs/2026-06-24-electricity-tou-occupancy-kpi-design.md`.

## Global Constraints

- **DB connection:** never touch `prepare: false` in `src/lib/db/index.ts`.
- **No new npm packages.** The project has **no test framework** — verify with `npx tsc --noEmit`, `npm run lint`, and (for pure math) a throwaway Node script under the scratchpad; never add Vitest/Jest.
- **Zod v4:** import `from 'zod'` (matches existing utility routes); no strict `.url()`.
- **Drizzle numeric columns are strings** — convert numbers to `String(...)` on write, `parseFloat(...)` on read.
- **Migrations are hand-written SQL** applied via Supabase SQL editor (drizzle-kit is broken here — see MEMORY). Use `IF NOT EXISTS` and `--> statement-breakpoint`.
- **All mutations use `.returning()`.** Route params are awaited. Data pages keep `export const dynamic = 'force-dynamic'`.
- **Auth:** pages use `requireAuth`/`requireRole`; API routes use `getProfile`; config `PUT` routes are admin-only (403 otherwise); reading/occupancy entry follows existing property-access checks.
- **Slot semantics:** `reading_value` = morning (05:30) reading and remains the canonical cumulative reading for water + monthly billing. `evening_reading` (17:30) and `night_reading` (22:30) are electricity-only, nullable. Bucket math: Day = evening−morning, Peak = night−evening, Off-Peak = next-day-morning − night, Total = next-day-morning − morning.
- **KPI achievement exclusion rule:** a day is evaluated only when its Total is computable (next morning exists) AND (electricity) guest count is recorded AND a KPI is configured; otherwise excluded from numerator and denominator.

---

## File Structure

**Created:**
- `drizzle/0014_electricity_tou_occupancy_kpi.sql` — migration
- `src/app/api/utilities/kpi-bands/route.ts` — electricity bands GET/PUT
- `src/app/api/utilities/kpis/route.ts` — water flat target GET/PUT
- `src/app/api/utilities/slot-config/route.ts` — org slot times GET/PUT
- `src/components/admin/utility-occupancy-form.tsx` — daily guest/staff entry block
- `src/components/admin/utility-kpi-bands-form.tsx` — electricity bands config (mirrors tier form)
- `src/components/admin/utility-water-kpi-form.tsx` — water flat target config
- `src/components/admin/utility-slot-config-form.tsx` — org slot-time config (admin)
- `src/components/dashboard/utility-kpi-rollup.tsx` — org dashboard KPI section

**Modified:**
- `src/lib/db/schema.ts` — columns + 4 tables + relations + types
- `src/lib/utilities/calculations.ts` — 3 pure functions + types
- `src/lib/db/queries/utilities.ts` — upsert reading-by-slot, occupancy, bands, water target, slot config, enriched month read
- `src/lib/db/queries/dashboard.ts` — `getOrgUtilityKpiRollup`
- `src/app/api/utilities/readings/route.ts` — slot + occupancy on POST
- `src/app/api/utilities/public/route.ts` — slot + occupancy on POST
- `src/app/api/utilities/summary/route.ts` — KPI achievement + enriched rows
- `src/components/admin/utility-reading-form.tsx` — slot selector (electricity)
- `src/components/utilities/public-reading-form.tsx` — slot selector + occupancy
- `src/components/admin/utility-readings-table.tsx` — breakdown/target/badge/occupancy columns
- `src/components/admin/utility-summary-cards.tsx` — KPI-achieved card
- `src/components/admin/utilities-page-client.tsx` — wire occupancy, config forms, enriched data
- `src/app/(portal)/dashboard/page.tsx` — render org KPI rollup

---

## Task 1: Schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts` (after `utilityMeterReadings` block, ~line 885)
- Create: `drizzle/0014_electricity_tou_occupancy_kpi.sql`

**Interfaces:**
- Produces (Drizzle tables/types consumed by all later tasks): `utilityMeterReadings.eveningReading`, `utilityMeterReadings.nightReading`; tables `dailyOccupancy`, `electricityKpiBands`, `utilityKpiTargets`, `electricitySlotConfig`; types `DailyOccupancy`, `NewDailyOccupancy`, `ElectricityKpiBand`, `NewElectricityKpiBand`, `UtilityKpiTarget`, `NewUtilityKpiTarget`, `ElectricitySlotConfig`, `NewElectricitySlotConfig`.

- [ ] **Step 1: Add the two slot columns to `utilityMeterReadings`**

In `src/lib/db/schema.ts`, inside the `utilityMeterReadings` table definition, add the two columns immediately after the `readingValue` line (currently line 861):

```typescript
    readingValue: numeric('reading_value', { precision: 12, scale: 2 }).notNull(),
    eveningReading: numeric('evening_reading', { precision: 12, scale: 2 }),
    nightReading: numeric('night_reading', { precision: 12, scale: 2 }),
```

- [ ] **Step 2: Add the four new tables + relations**

In `src/lib/db/schema.ts`, immediately after the `utilityMeterReadingsRelations` block (ends ~line 885) and before the `// Daily Wastage` comment, add:

```typescript
// ---------------------------------------------------------------------------
// Daily Occupancy (one row per property per day — guests + staff)
// ---------------------------------------------------------------------------
export const dailyOccupancy = pgTable(
  'daily_occupancy',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    logDate: date('log_date').notNull(),
    guestCount: integer('guest_count').default(0).notNull(),
    staffCount: integer('staff_count').default(0).notNull(),
    note: text('note'),
    recordedBy: uuid('recorded_by').references(() => profiles.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('daily_occupancy_property_date_unique').on(table.propertyId, table.logDate),
  ]
)

export const dailyOccupancyRelations = relations(dailyOccupancy, ({ one }) => ({
  property: one(properties, {
    fields: [dailyOccupancy.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Electricity KPI Bands (guest-count step function, per property)
// ---------------------------------------------------------------------------
export const electricityKpiBands = pgTable(
  'electricity_kpi_bands',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    minGuests: integer('min_guests').notNull(),
    targetUnits: numeric('target_units', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('electricity_kpi_bands_property_minguests_unique').on(
      table.propertyId,
      table.minGuests
    ),
  ]
)

export const electricityKpiBandsRelations = relations(electricityKpiBands, ({ one }) => ({
  property: one(properties, {
    fields: [electricityKpiBands.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Utility KPI Targets (flat daily target — water in v1)
// ---------------------------------------------------------------------------
export const utilityKpiTargets = pgTable(
  'utility_kpi_targets',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    utilityType: utilityTypeEnum('utility_type').notNull(),
    dailyTargetUnits: numeric('daily_target_units', { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('utility_kpi_targets_property_type_unique').on(
      table.propertyId,
      table.utilityType
    ),
  ]
)

export const utilityKpiTargetsRelations = relations(utilityKpiTargets, ({ one }) => ({
  property: one(properties, {
    fields: [utilityKpiTargets.propertyId],
    references: [properties.id],
  }),
}))

// ---------------------------------------------------------------------------
// Electricity Slot Config (org-wide reading times — labels/guidance only)
// ---------------------------------------------------------------------------
export const electricitySlotConfig = pgTable(
  'electricity_slot_config',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    morningTime: time('morning_time').default('05:30').notNull(),
    eveningTime: time('evening_time').default('17:30').notNull(),
    nightTime: time('night_time').default('22:30').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [unique('electricity_slot_config_org_unique').on(table.orgId)]
)
```

- [ ] **Step 3: Add the `time` import (REQUIRED — verified missing)**

`src/lib/db/schema.ts` imports `pgTable, pgSchema, pgEnum, uuid, text, varchar, boolean, integer, numeric, timestamp, date, unique` from `drizzle-orm/pg-core` (lines 1-14) — `time` is **not** present and the new `electricitySlotConfig` table needs it. Add `time,` to that import list after `date,`:

```typescript
  numeric,
  timestamp,
  date,
  time,
  unique,
} from 'drizzle-orm/pg-core'
```

`integer`, `date`, `numeric`, `text`, `uuid`, `timestamp`, `unique` are already imported; `relations` is imported separately from `drizzle-orm`. No other import changes needed.

Run: `grep -n "  time," src/lib/db/schema.ts`
Expected: one match in the pg-core import block.

- [ ] **Step 4: Add the inferred types**

In `src/lib/db/schema.ts`, after the existing `UtilityMeterReading` type exports (~line 1001), add:

```typescript
export type DailyOccupancy = typeof dailyOccupancy.$inferSelect
export type NewDailyOccupancy = typeof dailyOccupancy.$inferInsert
export type ElectricityKpiBand = typeof electricityKpiBands.$inferSelect
export type NewElectricityKpiBand = typeof electricityKpiBands.$inferInsert
export type UtilityKpiTarget = typeof utilityKpiTargets.$inferSelect
export type NewUtilityKpiTarget = typeof utilityKpiTargets.$inferInsert
export type ElectricitySlotConfig = typeof electricitySlotConfig.$inferSelect
export type NewElectricitySlotConfig = typeof electricitySlotConfig.$inferInsert
```

- [ ] **Step 5: Write the migration SQL**

Create `drizzle/0014_electricity_tou_occupancy_kpi.sql`:

```sql
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "evening_reading" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "night_reading" numeric(12, 2);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "daily_occupancy" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "log_date" date NOT NULL,
  "guest_count" integer DEFAULT 0 NOT NULL,
  "staff_count" integer DEFAULT 0 NOT NULL,
  "note" text,
  "recorded_by" uuid REFERENCES "profiles"("id") ON DELETE set null,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "daily_occupancy_property_date_unique" UNIQUE("property_id", "log_date")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "electricity_kpi_bands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "min_guests" integer NOT NULL,
  "target_units" numeric(12, 2) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "electricity_kpi_bands_property_minguests_unique" UNIQUE("property_id", "min_guests")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "utility_kpi_targets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE cascade,
  "utility_type" "utility_type" NOT NULL,
  "daily_target_units" numeric(12, 2) NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "utility_kpi_targets_property_type_unique" UNIQUE("property_id", "utility_type")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "electricity_slot_config" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "morning_time" time DEFAULT '05:30' NOT NULL,
  "evening_time" time DEFAULT '17:30' NOT NULL,
  "night_time" time DEFAULT '22:30' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "electricity_slot_config_org_unique" UNIQUE("org_id")
);
```

- [ ] **Step 6: Apply the migration in Supabase**

Manual step (the human operator runs this — do not attempt drizzle-kit): paste the SQL from Step 5 into Supabase → SQL Editor → New query → Run. Confirm "Success. No rows returned." If running this plan headless, leave a note that the migration is pending Supabase apply and continue (TypeScript compiles against the schema regardless).

- [ ] **Step 7: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors. (If `time` import was missing it will fail here — fix and rerun.)

- [ ] **Step 8: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0014_electricity_tou_occupancy_kpi.sql
git commit -m "feat(utilities): schema for ToU readings, occupancy, KPI bands & slot config"
```

---

## Task 2: Pure calculation functions

**Files:**
- Modify: `src/lib/utilities/calculations.ts` (append after `calculateDailyConsumption`, ~line 183)
- Verify: throwaway Node script in scratchpad

**Interfaces:**
- Consumes: nothing (pure).
- Produces:
  - `interface SlotRow { date: string; morning: number | null; evening: number | null; night: number | null }`
  - `interface ElectricityDayBreakdown { date: string; day: number | null; peak: number | null; offPeak: number | null; total: number | null; pending: boolean }`
  - `interface KpiBandInput { minGuests: number; targetUnits: number }`
  - `function computeElectricityBreakdown(rows: SlotRow[]): ElectricityDayBreakdown[]`
  - `function resolveBandTarget(guestCount: number | null, bands: KpiBandInput[]): number | null`
  - `function computeKpiAchievement(days: { total: number | null; target: number | null }[]): { evaluatedDays: number; achievedDays: number; pct: number | null }`

- [ ] **Step 1: Append the types and functions**

Add to the end of `src/lib/utilities/calculations.ts`:

```typescript
/**
 * One day's electricity meter readings at the three slots.
 * `morning` is the canonical reading_value; evening/night are the later slots.
 * Rows must be sorted by date ascending.
 */
export interface SlotRow {
  date: string
  morning: number | null
  evening: number | null
  night: number | null
}

export interface ElectricityDayBreakdown {
  date: string
  day: number | null      // evening - morning
  peak: number | null     // night - evening
  offPeak: number | null  // next day's morning - night
  total: number | null    // next day's morning - morning (= day + peak + offPeak)
  pending: boolean        // true when total can't be finalised yet (no next morning)
}

export interface KpiBandInput {
  minGuests: number
  targetUnits: number
}

/**
 * Compute Day / Peak / Off-Peak / Total per day from consecutive slot rows.
 * Off-Peak and Total for a day need the NEXT day's morning reading; until that
 * exists the day is `pending` with null total.
 *
 * A bucket is null when either endpoint reading is missing or the delta is
 * negative (meter reset / bad data) — callers render these as "—".
 */
export function computeElectricityBreakdown(rows: SlotRow[]): ElectricityDayBreakdown[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  return sorted.map((row, i) => {
    const next = i < sorted.length - 1 ? sorted[i + 1] : null
    const nonNeg = (v: number) => (v >= 0 ? v : null)

    const day =
      row.evening !== null && row.morning !== null
        ? nonNeg(row.evening - row.morning)
        : null
    const peak =
      row.night !== null && row.evening !== null
        ? nonNeg(row.night - row.evening)
        : null
    const offPeak =
      next && next.morning !== null && row.night !== null
        ? nonNeg(next.morning - row.night)
        : null
    const total =
      next && next.morning !== null && row.morning !== null
        ? nonNeg(next.morning - row.morning)
        : null

    return {
      date: row.date,
      day,
      peak,
      offPeak,
      total,
      pending: total === null,
    }
  })
}

/**
 * Resolve the banded daily target for a guest count: the target of the band
 * with the largest minGuests <= guestCount. Returns null if guestCount is null
 * or no band qualifies / none configured.
 */
export function resolveBandTarget(
  guestCount: number | null,
  bands: KpiBandInput[]
): number | null {
  if (guestCount === null || bands.length === 0) return null
  const eligible = bands
    .filter((b) => b.minGuests <= guestCount)
    .sort((a, b) => b.minGuests - a.minGuests)
  return eligible.length > 0 ? eligible[0].targetUnits : null
}

/**
 * Compute KPI achievement over a set of days. A day is only evaluated when both
 * its total and target are non-null; achieved when total <= target. Returns a
 * null pct when no days are evaluable.
 */
export function computeKpiAchievement(
  days: { total: number | null; target: number | null }[]
): { evaluatedDays: number; achievedDays: number; pct: number | null } {
  const evaluable = days.filter((d) => d.total !== null && d.target !== null)
  const achieved = evaluable.filter((d) => (d.total as number) <= (d.target as number))
  return {
    evaluatedDays: evaluable.length,
    achievedDays: achieved.length,
    pct: evaluable.length > 0 ? (achieved.length / evaluable.length) * 100 : null,
  }
}
```

- [ ] **Step 2: Verify the math with a throwaway script**

Create `/private/tmp/claude-501/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/680f68bb-e9b0-413a-a546-b0bf5f0a0b40/scratchpad/check-calc.mjs` (paste the three functions inline — copy the bodies from Step 1, replacing `export ` with nothing) plus:

```javascript
// --- assertions ---
const breakdown = computeElectricityBreakdown([
  { date: '2026-06-01', morning: 100, evening: 130, night: 150 },
  { date: '2026-06-02', morning: 210, evening: null, night: null },
])
console.assert(breakdown[0].day === 30, 'day', breakdown[0].day)
console.assert(breakdown[0].peak === 20, 'peak', breakdown[0].peak)
console.assert(breakdown[0].offPeak === 60, 'offPeak', breakdown[0].offPeak)
console.assert(breakdown[0].total === 110, 'total', breakdown[0].total)
console.assert(breakdown[1].pending === true, 'last pending', breakdown[1].pending)

const bands = [
  { minGuests: 0, targetUnits: 224 }, { minGuests: 1, targetUnits: 305 },
  { minGuests: 6, targetUnits: 331 }, { minGuests: 11, targetUnits: 390 },
  { minGuests: 16, targetUnits: 434 }, { minGuests: 21, targetUnits: 483 },
  { minGuests: 26, targetUnits: 501 },
]
console.assert(resolveBandTarget(0, bands) === 224, '0 guests')
console.assert(resolveBandTarget(3, bands) === 305, '3 guests')
console.assert(resolveBandTarget(10, bands) === 331, '10 guests')
console.assert(resolveBandTarget(40, bands) === 501, '40 guests')
console.assert(resolveBandTarget(null, bands) === null, 'null guests')

const ach = computeKpiAchievement([
  { total: 200, target: 224 }, { total: 250, target: 224 },
  { total: null, target: 224 }, { total: 100, target: null },
])
console.assert(ach.evaluatedDays === 2, 'evaluated', ach.evaluatedDays)
console.assert(ach.achievedDays === 1, 'achieved', ach.achievedDays)
console.assert(ach.pct === 50, 'pct', ach.pct)
console.log('ALL CALC ASSERTIONS PASSED')
```

Run: `node "/private/tmp/claude-501/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/680f68bb-e9b0-413a-a546-b0bf5f0a0b40/scratchpad/check-calc.mjs"`
Expected: `ALL CALC ASSERTIONS PASSED` and no `Assertion failed` warnings. Delete the script afterward.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utilities/calculations.ts
git commit -m "feat(utilities): pure ToU breakdown + KPI band/achievement calculators"
```

---

## Task 3: Query layer

**Files:**
- Modify: `src/lib/db/queries/utilities.ts`

**Interfaces:**
- Consumes: schema tables/types from Task 1.
- Produces (consumed by Tasks 4-6, 9):
  - `upsertReading(data: { propertyId; utilityType; readingDate; readingValue; slot: 'morning'|'evening'|'night'; note?; recordedBy? }): Promise<UtilityMeterReading>`
  - `upsertOccupancy(data: { propertyId; logDate; guestCount; staffCount; note?; recordedBy? }): Promise<DailyOccupancy>`
  - `getOccupancyForMonth(propertyId, year, month): Promise<DailyOccupancy[]>`
  - `getElectricityBands(propertyId): Promise<ElectricityKpiBand[]>`
  - `upsertElectricityBands(propertyId, bands: { minGuests: number; targetUnits: string }[]): Promise<ElectricityKpiBand[]>`
  - `getWaterKpiTarget(propertyId): Promise<UtilityKpiTarget | null>`
  - `upsertWaterKpiTarget(propertyId, dailyTargetUnits: string): Promise<UtilityKpiTarget>`
  - `getSlotConfig(orgId): Promise<{ morningTime: string; eveningTime: string; nightTime: string }>` (returns defaults if no row)
  - `upsertSlotConfig(orgId, data: { morningTime; eveningTime; nightTime }): Promise<ElectricitySlotConfig>`

- [ ] **Step 1: Extend imports**

In `src/lib/db/queries/utilities.ts`, update the schema import (currently imports `utilityRateTiers, utilityMeterReadings, profiles`) to also import the new tables, and add `sql` is already imported:

```typescript
import {
  utilityRateTiers,
  utilityMeterReadings,
  dailyOccupancy,
  electricityKpiBands,
  utilityKpiTargets,
  electricitySlotConfig,
  profiles,
} from '../schema'
```

- [ ] **Step 2: Replace `createReading` with a slot-aware upsert**

The existing `createReading` (lines 127-144) rejects duplicate (property, utility, date). Electricity now writes up to 3 times per day, so replace it with an upsert that targets the slot's column. Replace the whole `createReading` function with:

```typescript
/**
 * Upsert a meter reading for a (property, utilityType, date). Water always uses
 * the 'morning' slot (= reading_value). Electricity writes the column for the
 * given slot, leaving the others intact on conflict.
 */
export async function upsertReading(data: {
  propertyId: string
  utilityType: 'water' | 'electricity'
  readingDate: string
  readingValue: string
  slot: 'morning' | 'evening' | 'night'
  note?: string | null
  recordedBy?: string | null
}) {
  const column =
    data.slot === 'morning'
      ? 'readingValue'
      : data.slot === 'evening'
        ? 'eveningReading'
        : 'nightReading'

  const insertValues = {
    propertyId: data.propertyId,
    utilityType: data.utilityType,
    readingDate: data.readingDate,
    readingValue: data.slot === 'morning' ? data.readingValue : '0',
    eveningReading: data.slot === 'evening' ? data.readingValue : null,
    nightReading: data.slot === 'night' ? data.readingValue : null,
    note: data.note ?? null,
    recordedBy: data.recordedBy ?? null,
  }

  const setOnConflict: Record<string, unknown> = {
    [column]: data.readingValue,
    updatedAt: new Date(),
  }
  if (data.note !== undefined) setOnConflict.note = data.note
  if (data.recordedBy !== undefined) setOnConflict.recordedBy = data.recordedBy

  const [row] = await db
    .insert(utilityMeterReadings)
    .values(insertValues)
    .onConflictDoUpdate({
      target: [
        utilityMeterReadings.propertyId,
        utilityMeterReadings.utilityType,
        utilityMeterReadings.readingDate,
      ],
      set: setOnConflict,
    })
    .returning()

  return row
}
```

Note: when a brand-new electricity row is created for the evening/night slot before any morning reading, `readingValue` defaults to `'0'`. That is acceptable — the morning slot will be filled by its own round, and breakdown math treats a `0` morning against a real evening as a (likely large) Day value; the entry workflow takes morning first. The API layer (Task 4) validates ordering.

- [ ] **Step 3: Add occupancy queries**

Append after the Meter Readings section (before `// Rate Tiers`):

```typescript
// ---------------------------------------------------------------------------
// Daily Occupancy
// ---------------------------------------------------------------------------

export async function upsertOccupancy(data: {
  propertyId: string
  logDate: string
  guestCount: number
  staffCount: number
  note?: string | null
  recordedBy?: string | null
}) {
  const [row] = await db
    .insert(dailyOccupancy)
    .values({
      propertyId: data.propertyId,
      logDate: data.logDate,
      guestCount: data.guestCount,
      staffCount: data.staffCount,
      note: data.note ?? null,
      recordedBy: data.recordedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [dailyOccupancy.propertyId, dailyOccupancy.logDate],
      set: {
        guestCount: data.guestCount,
        staffCount: data.staffCount,
        note: data.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning()

  return row
}

export async function getOccupancyForMonth(
  propertyId: string,
  year: number,
  month: number
) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

  return db
    .select()
    .from(dailyOccupancy)
    .where(
      and(
        eq(dailyOccupancy.propertyId, propertyId),
        gte(dailyOccupancy.logDate, startDate),
        lte(dailyOccupancy.logDate, endDate)
      )
    )
    .orderBy(asc(dailyOccupancy.logDate))
}
```

- [ ] **Step 4: Add KPI band, water target, and slot-config queries**

Append a new section after the Rate Tiers section:

```typescript
// ---------------------------------------------------------------------------
// Electricity KPI Bands
// ---------------------------------------------------------------------------

export async function getElectricityBands(propertyId: string) {
  return db
    .select()
    .from(electricityKpiBands)
    .where(eq(electricityKpiBands.propertyId, propertyId))
    .orderBy(asc(electricityKpiBands.minGuests))
}

/**
 * Replace all electricity KPI bands for a property (delete + insert in a tx).
 */
export async function upsertElectricityBands(
  propertyId: string,
  bands: { minGuests: number; targetUnits: string }[]
) {
  return db.transaction(async (tx) => {
    await tx
      .delete(electricityKpiBands)
      .where(eq(electricityKpiBands.propertyId, propertyId))

    if (bands.length > 0) {
      return tx
        .insert(electricityKpiBands)
        .values(
          bands.map((b) => ({
            propertyId,
            minGuests: b.minGuests,
            targetUnits: b.targetUnits,
          }))
        )
        .returning()
    }
    return []
  })
}

// ---------------------------------------------------------------------------
// Water KPI Target (flat)
// ---------------------------------------------------------------------------

export async function getWaterKpiTarget(propertyId: string) {
  const [row] = await db
    .select()
    .from(utilityKpiTargets)
    .where(
      and(
        eq(utilityKpiTargets.propertyId, propertyId),
        eq(utilityKpiTargets.utilityType, 'water')
      )
    )
    .limit(1)
  return row ?? null
}

export async function upsertWaterKpiTarget(
  propertyId: string,
  dailyTargetUnits: string
) {
  const [row] = await db
    .insert(utilityKpiTargets)
    .values({ propertyId, utilityType: 'water', dailyTargetUnits })
    .onConflictDoUpdate({
      target: [utilityKpiTargets.propertyId, utilityKpiTargets.utilityType],
      set: { dailyTargetUnits, updatedAt: new Date() },
    })
    .returning()
  return row
}

// ---------------------------------------------------------------------------
// Electricity Slot Config (org-wide)
// ---------------------------------------------------------------------------

const DEFAULT_SLOT_TIMES = {
  morningTime: '05:30:00',
  eveningTime: '17:30:00',
  nightTime: '22:30:00',
}

export async function getSlotConfig(orgId: string) {
  const [row] = await db
    .select()
    .from(electricitySlotConfig)
    .where(eq(electricitySlotConfig.orgId, orgId))
    .limit(1)
  if (!row) return DEFAULT_SLOT_TIMES
  return {
    morningTime: row.morningTime,
    eveningTime: row.eveningTime,
    nightTime: row.nightTime,
  }
}

export async function upsertSlotConfig(
  orgId: string,
  data: { morningTime: string; eveningTime: string; nightTime: string }
) {
  const [row] = await db
    .insert(electricitySlotConfig)
    .values({ orgId, ...data })
    .onConflictDoUpdate({
      target: [electricitySlotConfig.orgId],
      set: { ...data, updatedAt: new Date() },
    })
    .returning()
  return row
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: errors ONLY in files that still import the now-removed `createReading` (`readings/route.ts`, `public/route.ts`) — those are fixed in Task 4. If any error appears inside `utilities.ts` itself, fix it before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/queries/utilities.ts
git commit -m "feat(utilities): slot-aware reading upsert + occupancy/bands/target/slot-config queries"
```

---

## Task 4: Reading entry API routes (slot + occupancy)

**Files:**
- Modify: `src/app/api/utilities/readings/route.ts`
- Modify: `src/app/api/utilities/public/route.ts`

**Interfaces:**
- Consumes: `upsertReading`, `upsertOccupancy`, `getLatestReading` from Task 3.
- Produces: POST bodies now accept `slot?`, `guestCount?`, `staffCount?`.

- [ ] **Step 1: Update `readings/route.ts` POST**

In `src/app/api/utilities/readings/route.ts`:

(a) Change the import line from `createReading` to `upsertReading` and add `upsertOccupancy`:

```typescript
import {
  getReadingsForMonth,
  getLatestReading,
  upsertReading,
  upsertOccupancy,
} from '@/lib/db/queries/utilities'
```

(b) Replace `createReadingSchema` with:

```typescript
const createReadingSchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  readingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  readingValue: z.number().min(0),
  slot: z.enum(['morning', 'evening', 'night']).optional(),
  note: z.string().max(500).nullable().optional(),
  guestCount: z.number().int().min(0).optional(),
  staffCount: z.number().int().min(0).optional(),
})
```

(c) Replace the body of the POST after the access check (the `getLatestReading` block through the `createReading` call, lines ~97-119) with:

```typescript
    // Water always uses the morning slot; electricity defaults to morning too.
    const slot =
      parsed.data.utilityType === 'electricity'
        ? parsed.data.slot ?? 'morning'
        : 'morning'

    // Validate cumulative order against the latest morning reading
    const latest = await getLatestReading(
      parsed.data.propertyId,
      parsed.data.utilityType
    )
    if (
      slot === 'morning' &&
      latest &&
      parsed.data.readingValue < parseFloat(latest.readingValue)
    ) {
      return NextResponse.json(
        {
          error: `Reading value must be >= the previous reading (${latest.readingValue} on ${latest.readingDate})`,
        },
        { status: 400 }
      )
    }

    const reading = await upsertReading({
      propertyId: parsed.data.propertyId,
      utilityType: parsed.data.utilityType,
      readingDate: parsed.data.readingDate,
      readingValue: String(parsed.data.readingValue),
      slot,
      note: parsed.data.note ?? null,
      recordedBy: profile.id,
    })

    // Optional occupancy upsert (once per property/day)
    if (
      parsed.data.guestCount !== undefined ||
      parsed.data.staffCount !== undefined
    ) {
      await upsertOccupancy({
        propertyId: parsed.data.propertyId,
        logDate: parsed.data.readingDate,
        guestCount: parsed.data.guestCount ?? 0,
        staffCount: parsed.data.staffCount ?? 0,
        recordedBy: profile.id,
      })
    }

    return NextResponse.json(reading, { status: 201 })
```

Also remove the now-stale `409 unique` catch branch behaviour: since upsert no longer throws on duplicate date, the `if (error... includes('unique'))` block is dead but harmless — leave it; it will simply never fire.

- [ ] **Step 2: Update `public/route.ts` POST**

In `src/app/api/utilities/public/route.ts`:

(a) Change imports:

```typescript
import { getLatestReading, upsertReading, upsertOccupancy } from '@/lib/db/queries/utilities'
```

(b) Replace `publicReadingSchema` with the same expanded schema (add `slot`, `guestCount`, `staffCount` as in Step 1b).

(c) Replace the `getLatestReading` ordering block + `createReading` call with the same logic as Step 1c, but with `recordedBy: null` for both the reading and occupancy upsert.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors (Task 3's dangling references are now resolved).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in the two route files.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/utilities/readings/route.ts src/app/api/utilities/public/route.ts
git commit -m "feat(utilities): accept slot + occupancy on reading entry routes"
```

---

## Task 5: KPI / slot-config API routes

**Files:**
- Create: `src/app/api/utilities/kpi-bands/route.ts`
- Create: `src/app/api/utilities/kpis/route.ts`
- Create: `src/app/api/utilities/slot-config/route.ts`

**Interfaces:**
- Consumes: `getElectricityBands`, `upsertElectricityBands`, `getWaterKpiTarget`, `upsertWaterKpiTarget`, `getSlotConfig`, `upsertSlotConfig`, `getProfile`, `getUserProperties`.

- [ ] **Step 1: Create `kpi-bands/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getElectricityBands, upsertElectricityBands } from '@/lib/db/queries/utilities'

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

const upsertBandsSchema = z.object({
  propertyId: z.string().uuid(),
  bands: z
    .array(
      z.object({
        minGuests: z.number().int().min(0),
        targetUnits: z.number().min(0),
      })
    )
    .min(1)
    .max(20),
})

// GET /api/utilities/kpi-bands?propertyId=xxx
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const propertyId = new URL(request.url).searchParams.get('propertyId')
    if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })

    if (!(await checkPropertyAccess(profile, propertyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(await getElectricityBands(propertyId))
  } catch (error) {
    console.error('GET /api/utilities/kpi-bands error:', error)
    return NextResponse.json({ error: 'Failed to fetch bands' }, { status: 500 })
  }
}

// PUT /api/utilities/kpi-bands — admin only, replaces all bands
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertBandsSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    // Reject duplicate minGuests thresholds (unique constraint backstop)
    const thresholds = parsed.data.bands.map((b) => b.minGuests)
    if (new Set(thresholds).size !== thresholds.length) {
      return NextResponse.json(
        { error: 'Guest-count thresholds must be unique' },
        { status: 400 }
      )
    }

    const result = await upsertElectricityBands(
      parsed.data.propertyId,
      parsed.data.bands.map((b) => ({
        minGuests: b.minGuests,
        targetUnits: String(b.targetUnits),
      }))
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/kpi-bands error:', error)
    return NextResponse.json({ error: 'Failed to update bands' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Create `kpis/route.ts` (water flat target)**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getWaterKpiTarget, upsertWaterKpiTarget } from '@/lib/db/queries/utilities'

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

const upsertTargetSchema = z.object({
  propertyId: z.string().uuid(),
  dailyTargetUnits: z.number().min(0),
})

// GET /api/utilities/kpis?propertyId=xxx  (water flat target)
export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const propertyId = new URL(request.url).searchParams.get('propertyId')
    if (!propertyId) return NextResponse.json({ error: 'propertyId is required' }, { status: 400 })

    if (!(await checkPropertyAccess(profile, propertyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json(await getWaterKpiTarget(propertyId))
  } catch (error) {
    console.error('GET /api/utilities/kpis error:', error)
    return NextResponse.json({ error: 'Failed to fetch target' }, { status: 500 })
  }
}

// PUT /api/utilities/kpis — admin only
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertTargetSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await upsertWaterKpiTarget(
      parsed.data.propertyId,
      String(parsed.data.dailyTargetUnits)
    )
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/kpis error:', error)
    return NextResponse.json({ error: 'Failed to update target' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create `slot-config/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getSlotConfig, upsertSlotConfig } from '@/lib/db/queries/utilities'

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/

const upsertSlotSchema = z.object({
  morningTime: z.string().regex(timeRegex),
  eveningTime: z.string().regex(timeRegex),
  nightTime: z.string().regex(timeRegex),
})

// GET /api/utilities/slot-config
export async function GET() {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return NextResponse.json(await getSlotConfig(profile.orgId))
  } catch (error) {
    console.error('GET /api/utilities/slot-config error:', error)
    return NextResponse.json({ error: 'Failed to fetch slot config' }, { status: 500 })
  }
}

// PUT /api/utilities/slot-config — admin only
export async function PUT(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }

    const parsed = upsertSlotSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const result = await upsertSlotConfig(profile.orgId, parsed.data)
    return NextResponse.json(result)
  } catch (error) {
    console.error('PUT /api/utilities/slot-config error:', error)
    return NextResponse.json({ error: 'Failed to update slot config' }, { status: 500 })
  }
}
```

Note: `getProfile()` returns a profile with an `orgId` field (verified in `src/lib/auth/guards.ts`), so `profile.orgId` is correct here.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` (expected: no errors) then `npm run lint`.

```bash
git add src/app/api/utilities/kpi-bands/route.ts src/app/api/utilities/kpis/route.ts src/app/api/utilities/slot-config/route.ts
git commit -m "feat(utilities): KPI bands, water target & slot-config API routes"
```

---

## Task 6: Summary API route — KPI achievement + enriched rows

**Files:**
- Modify: `src/app/api/utilities/summary/route.ts`

**Interfaces:**
- Consumes: `getOccupancyForMonth`, `getElectricityBands`, `getWaterKpiTarget` (Task 3); `computeElectricityBreakdown`, `resolveBandTarget`, `computeKpiAchievement`, types `SlotRow`, `KpiBandInput` (Task 2).
- Produces: summary JSON gains `kpi: { configured: boolean; pct: number | null; evaluatedDays: number; achievedDays: number }` and `dailyRows: EnrichedDayRow[]` consumed by the readings table + cards in Task 7.

- [ ] **Step 1: Add imports**

In `src/app/api/utilities/summary/route.ts` add to the queries import:

```typescript
import {
  getReadingsForMonth,
  getPreviousMonthLastReading,
  getTiersForProperty,
  getConsumptionHistory,
  getOccupancyForMonth,
  getElectricityBands,
  getWaterKpiTarget,
} from '@/lib/db/queries/utilities'
import {
  predictMonthlyBill,
  calculateDailyConsumption,
  computeElectricityBreakdown,
  resolveBandTarget,
  computeKpiAchievement,
  type TierInput,
  type SlotRow,
} from '@/lib/utilities/calculations'
```

- [ ] **Step 2: Fetch occupancy + KPI config alongside existing data**

Replace the `Promise.all` block (lines ~62-67) with:

```typescript
    const [monthReadings, prevReading, tiers, history, occupancy, bands, waterTarget] =
      await Promise.all([
        getReadingsForMonth(propertyId, utilityType, yearNum, monthNum),
        getPreviousMonthLastReading(propertyId, utilityType, yearNum, monthNum),
        getTiersForProperty(propertyId, utilityType),
        getConsumptionHistory(propertyId, utilityType, 6),
        getOccupancyForMonth(propertyId, yearNum, monthNum),
        utilityType === 'electricity'
          ? getElectricityBands(propertyId)
          : Promise.resolve([]),
        utilityType === 'water'
          ? getWaterKpiTarget(propertyId)
          : Promise.resolve(null),
      ])
```

- [ ] **Step 3: Build the enriched per-day rows + KPI achievement**

Insert this block after `dailyConsumption` is computed (after line ~98) and before the `return NextResponse.json({`:

```typescript
    // Occupancy lookup by date
    const occByDate = new Map(
      occupancy.map((o) => [o.logDate, o])
    )

    type EnrichedDayRow = {
      date: string
      readingValue: number | null
      day: number | null
      peak: number | null
      offPeak: number | null
      total: number | null
      pending: boolean
      guestCount: number | null
      staffCount: number | null
      target: number | null
      achieved: boolean | null
    }

    let dailyRows: EnrichedDayRow[] = []

    if (utilityType === 'electricity') {
      const slotRows: SlotRow[] = monthReadings.map((r) => ({
        date: r.readingDate,
        morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
        evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
        night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
      }))
      const bandInputs = bands.map((b) => ({
        minGuests: b.minGuests,
        targetUnits: parseFloat(b.targetUnits),
      }))
      const breakdown = computeElectricityBreakdown(slotRows)

      dailyRows = breakdown.map((b, i) => {
        const occ = occByDate.get(b.date)
        const guestCount = occ ? occ.guestCount : null
        const target = resolveBandTarget(guestCount, bandInputs)
        return {
          date: b.date,
          readingValue: slotRows[i].morning,
          day: b.day,
          peak: b.peak,
          offPeak: b.offPeak,
          total: b.total,
          pending: b.pending,
          guestCount,
          staffCount: occ ? occ.staffCount : null,
          target,
          achieved:
            b.total !== null && target !== null ? b.total <= target : null,
        }
      })
    } else {
      // Water: daily usage = consecutive reading_value deltas; flat target
      const target = waterTarget ? parseFloat(waterTarget.dailyTargetUnits) : null
      dailyRows = monthReadings.map((r, i) => {
        const prev = i > 0 ? monthReadings[i - 1] : null
        const total =
          prev !== null
            ? parseFloat(r.readingValue) - parseFloat(prev.readingValue)
            : null
        const occ = occByDate.get(r.readingDate)
        return {
          date: r.readingDate,
          readingValue: parseFloat(r.readingValue),
          day: null,
          peak: null,
          offPeak: null,
          total,
          pending: total === null,
          guestCount: occ ? occ.guestCount : null,
          staffCount: occ ? occ.staffCount : null,
          target,
          achieved: total !== null && target !== null ? total <= target : null,
        }
      })
    }

    const achievement = computeKpiAchievement(
      dailyRows.map((r) => ({ total: r.total, target: r.target }))
    )
    const kpiConfigured =
      utilityType === 'electricity' ? bands.length > 0 : waterTarget !== null
```

- [ ] **Step 4: Extend the JSON response**

Add the two fields to the returned object (alongside `tiersConfigured`, `readingCount`):

```typescript
      tiersConfigured: tiers.length > 0,
      readingCount: monthReadings.length,
      dailyRows,
      kpi: {
        configured: kpiConfigured,
        pct: achievement.pct,
        evaluatedDays: achievement.evaluatedDays,
        achievedDays: achievement.achievedDays,
      },
```

- [ ] **Step 5: Verify + commit**

Run: `npx tsc --noEmit` (no errors), `npm run lint`.

```bash
git add src/app/api/utilities/summary/route.ts
git commit -m "feat(utilities): summary returns ToU breakdown rows + KPI achievement"
```

---

## Task 7: Management page UI

This task has the most surface area; each step ends independently testable via `npx tsc --noEmit`. Commit once at the end.

**Files:**
- Modify: `src/components/admin/utility-reading-form.tsx`
- Create: `src/components/admin/utility-occupancy-form.tsx`
- Modify: `src/components/admin/utility-readings-table.tsx`
- Modify: `src/components/admin/utility-summary-cards.tsx`
- Create: `src/components/admin/utility-kpi-bands-form.tsx`
- Create: `src/components/admin/utility-water-kpi-form.tsx`
- Create: `src/components/admin/utility-slot-config-form.tsx`
- Modify: `src/components/admin/utilities-page-client.tsx`

**Interfaces:**
- Consumes: the `dailyRows` + `kpi` shape from Task 6; APIs from Tasks 4-5.

- [ ] **Step 1: Add a slot selector to `UtilityReadingForm`**

In `src/components/admin/utility-reading-form.tsx`:

(a) Add a `Select` import and a slot state. After the existing imports add:

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

(b) Add a prop `slotTimes?: { morningTime: string; eveningTime: string; nightTime: string }` to `ReadingFormProps` and a state after `readingDate`:

```typescript
  const [slot, setSlot] = useState<'morning' | 'evening' | 'night'>('morning')
```

(c) Add a helper to format a `HH:MM[:SS]` string to a short label:

```typescript
  function fmtTime(t?: string) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h12 = hour % 12 === 0 ? 12 : hour % 12
    return `${h12}:${m} ${ampm}`
  }
```

(d) In the form JSX, immediately after the Date field block, render the slot selector ONLY for electricity:

```typescript
          {utilityType === 'electricity' && (
            <div className="space-y-2">
              <Label htmlFor="reading-slot">Reading Time</Label>
              <Select value={slot} onValueChange={(v) => setSlot(v as typeof slot)}>
                <SelectTrigger id="reading-slot">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="morning">
                    Morning {fmtTime(slotTimes?.morningTime)}
                  </SelectItem>
                  <SelectItem value="evening">
                    Evening {fmtTime(slotTimes?.eveningTime)}
                  </SelectItem>
                  <SelectItem value="night">
                    Night {fmtTime(slotTimes?.nightTime)}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
```

(e) In `handleSubmit`, add `slot` to the POST body (only meaningful for electricity, harmless for water):

```typescript
        body: JSON.stringify({
          propertyId,
          utilityType,
          readingDate,
          readingValue: value,
          slot,
          note: note || null,
        }),
```

- [ ] **Step 2: Create `utility-occupancy-form.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface OccupancyFormProps {
  propertyId: string
  date: string
  initialGuests?: number | null
  initialStaff?: number | null
  onSuccess: () => void
}

export function UtilityOccupancyForm({
  propertyId,
  date,
  initialGuests,
  initialStaff,
  onSuccess,
}: OccupancyFormProps) {
  const [guestCount, setGuestCount] = useState('')
  const [staffCount, setStaffCount] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    setGuestCount(initialGuests != null ? String(initialGuests) : '')
    setStaffCount(initialStaff != null ? String(initialStaff) : '')
  }, [initialGuests, initialStaff, date])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      // Reuse the readings route's occupancy upsert path by posting a no-op?
      // Instead post directly to the dedicated occupancy upsert via readings route
      // is not possible without a reading; use a thin fetch to the public-safe path.
      const res = await fetch('/api/utilities/occupancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId,
          logDate: date,
          guestCount: parseInt(guestCount) || 0,
          staffCount: parseInt(staffCount) || 0,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save occupancy')
      }
      toast.success('Occupancy saved')
      onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Users className="size-4" />
          Daily Occupancy
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="occ-guests">Guests</Label>
            <Input
              id="occ-guests"
              type="number"
              min="0"
              className="w-28"
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="occ-staff">Staff</Label>
            <Input
              id="occ-staff"
              type="number"
              min="0"
              className="w-28"
              value={staffCount}
              onChange={(e) => setStaffCount(e.target.value)}
              placeholder="0"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Save'}
          </Button>
          <p className="text-xs text-muted-foreground basis-full">
            For {date}. Guest count drives the electricity KPI target.
          </p>
        </form>
      </CardContent>
    </Card>
  )
}
```

This needs a dedicated occupancy route. Create `src/app/api/utilities/occupancy/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { upsertOccupancy } from '@/lib/db/queries/utilities'

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

const occupancySchema = z.object({
  propertyId: z.string().uuid(),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  guestCount: z.number().int().min(0),
  staffCount: z.number().int().min(0),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const parsed = occupancySchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    if (!(await checkPropertyAccess(profile, parsed.data.propertyId))) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const row = await upsertOccupancy({
      propertyId: parsed.data.propertyId,
      logDate: parsed.data.logDate,
      guestCount: parsed.data.guestCount,
      staffCount: parsed.data.staffCount,
      recordedBy: profile.id,
    })
    return NextResponse.json(row, { status: 201 })
  } catch (error) {
    console.error('POST /api/utilities/occupancy error:', error)
    return NextResponse.json({ error: 'Failed to save occupancy' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Add breakdown/target/badge/occupancy columns to `UtilityReadingsTable`**

The table currently computes consumption locally from `readings`. Switch it to consume the server-computed `dailyRows` (from Task 6) passed as a new prop, so electricity buckets and KPI badges come from one source of truth.

Replace the `ReadingsTableProps` interface and the local consumption computation with a `dailyRows`-driven render. Concretely:

(a) Replace the `ReadingEntry` interface + `ReadingsTableProps` with:

```typescript
interface DailyRow {
  date: string
  readingValue: number | null
  day: number | null
  peak: number | null
  offPeak: number | null
  total: number | null
  pending: boolean
  guestCount: number | null
  staffCount: number | null
  target: number | null
  achieved: boolean | null
}

interface ReadingEntry {
  id: string
  readingDate: string
  readingValue: string
  note: string | null
  recorderName: string | null
}

interface ReadingsTableProps {
  readings: ReadingEntry[]
  dailyRows: DailyRow[]
  utilityType: 'water' | 'electricity'
  onRefresh: () => void
}
```

(b) Update the component signature to destructure the new props: `export function UtilityReadingsTable({ readings, dailyRows, utilityType, onRefresh }: ReadingsTableProps)`. Keep the existing edit/delete handlers (they still target `readings` by id). Build a `Map` from `readingDate` → reading id so the edit/delete buttons can resolve the row id:

```typescript
  const idByDate = new Map(readings.map((r) => [r.readingDate, r]))
  const displayRows = [...dailyRows].reverse() // newest first
```

(c) Replace the table header + body. Header:

```typescript
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Meter</TableHead>
                  {utilityType === 'electricity' ? (
                    <>
                      <TableHead className="text-right">Day</TableHead>
                      <TableHead className="text-right">Peak</TableHead>
                      <TableHead className="text-right">Off-Peak</TableHead>
                    </>
                  ) : null}
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Target</TableHead>
                  <TableHead className="text-center">KPI</TableHead>
                  <TableHead className="text-right">Guests</TableHead>
                  <TableHead className="text-right">Staff</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
```

Body row (a `num` helper renders `—` for null):

```typescript
                {displayRows.map((row) => {
                  const reading = idByDate.get(row.date)
                  const num = (v: number | null) => (v !== null ? v.toFixed(1) : '—')
                  return (
                    <TableRow key={row.date}>
                      <TableCell className="font-medium">{formatDate(row.date)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.readingValue !== null ? row.readingValue.toLocaleString() : '—'}
                      </TableCell>
                      {utilityType === 'electricity' ? (
                        <>
                          <TableCell className="text-right tabular-nums">{num(row.day)}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(row.peak)}</TableCell>
                          <TableCell className="text-right tabular-nums">{num(row.offPeak)}</TableCell>
                        </>
                      ) : null}
                      <TableCell className="text-right tabular-nums">
                        {row.pending ? (
                          <span className="text-muted-foreground">pending</span>
                        ) : (
                          num(row.total)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {num(row.target)}
                      </TableCell>
                      <TableCell className="text-center">
                        {row.achieved === null ? (
                          <span className="text-muted-foreground text-xs">—</span>
                        ) : row.achieved ? (
                          <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                            Met
                          </span>
                        ) : (
                          <span className="inline-block rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Over
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.guestCount ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.staffCount ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost" size="icon" className="size-8"
                            disabled={!reading}
                            onClick={() => {
                              if (!reading) return
                              setEditReading(reading)
                              setEditValue(reading.readingValue)
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="size-8"
                            disabled={!reading}
                            onClick={() => reading && setDeleteReading(reading)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
```

(d) Change the empty-state condition from `displayReadings.length > 0` to `displayRows.length > 0`, and update the `editReading`/`deleteReading` state types to the local `ReadingEntry` (unchanged shape). Remove the now-unused `readingsWithConsumption`/`displayReadings` block.

- [ ] **Step 4: Add a KPI-achievement card to `UtilitySummaryCards`**

In `src/components/admin/utility-summary-cards.tsx`:

(a) Add `Target` to the lucide import and two props:

```typescript
import { Droplets, Zap, TrendingUp, Calculator, Target } from 'lucide-react'
```

Add to `SummaryCardsProps`:

```typescript
  kpiConfigured: boolean
  kpiPct: number | null
  kpiEvaluatedDays: number
```

(b) Destructure them in the component params, and append a fifth card. Change the grid to `lg:grid-cols-5` and add this card object to the `cards` array (after "Predicted Bill"):

```typescript
    {
      title: 'KPI Achieved',
      value: loading
        ? '—'
        : !kpiConfigured
          ? 'No KPI set'
          : kpiPct === null
            ? 'No data'
            : `${kpiPct.toFixed(0)}%`,
      subtitle: loading || !kpiConfigured || kpiPct === null
        ? ''
        : `${kpiEvaluatedDays} day${kpiEvaluatedDays === 1 ? '' : 's'} evaluated`,
      icon: Target,
    },
```

Change the wrapping grid className from `lg:grid-cols-4` to `lg:grid-cols-5`.

- [ ] **Step 5: Create `utility-kpi-bands-form.tsx` (mirror `UtilityTierForm`)**

Model this exactly on `src/components/admin/utility-tier-form.tsx` (replace-all editor) but for bands with add/remove rows. Full file:

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Settings2, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface Band {
  minGuests: number
  targetUnits: number
}

interface KpiBandsFormProps {
  propertyId: string
  onRefresh: () => void
}

const DEFAULT_BANDS: Band[] = [
  { minGuests: 0, targetUnits: 224 },
  { minGuests: 1, targetUnits: 305 },
  { minGuests: 6, targetUnits: 331 },
  { minGuests: 11, targetUnits: 390 },
  { minGuests: 16, targetUnits: 434 },
  { minGuests: 21, targetUnits: 483 },
  { minGuests: 26, targetUnits: 501 },
]

export function UtilityKpiBandsForm({ propertyId, onRefresh }: KpiBandsFormProps) {
  const [bands, setBands] = useState<Band[]>([])
  const [editBands, setEditBands] = useState<Band[]>([])
  const [showDialog, setShowDialog] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBands()
  }, [propertyId])

  async function fetchBands() {
    setLoading(true)
    try {
      const res = await fetch(`/api/utilities/kpi-bands?propertyId=${propertyId}`)
      if (res.ok) {
        const data = await res.json()
        setBands(
          data.map((b: { minGuests: number; targetUnits: string }) => ({
            minGuests: b.minGuests,
            targetUnits: parseFloat(b.targetUnits),
          }))
        )
      }
    } catch (error) {
      console.error('Failed to fetch bands:', error)
    } finally {
      setLoading(false)
    }
  }

  function openEdit() {
    setEditBands(bands.length > 0 ? [...bands] : [...DEFAULT_BANDS])
    setShowDialog(true)
  }

  function updateBand(index: number, field: keyof Band, value: string) {
    setEditBands((prev) => {
      const updated = [...prev]
      updated[index] = {
        ...updated[index],
        [field]: field === 'minGuests' ? parseInt(value) || 0 : parseFloat(value) || 0,
      }
      return updated
    })
  }

  function addBand() {
    setEditBands((prev) => [...prev, { minGuests: 0, targetUnits: 0 }])
  }

  function removeBand(index: number) {
    setEditBands((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    // Sort + dedupe-check before submit
    const sorted = [...editBands].sort((a, b) => a.minGuests - b.minGuests)
    const thresholds = sorted.map((b) => b.minGuests)
    if (new Set(thresholds).size !== thresholds.length) {
      toast.error('Guest-count thresholds must be unique')
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/kpi-bands', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, bands: sorted }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save bands')
      }
      toast.success('KPI bands updated')
      setShowDialog(false)
      await fetchBands()
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">
            Electricity KPI Bands (kWh by guest count)
          </CardTitle>
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Settings2 className="size-4" />
            {bands.length > 0 ? 'Edit Bands' : 'Set Up Bands'}
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : bands.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guests (from)</TableHead>
                    <TableHead className="text-right">Daily target (kWh)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bands.map((band) => (
                    <TableRow key={band.minGuests}>
                      <TableCell className="font-medium">{band.minGuests}+</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {band.targetUnits.toFixed(0)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No KPI bands configured. Set up bands to track electricity KPI achievement.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Electricity KPI Bands</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {editBands.map((band, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Guests from</Label>
                  <Input
                    type="number" min="0"
                    value={band.minGuests}
                    onChange={(e) => updateBand(index, 'minGuests', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Target (kWh)</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={band.targetUnits}
                    onChange={(e) => updateBand(index, 'targetUnits', e.target.value)}
                  />
                </div>
                <Button
                  variant="ghost" size="icon"
                  onClick={() => removeBand(index)}
                  disabled={editBands.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addBand}>
              <Plus className="size-4" /> Add Band
            </Button>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Bands'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
```

- [ ] **Step 6: Create `utility-water-kpi-form.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Target } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface WaterKpiFormProps {
  propertyId: string
  onRefresh: () => void
}

export function UtilityWaterKpiForm({ propertyId, onRefresh }: WaterKpiFormProps) {
  const [target, setTarget] = useState('')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/utilities/kpis?propertyId=${propertyId}`)
        if (res.ok) {
          const data = await res.json()
          if (data?.dailyTargetUnits) setTarget(String(parseFloat(data.dailyTargetUnits)))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [propertyId])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/kpis', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, dailyTargetUnits: parseFloat(target) || 0 }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save target')
      }
      toast.success('Water KPI target updated')
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="size-4" />
          Water KPI (daily target)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="water-target">Daily target (units)</Label>
            <Input
              id="water-target" type="number" min="0" step="0.01"
              className="w-40"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              disabled={loading}
              placeholder="e.g. 5"
            />
          </div>
          <Button onClick={handleSave} disabled={isSaving || loading}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7: Create `utility-slot-config-form.tsx`**

```typescript
'use client'

import { useState, useEffect } from 'react'
import { Clock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SlotConfigFormProps {
  onRefresh: () => void
}

export function UtilitySlotConfigForm({ onRefresh }: SlotConfigFormProps) {
  const [morning, setMorning] = useState('05:30')
  const [evening, setEvening] = useState('17:30')
  const [night, setNight] = useState('22:30')
  const [loading, setLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        const res = await fetch('/api/utilities/slot-config')
        if (res.ok) {
          const d = await res.json()
          if (d.morningTime) setMorning(d.morningTime.slice(0, 5))
          if (d.eveningTime) setEvening(d.eveningTime.slice(0, 5))
          if (d.nightTime) setNight(d.nightTime.slice(0, 5))
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function handleSave() {
    setIsSaving(true)
    try {
      const res = await fetch('/api/utilities/slot-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ morningTime: morning, eveningTime: evening, nightTime: night }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Failed to save slot times')
      }
      toast.success('Slot times updated')
      onRefresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Clock className="size-4" />
          Electricity Reading Times (org-wide)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="slot-morning">Morning</Label>
            <Input id="slot-morning" type="time" className="w-32" value={morning}
              onChange={(e) => setMorning(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-evening">Evening</Label>
            <Input id="slot-evening" type="time" className="w-32" value={evening}
              onChange={(e) => setEvening(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slot-night">Night</Label>
            <Input id="slot-night" type="time" className="w-32" value={night}
              onChange={(e) => setNight(e.target.value)} disabled={loading} />
          </div>
          <Button onClick={handleSave} disabled={isSaving || loading}>
            {isSaving ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 8: Wire everything into `utilities-page-client.tsx`**

In `src/components/admin/utilities-page-client.tsx`:

(a) Add imports for the new components and lucide `Users` is not needed here:

```typescript
import { UtilityOccupancyForm } from '@/components/admin/utility-occupancy-form'
import { UtilityKpiBandsForm } from '@/components/admin/utility-kpi-bands-form'
import { UtilityWaterKpiForm } from '@/components/admin/utility-water-kpi-form'
import { UtilitySlotConfigForm } from '@/components/admin/utility-slot-config-form'
```

(b) Extend `SummaryData` with the new fields:

```typescript
  dailyRows: {
    date: string
    readingValue: number | null
    day: number | null
    peak: number | null
    offPeak: number | null
    total: number | null
    pending: boolean
    guestCount: number | null
    staffCount: number | null
    target: number | null
    achieved: boolean | null
  }[]
  kpi: { configured: boolean; pct: number | null; evaluatedDays: number; achievedDays: number }
```

(c) Add slot-times state + fetch (used by the reading form and only needs fetching once). After the `summary` state add:

```typescript
  const [slotTimes, setSlotTimes] = useState<{ morningTime: string; eveningTime: string; nightTime: string } | null>(null)

  useEffect(() => {
    fetch('/api/utilities/slot-config')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSlotTimes(d))
      .catch(() => {})
  }, [])
```

(d) Compute today's occupancy for the occupancy form's initial values from `summary.dailyRows` (find the row for today's date):

```typescript
  const todayStr = new Date().toISOString().split('T')[0]
  const todayRow = summary?.dailyRows?.find((r) => r.date === todayStr)
```

(e) In `tabContent`, pass the new props to `UtilitySummaryCards`:

```typescript
      <UtilitySummaryCards
        utilityType={utilityType}
        actualConsumption={pred?.actualConsumption ?? 0}
        actualCost={pred?.actualCost ?? 0}
        predictedConsumption={pred?.predictedConsumption ?? 0}
        predictedCost={pred?.predictedCost ?? 0}
        avgDailyConsumption={pred?.avgDailyConsumption ?? 0}
        daysElapsed={pred?.daysElapsed ?? 0}
        daysInMonth={pred?.daysInMonth ?? 30}
        tiersConfigured={summary?.tiersConfigured ?? false}
        kpiConfigured={summary?.kpi?.configured ?? false}
        kpiPct={summary?.kpi?.pct ?? null}
        kpiEvaluatedDays={summary?.kpi?.evaluatedDays ?? 0}
        loading={loading}
      />
```

(f) Replace the readings table + form grid block. Add the occupancy form above the grid and pass `dailyRows`/`utilityType` to the table and `slotTimes` to the form:

```typescript
      {/* Daily occupancy (shared once per day) */}
      <UtilityOccupancyForm
        propertyId={property.id}
        date={todayStr}
        initialGuests={todayRow?.guestCount ?? null}
        initialStaff={todayRow?.staffCount ?? null}
        onSuccess={fetchData}
      />

      {/* Readings Table + Entry Form */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UtilityReadingsTable
            readings={readings}
            dailyRows={summary?.dailyRows ?? []}
            utilityType={utilityType}
            onRefresh={fetchData}
          />
        </div>
        <div>
          <UtilityReadingForm
            propertyId={property.id}
            utilityType={utilityType}
            slotTimes={slotTimes ?? undefined}
            onSuccess={fetchData}
          />
        </div>
      </div>
```

(g) Replace the admin-only tier-form block with tier + KPI config (per utility) and the org slot config:

```typescript
      {/* Config (admin only) */}
      {isAdmin && (
        <div className="space-y-6">
          <UtilityTierForm
            propertyId={property.id}
            utilityType={utilityType}
            onRefresh={fetchData}
          />
          {utilityType === 'electricity' ? (
            <>
              <UtilityKpiBandsForm propertyId={property.id} onRefresh={fetchData} />
              <UtilitySlotConfigForm onRefresh={() => {
                fetch('/api/utilities/slot-config')
                  .then((r) => (r.ok ? r.json() : null))
                  .then((d) => d && setSlotTimes(d))
                  .catch(() => {})
              }} />
            </>
          ) : (
            <UtilityWaterKpiForm propertyId={property.id} onRefresh={fetchData} />
          )}
        </div>
      )}
```

- [ ] **Step 9: Verify TypeScript + lint**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npm run lint`
Expected: no new errors. Remove any now-unused imports the linter flags (e.g. old `ReadingEntry` consumption fields).

- [ ] **Step 10: Commit**

```bash
git add src/components/admin/ src/app/api/utilities/occupancy/route.ts
git commit -m "feat(utilities): management UI for ToU breakdown, occupancy, KPI bands & config"
```

---

## Task 8: Public reading form — slot + occupancy

**Files:**
- Modify: `src/components/utilities/public-reading-form.tsx`

**Interfaces:**
- Consumes: `/api/utilities/public` (Task 4 — accepts `slot`, `guestCount`, `staffCount`).

- [ ] **Step 1: Add slot + occupancy state and a Select import**

In `src/components/utilities/public-reading-form.tsx`:

(a) Add the Select import:

```typescript
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
```

(b) Add state after `readingDate`:

```typescript
  const [slot, setSlot] = useState<'morning' | 'evening' | 'night'>('morning')
  const [guestCount, setGuestCount] = useState('')
  const [staffCount, setStaffCount] = useState('')
```

- [ ] **Step 2: Render the slot selector (electricity) + occupancy fields**

In the form, after the Date field block, add the electricity slot selector:

```typescript
            {utilityType === 'electricity' && (
              <div className="space-y-2">
                <Label htmlFor="pub-slot">Reading Time</Label>
                <Select value={slot} onValueChange={(v) => setSlot(v as typeof slot)}>
                  <SelectTrigger id="pub-slot">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="morning">Morning</SelectItem>
                    <SelectItem value="evening">Evening</SelectItem>
                    <SelectItem value="night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
```

After the Note field block, add optional occupancy inputs:

```typescript
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="pub-guests">Guests (optional)</Label>
                <Input id="pub-guests" type="number" min="0" value={guestCount}
                  onChange={(e) => setGuestCount(e.target.value)} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pub-staff">Staff (optional)</Label>
                <Input id="pub-staff" type="number" min="0" value={staffCount}
                  onChange={(e) => setStaffCount(e.target.value)} placeholder="0" />
              </div>
            </div>
```

- [ ] **Step 3: Include the new fields in the POST body**

In `handleSubmit`, update the body to include slot + occupancy (omit occupancy keys when both blank):

```typescript
        body: JSON.stringify({
          propertyId: property.id,
          utilityType,
          readingDate,
          readingValue: value,
          slot,
          note: note || null,
          ...(guestCount !== '' ? { guestCount: parseInt(guestCount) || 0 } : {}),
          ...(staffCount !== '' ? { staffCount: parseInt(staffCount) || 0 } : {}),
        }),
```

Also reset `guestCount`/`staffCount` to `''` in the success branch alongside the other resets.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` (no errors), `npm run lint`.

```bash
git add src/components/utilities/public-reading-form.tsx
git commit -m "feat(utilities): public form gains electricity slot + occupancy entry"
```

---

## Task 9: Org overview dashboard KPI rollup

**Files:**
- Modify: `src/lib/db/queries/dashboard.ts` (add `getOrgUtilityKpiRollup`)
- Create: `src/components/dashboard/utility-kpi-rollup.tsx`
- Modify: `src/app/(portal)/dashboard/page.tsx`

**Interfaces:**
- Consumes: schema tables; `computeElectricityBreakdown`, `resolveBandTarget`, `computeKpiAchievement` (Task 2); `getProperties`.
- Produces: `getOrgUtilityKpiRollup(orgId, days?): Promise<PropertyKpiRollup[]>` where `PropertyKpiRollup = { propertyId: string; propertyName: string; electricityPct: number | null; waterPct: number | null }`.

- [ ] **Step 1: Add the rollup query**

Append to `src/lib/db/queries/dashboard.ts`. It reuses the per-property logic over a trailing window. Add the needed imports at the top of the file if missing (`utilityMeterReadings`, `dailyOccupancy`, `electricityKpiBands`, `utilityKpiTargets`, `properties` from `../schema`; `computeElectricityBreakdown, resolveBandTarget, computeKpiAchievement` from `../../utilities/calculations`; `gte`, `and`, `eq`, `asc` from `drizzle-orm`).

```typescript
export interface PropertyKpiRollup {
  propertyId: string
  propertyName: string
  electricityPct: number | null
  waterPct: number | null
}

/**
 * Per-property KPI-achievement % over a trailing window (default 30 days),
 * for both electricity (banded) and water (flat). Indeterminate days excluded.
 */
export async function getOrgUtilityKpiRollup(
  orgId: string,
  days: number = 30
): Promise<PropertyKpiRollup[]> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)
  const cutoff = cutoffDate.toISOString().split('T')[0]

  const props = await db
    .select({ id: properties.id, name: properties.name })
    .from(properties)
    .where(eq(properties.orgId, orgId))
    .orderBy(asc(properties.name))

  const rollup: PropertyKpiRollup[] = []

  for (const p of props) {
    const [readings, occupancy, bands, waterTarget] = await Promise.all([
      db.select().from(utilityMeterReadings)
        .where(and(
          eq(utilityMeterReadings.propertyId, p.id),
          gte(utilityMeterReadings.readingDate, cutoff)
        ))
        .orderBy(asc(utilityMeterReadings.readingDate)),
      db.select().from(dailyOccupancy)
        .where(and(
          eq(dailyOccupancy.propertyId, p.id),
          gte(dailyOccupancy.logDate, cutoff)
        )),
      db.select().from(electricityKpiBands)
        .where(eq(electricityKpiBands.propertyId, p.id))
        .orderBy(asc(electricityKpiBands.minGuests)),
      db.select().from(utilityKpiTargets)
        .where(and(
          eq(utilityKpiTargets.propertyId, p.id),
          eq(utilityKpiTargets.utilityType, 'water')
        )),
    ])

    const occByDate = new Map(occupancy.map((o) => [o.logDate, o]))

    // Electricity
    const elecReadings = readings.filter((r) => r.utilityType === 'electricity')
    const bandInputs = bands.map((b) => ({ minGuests: b.minGuests, targetUnits: parseFloat(b.targetUnits) }))
    const elecBreakdown = computeElectricityBreakdown(
      elecReadings.map((r) => ({
        date: r.readingDate,
        morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
        evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
        night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
      }))
    )
    const elecAch = bands.length > 0
      ? computeKpiAchievement(
          elecBreakdown.map((b) => ({
            total: b.total,
            target: resolveBandTarget(occByDate.get(b.date)?.guestCount ?? null, bandInputs),
          }))
        )
      : { pct: null, evaluatedDays: 0, achievedDays: 0 }

    // Water
    const waterReadings = readings.filter((r) => r.utilityType === 'water')
    const wTarget = waterTarget[0] ? parseFloat(waterTarget[0].dailyTargetUnits) : null
    const waterAch = wTarget !== null
      ? computeKpiAchievement(
          waterReadings.map((r, i) => {
            const prev = i > 0 ? waterReadings[i - 1] : null
            const total = prev ? parseFloat(r.readingValue) - parseFloat(prev.readingValue) : null
            return { total, target: wTarget }
          })
        )
      : { pct: null, evaluatedDays: 0, achievedDays: 0 }

    rollup.push({
      propertyId: p.id,
      propertyName: p.name,
      electricityPct: elecAch.pct,
      waterPct: waterAch.pct,
    })
  }

  return rollup
}
```

- [ ] **Step 2: Create the rollup component**

```typescript
import { Droplets, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PropertyKpiRollup } from '@/lib/db/queries/dashboard'

function pctColor(pct: number | null) {
  if (pct === null) return 'text-muted-foreground'
  if (pct >= 80) return 'text-emerald-600'
  if (pct >= 50) return 'text-amber-600'
  return 'text-red-600'
}

function pctLabel(pct: number | null) {
  return pct === null ? '—' : `${pct.toFixed(0)}%`
}

export function UtilityKpiRollup({ rollup }: { rollup: PropertyKpiRollup[] }) {
  if (rollup.length === 0) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Utility KPI Achievement (last 30 days)</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rollup.map((r) => (
            <div key={r.propertyId} className="rounded-lg border p-3">
              <p className="text-sm font-medium mb-2 truncate">
                {r.propertyName.replace('Taru Villas - ', '')}
              </p>
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Zap className="size-3.5" /> Electricity
                </span>
                <span className={`font-semibold tabular-nums ${pctColor(r.electricityPct)}`}>
                  {pctLabel(r.electricityPct)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Droplets className="size-3.5" /> Water
                </span>
                <span className={`font-semibold tabular-nums ${pctColor(r.waterPct)}`}>
                  {pctLabel(r.waterPct)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Render it on the dashboard page**

In `src/app/(portal)/dashboard/page.tsx`:

(a) Add imports:

```typescript
import { getOrgUtilityKpiRollup } from '@/lib/db/queries/dashboard'
import { UtilityKpiRollup } from '@/components/dashboard/utility-kpi-rollup'
```

(b) Add `getOrgUtilityKpiRollup(orgId)` to the existing `Promise.all` array and capture the result (e.g. add `, kpiRollup` to the destructured tuple and `getOrgUtilityKpiRollup(orgId)` as the last promise).

(c) Wrap the return so the rollup renders below the existing overview. Change the final `return (<DashboardOverview ... />)` to:

```typescript
  return (
    <div className="space-y-6">
      <DashboardOverview
        properties={propertyOverviews}
        stats={stats}
        trendData={trendData}
        trendLines={trendLines}
        surveyType={surveyType ?? 'internal'}
      />
      <div className="px-6 pb-6">
        <UtilityKpiRollup rollup={kpiRollup} />
      </div>
    </div>
  )
```

Note: confirm `DashboardOverview` doesn't already supply outer page padding that would double-up; if it renders its own full-page wrapper, place `<UtilityKpiRollup>` inside that layout instead. Inspect `src/components/dashboard/dashboard-overview.tsx` root element before finalizing the wrapper.

- [ ] **Step 4: Verify + commit**

Run: `npx tsc --noEmit` (no errors), `npm run lint`.

```bash
git add src/lib/db/queries/dashboard.ts src/components/dashboard/utility-kpi-rollup.tsx "src/app/(portal)/dashboard/page.tsx"
git commit -m "feat(dashboard): org-wide utility KPI achievement rollup"
```

---

## Task 10: Final verification

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (clear any unused imports flagged).

- [ ] **Step 3: Confirm migration applied**

Confirm the human operator has run `drizzle/0014_electricity_tou_occupancy_kpi.sql` in Supabase (Task 1 Step 6). If not yet applied, note it as the one remaining pre-deploy step. Production build on Coolify will fail at runtime queries otherwise, but the build itself (no DB at build) will pass.

- [ ] **Step 4: Manual smoke test (dev server)**

Run `npm run dev` and verify (or hand to the operator with this checklist):
1. `/properties/[id]/utilities` electricity tab: entry form shows a Reading Time selector; submit morning/evening/night readings for one date → table shows Day/Peak/Off-Peak, target column, and a KPI badge once the next day's morning exists.
2. Daily Occupancy block saves guests/staff; the electricity target column reflects the guest band.
3. Admin sees "Electricity KPI Bands", "Reading Times", and (water tab) "Water KPI" config cards; non-admins do not.
4. Summary cards show "KPI Achieved X%".
5. `/u/[slug]` public page: electricity slot selector + optional guest/staff fields submit successfully.
6. `/dashboard` shows the "Utility KPI Achievement" rollup.

- [ ] **Step 5: Update memory + finish**

Per the project's session-handover convention, after merge add a MEMORY.md pointer for this feature. Then use the `superpowers:finishing-a-development-branch` skill to decide merge/PR. (Deploy = push to `main` per MEMORY; the migration must be applied in Supabase first.)

---

## Self-Review Notes

- **Spec coverage:** ToU columns (T1), occupancy table (T1), KPI bands + water target + slot config tables (T1), pure breakdown/band/achievement math (T2), slot-aware upsert + all CRUD (T3), reading/public entry slot+occupancy (T4, T8), config routes (T5), summary KPI/rows (T6), management UI incl. configurable band table + occupancy + breakdown columns + KPI card + slot config (T7), org rollup (T9). All spec sections mapped.
- **Type consistency:** `dailyRows`/`EnrichedDayRow` shape defined in T6 is reproduced verbatim in T7 (page client `SummaryData`) and T7's table `DailyRow`; `PropertyKpiRollup` defined in T9 query and imported by its component. `upsertReading` slot union (`'morning'|'evening'|'night'`) consistent across T3/T4/T7/T8. `KpiBandInput`/`SlotRow` from T2 used in T6 and T9.
- **Known follow-ups (not blockers):** org rollup is intentionally N+1 over ~10 properties (matches existing dashboard patterns); the dead `409 unique` branch in the readings route is left harmless; verify `getProfile().orgId` field name (T5 Step 3) and `DashboardOverview` root padding (T9 Step 3) during implementation.
