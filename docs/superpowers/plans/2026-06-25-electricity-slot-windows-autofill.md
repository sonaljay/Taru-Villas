# Electricity Slot Windows, Missed-Entry Auto-Fill & Penalty — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce a ±15-min (IST) entry window per electricity slot; auto-fill missed slots from the 30-day rolling bucket average via a cron job and penalise the day (KPI "missed"); move occupancy entry into the reading form; and make all KPI numbers admin-only.

**Architecture:** Per-slot provenance columns (`morning_status`/`evening_status`/`night_status` ∈ manual|autofilled|edited) on `utility_meter_readings` drive the penalty. A pure `slot-windows.ts` helper decides which slot window is open for a given IST minute; entry routes enforce it. A cron route synthesizes missed readings from the previous slot + the 30-day average of the bucket starting at that slot. The summary route forces "missed" days to KPI-fail and strips KPI fields for non-admins.

**Tech Stack:** Next.js 16 App Router (RSC + `'use client'`), Drizzle ORM + postgres.js, Zod v4, shadcn/ui, lucide-react, Sonner. Spec: `docs/superpowers/specs/2026-06-25-electricity-slot-windows-autofill-design.md`.

## Global Constraints

- **DB connection:** never touch `prepare: false` in `src/lib/db/index.ts`.
- **No new npm packages.** The project has **no test framework** — verify with careful inspection; for pure logic use a throwaway Node script in the scratchpad. NEVER add Vitest/Jest.
- **`npx tsc --noEmit`, `npm run build`, `npm run lint` HANG/fail on the dev Mac (Node 26)** — do NOT run them; the Linux/Coolify build is the authoritative type-check. Type-correctness of edits still matters.
- **Migrations are hand-written SQL** applied manually via Supabase (drizzle-kit is broken). Use `IF NOT EXISTS` / guarded `CREATE TYPE`, `--> statement-breakpoint`.
- **Zod v4** imported `from 'zod'`. **Drizzle numeric columns are strings.** All mutations use `.returning()`. Route params awaited. Data pages keep `export const dynamic = 'force-dynamic'`.
- **Auth:** pages use `requireAuth`/`requireRole`; API routes use `getProfile`; config + KPI-read routes are admin-only (`profile.role !== 'admin'` → 403); the cron route uses Bearer `CRON_SECRET` (no Supabase auth).
- **Timezone:** all window math is in **IST (Asia/Kolkata)**. Window = slot_time ± **15 min** (fixed constant `WINDOW_HALF_MIN = 15`).
- **Slot semantics (existing):** `reading_value` = morning (nullable), `evening_reading`, `night_reading`. Buckets: Day = evening−morning, Peak = night−evening, Off-Peak = next-morning − night.
- **Penalty rule:** a day is **missed** (KPI auto-fail, counts in denominator) iff any slot status is `autofilled`; **edited (late)** iff any slot is `edited` and none `autofilled`; else normal.
- **KPI visibility:** fully admin-only — non-admins never receive targets, achievement, or penalty state from the API.

---

## File Structure

**Created:**
- `drizzle/0015_electricity_slot_status.sql` — enum + 3 status columns
- `src/lib/utilities/slot-windows.ts` — pure window helpers + IST clock wrapper
- `src/app/api/cron/electricity-autofill/route.ts` — auto-fill cron

**Modified:**
- `src/lib/db/schema.ts` — `readingSlotStatusEnum` + 3 columns + types
- `src/lib/utilities/calculations.ts` — `dayPenaltyState`, extend `computeKpiAchievement` with a `missed` flag
- `src/lib/db/queries/utilities.ts` — `upsertReading` gains `status` + nullable value; add `getReadingsSince`, `getPropertiesWithOrg` (or reuse), `getActiveOrgSlotConfigMap`
- `src/app/api/utilities/readings/route.ts` — window enforcement + status
- `src/app/api/utilities/public/route.ts` — window enforcement + status
- `src/app/api/utilities/summary/route.ts` — penalty + admin-strip
- `src/lib/db/queries/dashboard.ts` — rollup honours penalty
- `src/app/api/utilities/kpi-bands/route.ts` & `kpis/route.ts` — GET becomes admin-only
- `src/middleware.ts` — allow the cron route (Bearer)
- `src/components/admin/utility-reading-form.tsx` — occupancy fields + window-aware slot UI
- `src/components/utilities/public-reading-form.tsx` — window-aware slot UI (occupancy already present)
- `src/components/admin/utilities-page-client.tsx` — remove occupancy card; admin-gate KPI columns/cards; pass `isAdmin`/occupancy into reading form
- `src/components/admin/utility-readings-table.tsx` — status badges; admin-gate target/KPI columns
- `src/components/admin/utility-summary-cards.tsx` — (no change unless KPI card already gated by props; gating done in page client)

**Deleted:**
- `src/components/admin/utility-occupancy-form.tsx` and `src/app/api/utilities/occupancy/route.ts` (occupancy now in the reading form; remove if nothing else references them)

---

## Task 1: Schema + migration (slot status)

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0015_electricity_slot_status.sql`

**Interfaces:**
- Produces: `readingSlotStatusEnum`; `utilityMeterReadings.morningStatus/eveningStatus/nightStatus` (`'manual'|'autofilled'|'edited'|null`).

- [ ] **Step 1: Add the enum**

In `src/lib/db/schema.ts`, after the `utilityTypeEnum` line (~line 62) add:

```typescript
export const readingSlotStatusEnum = pgEnum('reading_slot_status', ['manual', 'autofilled', 'edited'])
```

- [ ] **Step 2: Add the three status columns**

In the `utilityMeterReadings` table, immediately after the `nightReading` column, add:

```typescript
    morningStatus: readingSlotStatusEnum('morning_status'),
    eveningStatus: readingSlotStatusEnum('evening_status'),
    nightStatus: readingSlotStatusEnum('night_status'),
```

- [ ] **Step 3: Write the migration**

Create `drizzle/0015_electricity_slot_status.sql`:

```sql
DO $$ BEGIN
  CREATE TYPE "reading_slot_status" AS ENUM ('manual', 'autofilled', 'edited');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "morning_status" "reading_slot_status";--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "evening_status" "reading_slot_status";--> statement-breakpoint
ALTER TABLE "utility_meter_readings" ADD COLUMN IF NOT EXISTS "night_status" "reading_slot_status";
```

- [ ] **Step 4: Apply in Supabase (manual)**

Operator step: paste Step 3 SQL into Supabase → SQL Editor → Run. If headless, note it pending and continue (TS compiles regardless).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0015_electricity_slot_status.sql
git commit -m "feat(utilities): per-slot reading status (manual/autofilled/edited)"
```

---

## Task 2: Pure helpers (windows + penalty)

**Files:**
- Create: `src/lib/utilities/slot-windows.ts`
- Modify: `src/lib/utilities/calculations.ts`

**Interfaces:**
- Produces:
  - `WINDOW_HALF_MIN = 15`
  - `type Slot = 'morning' | 'evening' | 'night'`
  - `type SlotTimes = { morningTime: string; eveningTime: string; nightTime: string }` (each `'HH:MM'` or `'HH:MM:SS'`)
  - `parseSlotMinutes(slotTimes): { morning: number; evening: number; night: number }` (minutes since IST midnight)
  - `currentISTMinutes(now?: Date): number` (impure clock wrapper)
  - `openSlot(nowMin: number, slotTimes: SlotTimes): Slot | null` (which window is open)
  - `isSlotOpen(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean`
  - `slotWindowLabel(slot: Slot, slotTimes: SlotTimes): string` (e.g. `"17:15–17:45"`)
  - `windowClosedToday(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean` (now is past slot+15)
  - In calculations.ts: `dayPenaltyState(statuses): 'missed'|'edited'|'normal'`; extended `computeKpiAchievement(days: { total; target; missed? }[])`.

- [ ] **Step 1: Create `slot-windows.ts`**

```typescript
export const WINDOW_HALF_MIN = 15

export type Slot = 'morning' | 'evening' | 'night'

export interface SlotTimes {
  morningTime: string // 'HH:MM' or 'HH:MM:SS'
  eveningTime: string
  nightTime: string
}

/** Minutes since midnight for an 'HH:MM[:SS]' string. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return parseInt(h, 10) * 60 + parseInt(m, 10)
}

export function parseSlotMinutes(slotTimes: SlotTimes): Record<Slot, number> {
  return {
    morning: toMinutes(slotTimes.morningTime),
    evening: toMinutes(slotTimes.eveningTime),
    night: toMinutes(slotTimes.nightTime),
  }
}

/** Current minute-of-day in IST (Asia/Kolkata). Impure (reads the clock). */
export function currentISTMinutes(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const h = parseInt(parts.find((p) => p.type === 'hour')!.value, 10)
  const m = parseInt(parts.find((p) => p.type === 'minute')!.value, 10)
  // Intl can yield '24' for midnight in some engines; normalise.
  return ((h % 24) * 60 + m)
}

/** Current IST calendar date as 'YYYY-MM-DD'. Impure. */
export function currentISTDate(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const y = parts.find((p) => p.type === 'year')!.value
  const mo = parts.find((p) => p.type === 'month')!.value
  const d = parts.find((p) => p.type === 'day')!.value
  return `${y}-${mo}-${d}`
}

/** Circular distance between two minute-of-day values (handles midnight wrap). */
function circularDelta(a: number, b: number): number {
  const raw = Math.abs(a - b)
  return Math.min(raw, 1440 - raw)
}

export function isSlotOpen(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean {
  const mins = parseSlotMinutes(slotTimes)
  return circularDelta(nowMin, mins[slot]) <= WINDOW_HALF_MIN
}

/** The single slot whose ±15 window currently contains nowMin, or null. */
export function openSlot(nowMin: number, slotTimes: SlotTimes): Slot | null {
  const slots: Slot[] = ['morning', 'evening', 'night']
  let best: Slot | null = null
  let bestDelta = WINDOW_HALF_MIN + 1
  const mins = parseSlotMinutes(slotTimes)
  for (const s of slots) {
    const d = circularDelta(nowMin, mins[s])
    if (d <= WINDOW_HALF_MIN && d < bestDelta) {
      best = s
      bestDelta = d
    }
  }
  return best
}

/** True when the slot's window has already closed earlier today (no wrap). */
export function windowClosedToday(slot: Slot, nowMin: number, slotTimes: SlotTimes): boolean {
  const mins = parseSlotMinutes(slotTimes)
  return nowMin > mins[slot] + WINDOW_HALF_MIN
}

function fmt(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function slotWindowLabel(slot: Slot, slotTimes: SlotTimes): string {
  const center = parseSlotMinutes(slotTimes)[slot]
  return `${fmt(center - WINDOW_HALF_MIN)}–${fmt(center + WINDOW_HALF_MIN)}`
}
```

- [ ] **Step 2: Add penalty helper + extend achievement in `calculations.ts`**

Append to `src/lib/utilities/calculations.ts`:

```typescript
export type SlotStatus = 'manual' | 'autofilled' | 'edited' | null

/**
 * Day-level penalty state derived from the three slot statuses.
 * 'missed' if ANY slot was auto-filled; else 'edited' if any was an admin late
 * edit; else 'normal'.
 */
export function dayPenaltyState(statuses: {
  morning: SlotStatus
  evening: SlotStatus
  night: SlotStatus
}): 'missed' | 'edited' | 'normal' {
  const vals = [statuses.morning, statuses.evening, statuses.night]
  if (vals.includes('autofilled')) return 'missed'
  if (vals.includes('edited')) return 'edited'
  return 'normal'
}
```

Then REPLACE `computeKpiAchievement` with a version that accepts an optional per-day `missed` flag (a missed day counts as evaluated-and-failed even if total/target are otherwise indeterminate):

```typescript
/**
 * Compute KPI achievement over a set of days.
 * - A day with `missed: true` is forced to count as evaluated AND not-achieved
 *   (the missed-entry penalty), regardless of total/target.
 * - Otherwise a day is evaluated only when both total and target are non-null;
 *   achieved when total <= target.
 * Returns a null pct when no days are evaluable.
 */
export function computeKpiAchievement(
  days: { total: number | null; target: number | null; missed?: boolean }[]
): { evaluatedDays: number; achievedDays: number; pct: number | null } {
  let evaluated = 0
  let achieved = 0
  for (const d of days) {
    if (d.missed) {
      evaluated++ // counts, never achieved
      continue
    }
    if (d.total !== null && d.target !== null) {
      evaluated++
      if (d.total <= d.target) achieved++
    }
  }
  return {
    evaluatedDays: evaluated,
    achievedDays: achieved,
    pct: evaluated > 0 ? (achieved / evaluated) * 100 : null,
  }
}
```

- [ ] **Step 3: Verify with a throwaway Node script**

Create `<scratchpad>/check-windows.mjs` (scratchpad dir: `/private/tmp/claude-501/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/680f68bb-e9b0-413a-a546-b0bf5f0a0b40/scratchpad/check-windows.mjs`). Paste the pure functions from Step 1 (strip `export` and TS types) plus `dayPenaltyState` and the new `computeKpiAchievement`, then:

```javascript
const st = { morningTime: '05:30', eveningTime: '17:30', nightTime: '22:30' }
console.assert(openSlot(17 * 60 + 30, st) === 'evening', 'evening open at 17:30')
console.assert(openSlot(17 * 60 + 44, st) === 'evening', 'evening open at 17:44')
console.assert(openSlot(17 * 60 + 46, st) === null, 'closed at 17:46')
console.assert(isSlotOpen('morning', 5 * 60 + 20, st) === true, 'morning 05:20 open')
console.assert(windowClosedToday('morning', 9 * 60, st) === true, 'morning closed by 09:00')
console.assert(windowClosedToday('night', 20 * 60, st) === false, 'night not closed at 20:00')
console.assert(slotWindowLabel('evening', st) === '17:15–17:45', 'label')

console.assert(dayPenaltyState({ morning: 'manual', evening: 'autofilled', night: 'manual' }) === 'missed', 'missed')
console.assert(dayPenaltyState({ morning: 'manual', evening: 'edited', night: 'manual' }) === 'edited', 'edited')
console.assert(dayPenaltyState({ morning: 'manual', evening: 'manual', night: null }) === 'normal', 'normal')

const ach = computeKpiAchievement([
  { total: 200, target: 224 },                 // achieved
  { total: 250, target: 224 },                 // fail
  { total: null, target: null, missed: true }, // missed -> evaluated+fail
  { total: 100, target: null },                // indeterminate -> excluded
])
console.assert(ach.evaluatedDays === 3, 'evaluated=3 ' + ach.evaluatedDays)
console.assert(ach.achievedDays === 1, 'achieved=1 ' + ach.achievedDays)
console.assert(Math.round(ach.pct) === 33, 'pct~33 ' + ach.pct)
console.log('ALL WINDOW/PENALTY ASSERTIONS PASSED')
```

Run: `node "<that path>"` → expect `ALL WINDOW/PENALTY ASSERTIONS PASSED`, no `Assertion failed`. Delete the script after.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utilities/slot-windows.ts src/lib/utilities/calculations.ts
git commit -m "feat(utilities): slot-window helpers + penalty-aware KPI achievement"
```

---

## Task 3: Query layer (status-aware upsert + cron data)

**Files:**
- Modify: `src/lib/db/queries/utilities.ts`

**Interfaces:**
- Consumes: schema (Task 1), `Slot` type (Task 2).
- Produces:
  - `upsertReading(data)` now accepts `status?: 'manual'|'autofilled'|'edited'` and `readingValue: string | null`; sets `<slot>_status` on insert and conflict.
  - `getReadingsSince(propertyId, sinceDate: string): Promise<UtilityMeterReading[]>` (ascending, electricity only).
  - `getAllPropertiesWithOrg(): Promise<{ id: string; orgId: string }[]>`
  - `getSlotConfig(orgId)` already exists (returns defaults).

- [ ] **Step 1: Extend `upsertReading`**

In `src/lib/db/queries/utilities.ts`, change the `upsertReading` signature + body so `readingValue` is `string | null` and a `status` is written to the slot's status column. Replace the existing function with:

```typescript
export async function upsertReading(data: {
  propertyId: string
  utilityType: 'water' | 'electricity'
  readingDate: string
  readingValue: string | null
  slot: 'morning' | 'evening' | 'night'
  status?: 'manual' | 'autofilled' | 'edited'
  note?: string | null
  recordedBy?: string | null
}) {
  const valueColumn =
    data.slot === 'morning' ? 'readingValue' : data.slot === 'evening' ? 'eveningReading' : 'nightReading'
  const statusColumn =
    data.slot === 'morning' ? 'morningStatus' : data.slot === 'evening' ? 'eveningStatus' : 'nightStatus'
  const status = data.status ?? 'manual'

  const insertValues = {
    propertyId: data.propertyId,
    utilityType: data.utilityType,
    readingDate: data.readingDate,
    readingValue: data.slot === 'morning' ? data.readingValue : null,
    eveningReading: data.slot === 'evening' ? data.readingValue : null,
    nightReading: data.slot === 'night' ? data.readingValue : null,
    morningStatus: data.slot === 'morning' ? status : null,
    eveningStatus: data.slot === 'evening' ? status : null,
    nightStatus: data.slot === 'night' ? status : null,
    note: data.note ?? null,
    recordedBy: data.recordedBy ?? null,
  }

  const setOnConflict: Record<string, unknown> = {
    [valueColumn]: data.readingValue,
    [statusColumn]: status,
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

- [ ] **Step 2: Add cron data queries**

Append to the Meter Readings section of `utilities.ts`:

```typescript
/** Electricity readings for a property on/after a date, ascending. */
export async function getReadingsSince(propertyId: string, sinceDate: string) {
  return db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, 'electricity'),
        gte(utilityMeterReadings.readingDate, sinceDate)
      )
    )
    .orderBy(asc(utilityMeterReadings.readingDate))
}

/** All properties with their org id (for the autofill cron sweep). */
export async function getAllPropertiesWithOrg() {
  return db
    .select({ id: properties.id, orgId: properties.orgId })
    .from(properties)
}
```

Add `properties` to the schema import at the top of the file if not already imported (it is used elsewhere — verify the import list includes `properties`; add it if missing).

- [ ] **Step 3: Self-review**

Confirm: `upsertReading` writes the right status column per slot on BOTH insert and conflict; `readingValue: string | null` doesn't break existing callers (the two entry routes pass `String(value)` — still a string; the cron will pass null for the no-history case); `getReadingsSince` filters electricity; `getAllPropertiesWithOrg` selects `orgId`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/utilities.ts
git commit -m "feat(utilities): status-aware upsertReading + cron data queries"
```

---

## Task 4: Window enforcement in entry routes

**Files:**
- Modify: `src/app/api/utilities/readings/route.ts`
- Modify: `src/app/api/utilities/public/route.ts`

**Interfaces:**
- Consumes: `getSlotConfig` (utilities queries), `currentISTMinutes`, `isSlotOpen`, `slotWindowLabel`, `windowClosedToday`, `Slot` (slot-windows).
- The reading is stored with `status: 'manual'` (in window) or `'edited'` (admin, out of window); non-admin/public out-of-window electricity entry is rejected `422`.

- [ ] **Step 1: `readings/route.ts` — enforce window + set status**

Add imports:

```typescript
import { getSlotConfig } from '@/lib/db/queries/utilities'
import { currentISTMinutes, isSlotOpen, slotWindowLabel } from '@/lib/utilities/slot-windows'
```

In the POST handler, AFTER `const slot = ...` is computed and BEFORE the cumulative-order check, insert window enforcement for electricity:

```typescript
    // Electricity slot entry window (±15 min IST). Admins may backfill outside it.
    let status: 'manual' | 'edited' = 'manual'
    if (parsed.data.utilityType === 'electricity') {
      const slotTimes = await getSlotConfig(profile.orgId)
      const nowMin = currentISTMinutes()
      if (!isSlotOpen(slot, nowMin, slotTimes)) {
        if (profile.role !== 'admin') {
          return NextResponse.json(
            {
              error: `The ${slot} reading window (${slotWindowLabel(slot, slotTimes)} IST) is closed.`,
            },
            { status: 422 }
          )
        }
        status = 'edited' // admin backfill outside the window
      }
    }
```

Then pass `status` to `upsertReading`:

```typescript
    const reading = await upsertReading({
      propertyId: parsed.data.propertyId,
      utilityType: parsed.data.utilityType,
      readingDate: parsed.data.readingDate,
      readingValue: String(parsed.data.readingValue),
      slot,
      status,
      note: parsed.data.note ?? null,
      recordedBy: profile.id,
    })
```

(Water always gets `status` defaulting to `'manual'` — `slot` is `'morning'` and the `if (electricity)` block is skipped, leaving `status = 'manual'`.)

- [ ] **Step 2: `public/route.ts` — enforce window (no admin path)**

The public route has no authenticated profile (it's anonymous), so it needs the org id another way. The public form posts `propertyId`; derive the org from the property. Add a query usage: import `getPropertyById` from `@/lib/db/queries/properties` (verify it returns `orgId`) and `getSlotConfig`, plus the slot-window helpers.

Add imports:

```typescript
import { getSlotConfig } from '@/lib/db/queries/utilities'
import { getPropertyById } from '@/lib/db/queries/properties'
import { currentISTMinutes, isSlotOpen, slotWindowLabel } from '@/lib/utilities/slot-windows'
```

After the `slot` is derived (mirror the readings route's slot-default logic; add it if the public route doesn't already compute `slot` — it should, from Task 8 of the prior feature: `const slot = parsed.data.utilityType === 'electricity' ? parsed.data.slot ?? 'morning' : 'morning'`), enforce the window (public users are never admin → always reject out of window):

```typescript
    if (parsed.data.utilityType === 'electricity') {
      const property = await getPropertyById(parsed.data.propertyId)
      if (!property) {
        return NextResponse.json({ error: 'Property not found' }, { status: 404 })
      }
      const slotTimes = await getSlotConfig(property.orgId)
      const nowMin = currentISTMinutes()
      if (!isSlotOpen(slot, nowMin, slotTimes)) {
        return NextResponse.json(
          { error: `The ${slot} reading window (${slotWindowLabel(slot, slotTimes)} IST) is closed.` },
          { status: 422 }
        )
      }
    }
```

Pass `status: 'manual'` explicitly to the public `upsertReading` call (public entries are always in-window manual; `recordedBy: null` stays).

- [ ] **Step 3: Self-review**

Confirm: water entry is never window-blocked; admin out-of-window electricity → `status='edited'`, not rejected; non-admin/public out-of-window electricity → 422 with the window label; `getPropertyById` returns `orgId` (verify the field; if its select doesn't include orgId, use `getSlotConfig` with the property's org via an existing query). The cumulative-order check still runs after enforcement.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/utilities/readings/route.ts src/app/api/utilities/public/route.ts
git commit -m "feat(utilities): enforce ±15min electricity slot entry window (admin backfill = edited)"
```

---

## Task 5: Auto-fill cron route

**Files:**
- Create: `src/app/api/cron/electricity-autofill/route.ts`
- Modify: `src/middleware.ts`

**Interfaces:**
- Consumes: `getAllPropertiesWithOrg`, `getSlotConfig`, `getReadingsSince`, `upsertReading` (utilities); `computeElectricityBreakdown` (calculations); `currentISTMinutes`, `currentISTDate`, `windowClosedToday`, `parseSlotMinutes`, `Slot` (slot-windows).

- [ ] **Step 1: Add the cron route to middleware**

In `src/middleware.ts`, add to the `isPublicRoute` chain (after the `extract-reading` line):

```typescript
    request.nextUrl.pathname.startsWith('/api/utilities/extract-reading') ||
    request.nextUrl.pathname.startsWith('/api/cron/')
```

- [ ] **Step 2: Create the cron route**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import {
  getAllPropertiesWithOrg,
  getSlotConfig,
  getReadingsSince,
  upsertReading,
} from '@/lib/db/queries/utilities'
import { computeElectricityBreakdown, type SlotRow } from '@/lib/utilities/calculations'
import {
  currentISTMinutes,
  currentISTDate,
  windowClosedToday,
  type Slot,
} from '@/lib/utilities/slot-windows'

export const dynamic = 'force-dynamic'

const SLOTS: Slot[] = ['morning', 'evening', 'night']

function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

async function run() {
  const nowMin = currentISTMinutes()
  const today = currentISTDate()
  // Trailing window: 31 days back so each day has its predecessor for off-peak.
  const since = new Date(`${today}T00:00:00Z`)
  since.setUTCDate(since.getUTCDate() - 31)
  const sinceDate = since.toISOString().split('T')[0]

  const properties = await getAllPropertiesWithOrg()
  let filled = 0
  const details: { propertyId: string; slot: Slot; value: number | null }[] = []

  for (const prop of properties) {
    const slotTimes = await getSlotConfig(prop.orgId)
    const closedSlots = SLOTS.filter((s) => windowClosedToday(s, nowMin, slotTimes))
    if (closedSlots.length === 0) continue

    const readings = await getReadingsSince(prop.id, sinceDate)
    const byDate = new Map(readings.map((r) => [r.readingDate, r]))
    const todayRow = byDate.get(today)

    // 30-day bucket averages, excluding any day with an autofilled slot.
    const slotRows: SlotRow[] = readings.map((r) => ({
      date: r.readingDate,
      morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
      night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
    }))
    const statusByDate = new Map(
      readings.map((r) => [r.readingDate, [r.morningStatus, r.eveningStatus, r.nightStatus]])
    )
    const breakdown = computeElectricityBreakdown(slotRows)
    const avg = (pick: (b: (typeof breakdown)[number]) => number | null): number | null => {
      const vals: number[] = []
      for (const b of breakdown) {
        if (b.date === today) continue
        const statuses = statusByDate.get(b.date) ?? []
        if (statuses.includes('autofilled')) continue // don't average synthesized days
        const v = pick(b)
        if (v !== null) vals.push(v)
      }
      return vals.length > 0 ? vals.reduce((s, x) => s + x, 0) / vals.length : null
    }
    const avgDay = avg((b) => b.day)
    const avgPeak = avg((b) => b.peak)
    const avgOffPeak = avg((b) => b.offPeak)

    // Yesterday (IST) for the morning predecessor.
    const yDate = new Date(`${today}T00:00:00Z`)
    yDate.setUTCDate(yDate.getUTCDate() - 1)
    const yesterday = byDate.get(yDate.toISOString().split('T')[0])

    for (const slot of closedSlots) {
      const statuses = statusByDate.get(today) ?? [null, null, null]
      const idx = slot === 'morning' ? 0 : slot === 'evening' ? 1 : 2
      const existing = idx === 0 ? todayRow?.readingValue : idx === 1 ? todayRow?.eveningReading : todayRow?.nightReading
      if (existing !== null && existing !== undefined) continue // already entered
      if (statuses[idx] !== null) continue // already processed (autofilled/edited)

      // Predecessor reading + that slot's bucket average.
      let predecessor: number | null = null
      let bucketAvg: number | null = null
      if (slot === 'morning') {
        predecessor = yesterday?.nightReading != null ? parseFloat(yesterday.nightReading) : null
        bucketAvg = avgOffPeak
      } else if (slot === 'evening') {
        predecessor = todayRow?.readingValue != null ? parseFloat(todayRow.readingValue) : null
        bucketAvg = avgDay
      } else {
        predecessor = todayRow?.eveningReading != null ? parseFloat(todayRow.eveningReading) : null
        bucketAvg = avgPeak
      }

      const value =
        predecessor !== null && bucketAvg !== null ? predecessor + bucketAvg : null

      await upsertReading({
        propertyId: prop.id,
        utilityType: 'electricity',
        readingDate: today,
        readingValue: value !== null ? String(value) : null,
        slot,
        status: 'autofilled',
        recordedBy: null,
      })
      filled++
      details.push({ propertyId: prop.id, slot, value })
    }
  }

  return { filled, details }
}

export async function POST(request: NextRequest) {
  if (!bearerOk(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await run()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('POST /api/cron/electricity-autofill error:', error)
    return NextResponse.json({ error: 'Auto-fill failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
```

- [ ] **Step 3: Self-review**

Confirm: Bearer check rejects when `CRON_SECRET` unset or mismatched; the average excludes today and autofilled days; the synthesized value uses the correct predecessor per slot; a slot already entered (non-null value) or already statused is skipped (idempotent); null value is written with `status='autofilled'` (penalty still applies); the route is in `force-dynamic`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/electricity-autofill/route.ts src/middleware.ts
git commit -m "feat(utilities): electricity missed-slot auto-fill cron (30-day bucket average)"
```

---

## Task 6: Summary route + rollup — penalty & admin-strip

**Files:**
- Modify: `src/app/api/utilities/summary/route.ts`
- Modify: `src/lib/db/queries/dashboard.ts`

**Interfaces:**
- Consumes: `dayPenaltyState`, extended `computeKpiAchievement` (Task 2); reading rows now carry `morningStatus/eveningStatus/nightStatus`.
- Produces: `dailyRows[].penalty: 'missed'|'edited'|'normal'`; non-admin responses omit `target`/`achieved`/`penalty`/`kpi`.

- [ ] **Step 1: summary route — import + electricity penalty**

Add to imports in `src/app/api/utilities/summary/route.ts`:

```typescript
import {
  predictMonthlyBill,
  calculateDailyConsumption,
  computeElectricityBreakdown,
  resolveBandTarget,
  computeKpiAchievement,
  dayPenaltyState,
  type TierInput,
  type SlotRow,
} from '@/lib/utilities/calculations'
```

Extend the inline `EnrichedDayRow` type with `penalty`:

```typescript
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
      penalty: 'missed' | 'edited' | 'normal'
    }
```

In the ELECTRICITY branch, compute the penalty per day and force-fail missed days. Replace the electricity `dailyRows = breakdown.map(...)` block with:

```typescript
      dailyRows = breakdown.map((b, i) => {
        const occ = occByDate.get(b.date)
        const guestCount = occ ? occ.guestCount : null
        const target = resolveBandTarget(guestCount, bandInputs)
        const r = monthReadings[i]
        const penalty = dayPenaltyState({
          morning: r.morningStatus,
          evening: r.eveningStatus,
          night: r.nightStatus,
        })
        const achieved =
          penalty === 'missed'
            ? false
            : b.total !== null && target !== null
              ? b.total <= target
              : null
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
          achieved,
          penalty,
        }
      })
```

In the WATER branch, add `penalty: 'normal'` to each returned row (water has no slot windows/penalty).

- [ ] **Step 2: summary route — penalty-aware achievement + admin strip**

Replace the achievement computation:

```typescript
    const achievement = computeKpiAchievement(
      dailyRows.map((r) => ({ total: r.total, target: r.target, missed: r.penalty === 'missed' }))
    )
```

Then, just before `return NextResponse.json({...})`, strip KPI fields for non-admins:

```typescript
    const isAdmin = profile.role === 'admin'
    const safeDailyRows = isAdmin
      ? dailyRows
      : dailyRows.map((r) => ({ ...r, target: null, achieved: null, penalty: 'normal' as const }))
```

Use `safeDailyRows` in the response, and gate the `kpi` object:

```typescript
      dailyRows: safeDailyRows,
      kpi: isAdmin
        ? { configured: kpiConfigured, pct: achievement.pct, evaluatedDays: achievement.evaluatedDays, achievedDays: achievement.achievedDays }
        : { configured: false, pct: null, evaluatedDays: 0, achievedDays: 0 },
```

(`profile` is already fetched at the top of the handler via `getProfile()`.)

- [ ] **Step 3: dashboard rollup — honour penalty**

In `src/lib/db/queries/dashboard.ts` `getOrgUtilityKpiRollup`, the electricity achievement currently maps breakdown→`{total, target}`. Add the penalty so missed days fail. Import `dayPenaltyState` (add to the calculations import). In the electricity block, replace the `computeKpiAchievement(elecBreakdown.map(...))` argument with a version that joins status:

```typescript
    const statusByDate = new Map(
      elecReadings.map((r) => [r.readingDate, { morning: r.morningStatus, evening: r.eveningStatus, night: r.nightStatus }])
    )
    const elecAch = bands.length > 0
      ? computeKpiAchievement(
          elecBreakdown.map((b) => {
            const s = statusByDate.get(b.date)
            const penalty = s ? dayPenaltyState(s) : 'normal'
            return {
              total: b.total,
              target: resolveBandTarget(occByDate.get(b.date)?.guestCount ?? null, bandInputs),
              missed: penalty === 'missed',
            }
          })
        )
      : { pct: null, evaluatedDays: 0, achievedDays: 0 }
```

(`elecReadings` is the electricity-filtered readings already present in that function; confirm the variable name and that its rows include the status columns — they do via `select()`.)

- [ ] **Step 4: Self-review**

Confirm: missed electricity days force `achieved=false` AND count via `missed:true` into the achievement denominator; non-admin summary responses carry no real target/achieved/penalty/kpi; water rows get `penalty:'normal'`; the rollup honours the penalty.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/utilities/summary/route.ts src/lib/db/queries/dashboard.ts
git commit -m "feat(utilities): missed-entry KPI penalty + admin-only KPI numbers in summary/rollup"
```

---

## Task 7: Reading forms — occupancy inline + window-aware slot UI

**Files:**
- Modify: `src/components/admin/utility-reading-form.tsx`
- Modify: `src/components/utilities/public-reading-form.tsx`

**Interfaces:**
- Consumes: `/api/utilities/slot-config` (GET), `currentISTMinutes`/`openSlot`/`isSlotOpen`/`slotWindowLabel` (slot-windows), the reading POST (sends `slot`, `guestCount`, `staffCount`).

- [ ] **Step 1: `utility-reading-form.tsx` — add occupancy fields**

Add `Users` to the lucide import. Add props for initial occupancy + admin flag to `ReadingFormProps`:

```typescript
  isAdmin?: boolean
  initialGuests?: number | null
  initialStaff?: number | null
```

Add state after the existing `slot` state:

```typescript
  const [guestCount, setGuestCount] = useState(initialGuests != null ? String(initialGuests) : '')
  const [staffCount, setStaffCount] = useState(initialStaff != null ? String(initialStaff) : '')
```

Add a `useEffect` to refresh those when the initial values change:

```typescript
  useEffect(() => {
    setGuestCount(initialGuests != null ? String(initialGuests) : '')
    setStaffCount(initialStaff != null ? String(initialStaff) : '')
  }, [initialGuests, initialStaff])
```

(Add `useEffect` to the React import.)

In the form JSX, after the Note field, add a Guests/Staff row:

```tsx
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reading-guests">Guests</Label>
              <Input id="reading-guests" type="number" min="0" value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reading-staff">Staff</Label>
              <Input id="reading-staff" type="number" min="0" value={staffCount}
                onChange={(e) => setStaffCount(e.target.value)} placeholder="0" />
            </div>
          </div>
```

In `handleSubmit`'s POST body, include occupancy (only when provided):

```typescript
          slot,
          note: note || null,
          ...(guestCount !== '' ? { guestCount: parseInt(guestCount) || 0 } : {}),
          ...(staffCount !== '' ? { staffCount: parseInt(staffCount) || 0 } : {}),
```

- [ ] **Step 2: `utility-reading-form.tsx` — window-aware slot selector**

Add a `slotTimes` fetch + open-slot computation. Add imports:

```typescript
import { currentISTMinutes, openSlot, isSlotOpen, slotWindowLabel, type SlotTimes } from '@/lib/utilities/slot-windows'
```

Add state + effect (the form already receives `slotTimes` as a prop from the prior feature — reuse it; if it currently takes `slotTimes?: {...}`, treat it as `SlotTimes`). Compute the open slot on mount and every 30s:

```typescript
  const [nowMin, setNowMin] = useState(() => currentISTMinutes())
  useEffect(() => {
    const t = setInterval(() => setNowMin(currentISTMinutes()), 30000)
    return () => clearInterval(t)
  }, [])
  const currentlyOpen = slotTimes ? openSlot(nowMin, slotTimes as SlotTimes) : null
```

When electricity and `slotTimes` known: default-select the open slot, and if none is open and the user is NOT admin, disable submit with a notice. Add, right under the electricity slot `<Select>`:

```tsx
              {slotTimes && (
                currentlyOpen ? (
                  <p className="text-xs text-emerald-600">
                    Window open: {currentlyOpen} ({slotWindowLabel(currentlyOpen, slotTimes as SlotTimes)} IST)
                  </p>
                ) : isAdmin ? (
                  <p className="text-xs text-amber-600">
                    No window open — admin entry will be recorded as a late edit.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No reading window open right now.</p>
                )
              )}
```

Auto-select the open slot when it changes (don't override an admin's manual choice mid-edit — only when a window opens):

```typescript
  useEffect(() => {
    if (utilityType === 'electricity' && currentlyOpen) setSlot(currentlyOpen)
  }, [currentlyOpen, utilityType])
```

Disable the submit button for non-admin electricity when no window is open: in the submit `<Button disabled={...}>`, OR-in:

```typescript
disabled={isSubmitting || (utilityType === 'electricity' && !!slotTimes && !currentlyOpen && !isAdmin)}
```

- [ ] **Step 3: `public-reading-form.tsx` — window-aware (no admin path)**

Apply the same `nowMin`/`currentlyOpen` logic. The public form already has the slot selector + occupancy fields (prior feature). Fetch slot config on mount (public GET of `/api/utilities/slot-config` works — it requires auth though; the public page is unauthenticated). **Therefore add a tiny public slot-times source:** the public page server component (`src/app/(public)/u/[slug]/page.tsx`) already loads the property — pass the org slot times to `PublicReadingForm` as a prop instead of fetching. In that page, call `getSlotConfig(property.orgId)` and pass `slotTimes={slotTimes}` to the form. Then in the form, use the prop (no fetch). Render the same open/closed notices; disable submit for electricity when no window is open (public users are never admin):

```typescript
disabled={isSubmitting || (utilityType === 'electricity' && !currentlyOpen)}
```

- [ ] **Step 4: Self-review**

Confirm: occupancy fields submit and are optional/prefilled; the open slot auto-selects and is labelled; non-admin/public electricity submit is disabled when closed; admin sees the late-edit notice; water is unaffected; the public page passes `slotTimes` server-side (no authed fetch from an anonymous page).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/utility-reading-form.tsx src/components/utilities/public-reading-form.tsx "src/app/(public)/u/[slug]/page.tsx"
git commit -m "feat(utilities): inline occupancy + window-aware slot entry in reading forms"
```

---

## Task 8: Management page — remove occupancy card, admin-gate KPI, status badges

**Files:**
- Modify: `src/components/admin/utilities-page-client.tsx`
- Modify: `src/components/admin/utility-readings-table.tsx`
- Modify: `src/app/api/utilities/kpi-bands/route.ts`
- Modify: `src/app/api/utilities/kpis/route.ts`
- Delete: `src/components/admin/utility-occupancy-form.tsx`, `src/app/api/utilities/occupancy/route.ts`

**Interfaces:**
- Consumes: summary `dailyRows[].penalty`, `isAdmin` (passed to the page client already as a prop).

- [ ] **Step 1: page client — drop occupancy card, feed occupancy + isAdmin to the reading form**

In `src/components/admin/utilities-page-client.tsx`:
- Remove the `import { UtilityOccupancyForm } ...` line and the `<UtilityOccupancyForm ... />` block.
- Extend `SummaryData.dailyRows` element type with `penalty: 'missed' | 'edited' | 'normal'`.
- Pass occupancy + admin to the reading form (reuse `todayRow`):

```tsx
          <UtilityReadingForm
            propertyId={property.id}
            utilityType={utilityType}
            slotTimes={slotTimes ?? undefined}
            isAdmin={isAdmin}
            initialGuests={todayRow?.guestCount ?? null}
            initialStaff={todayRow?.staffCount ?? null}
            onSuccess={fetchData}
          />
```

- Gate the KPI achievement summary card so it only renders for admins. Wrap the `<UtilitySummaryCards .../>`'s KPI props or the card; simplest: pass `kpiConfigured={isAdmin && (summary?.kpi?.configured ?? false)}` and `kpiPct={isAdmin ? (summary?.kpi?.pct ?? null) : null}` and have the card show "No KPI set"/hide when not admin. Cleaner: pass an `showKpi={isAdmin}` prop to `UtilitySummaryCards` and render the 5th card only when `showKpi` (grid stays `lg:grid-cols-5` for admin, `lg:grid-cols-4` for non-admin). Implement `showKpi` in the summary-cards component.

- [ ] **Step 2: summary cards — conditional KPI card**

In `src/components/admin/utility-summary-cards.tsx`, add `showKpi?: boolean` to props; only push the "KPI Achieved" card when `showKpi`; set the grid class to `showKpi ? 'lg:grid-cols-5' : 'lg:grid-cols-4'`.

- [ ] **Step 3: readings table — admin-gate target/KPI columns + status badges**

In `src/components/admin/utility-readings-table.tsx`:
- Add `isAdmin: boolean` to `ReadingsTableProps`; extend `DailyRow` with `penalty: 'missed' | 'edited' | 'normal'`.
- Render the **Target** column and the **KPI** column ONLY when `isAdmin` (wrap those `<TableHead>`/`<TableCell>` in `{isAdmin && (...)}`).
- The KPI cell: when `isAdmin`, show the penalty/achievement badge — `penalty==='missed'` → red "Missed"; else `achieved===true` → emerald "Met"; `achieved===false` → red "Over"; `null` → "—". Add a small "edited" hint when `penalty==='edited'` (e.g. an amber dot/text next to the date or meter cell, visible to all or admin-only — keep admin-only for consistency).
- Pass `isAdmin` from the page client: `<UtilityReadingsTable readings={readings} dailyRows={...} utilityType={utilityType} isAdmin={isAdmin} onRefresh={fetchData} />`.

- [ ] **Step 4: kpi-bands & kpis GET → admin-only**

In `src/app/api/utilities/kpi-bands/route.ts` and `src/app/api/utilities/kpis/route.ts`, in each `GET`, after the `getProfile()` null check add:

```typescript
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 })
    }
```

(Remove the now-redundant `checkPropertyAccess` call in those GETs, or leave it after the admin check — admin check is sufficient. Keep the helper import only if still used.)

- [ ] **Step 5: Delete the standalone occupancy form + route**

```bash
git rm src/components/admin/utility-occupancy-form.tsx src/app/api/utilities/occupancy/route.ts
```

Then grep to confirm nothing else imports them: `grep -rn "utility-occupancy-form\|utilities/occupancy" src/` should return nothing.

- [ ] **Step 6: Self-review**

Confirm: occupancy card gone; reading form gets occupancy + isAdmin; non-admins see no Target/KPI column, no KPI card, no penalty badge; admins see "Missed"/"Met"/"Over"/edited; KPI GET routes 403 non-admins; deleted files have no remaining importers.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(utilities): inline occupancy, admin-only KPI numbers, slot status badges"
```

---

## Task 9: Final verification

- [ ] **Step 1: Cross-file consistency greps**

Run and eyeball:
- `grep -rn "utility-occupancy-form\|utilities/occupancy" src/` → empty.
- `grep -rn "computeKpiAchievement" src/` → all call sites pass the new `{total,target,missed?}` shape.
- `grep -rn "upsertReading(" src/` → all callers pass a valid `readingValue: string | null` and (where relevant) `status`.
- `grep -rn "penalty" src/components/admin/utility-readings-table.tsx src/components/admin/utilities-page-client.tsx` → present and consistent.

- [ ] **Step 2: Migration applied**

Confirm the operator has applied `drizzle/0015_electricity_slot_status.sql` in Supabase. Note it as the pre-deploy step.

- [ ] **Step 3: Ops note for the operator**

Document (in the PR body): set `CRON_SECRET` in Coolify env; add a Coolify Scheduled Task `*/15 * * * *` running `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://tvpl.morpheusds.com/api/cron/electricity-autofill`.

- [ ] **Step 4: Manual smoke checklist (operator / dev server)**

1. Electricity entry inside a slot window → saves as `manual`; outside window as non-admin → 422; as admin → saves `edited` + "late edit" note.
2. Occupancy fields in the Add Reading form save and prefill.
3. Cron endpoint with the Bearer header fills a missed slot for today and marks the day "Missed" (red) in the admin table; without the header → 401.
4. Non-admin user: no Target column, no KPI card, no penalty badge; admin: all visible.
5. Admin backfills the missed slot → day flips off "Missed" (re-evaluated; shows edited).

- [ ] **Step 5: Finish**

Add/refresh the MEMORY.md pointer; use `superpowers:finishing-a-development-branch` to open the PR.

---

## Self-Review Notes

- **Spec coverage:** windows (T2 helpers, T4 enforcement, T7 UI), per-slot provenance (T1, T3), auto-fill cron + mapping + 30-day average excluding autofilled (T5), penalty into KPI (T2 `computeKpiAchievement`/`dayPenaltyState`, T6 summary+rollup), occupancy-into-form (T7), occupancy card removal (T8), fully admin-only KPI numbers (T6 API strip, T8 UI + GET auth), middleware + ops (T5, T9). All spec sections mapped.
- **Type consistency:** `Slot`/`SlotTimes`/`SlotStatus` defined in T2 and reused in T3-T8; `computeKpiAchievement` new `missed?` field consumed in T6 (summary + rollup) only; `dailyRows[].penalty` defined in T6 and consumed in T8; `upsertReading` `status` + nullable value defined in T3 and used in T4/T5.
- **Known acceptable edges (documented in spec):** near-midnight admin-configured slot times use simple (non-wrapping) `windowClosedToday` — fine for default times; unmetered properties still accrue daily "missed" penalties (intended; per-property opt-out deferred); insufficient-history autofill writes a null value but still penalises.
