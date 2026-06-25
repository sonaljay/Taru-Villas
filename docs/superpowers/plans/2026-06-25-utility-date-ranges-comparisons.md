# Utilities Time-Range Selector + Trend Comparisons — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the per-property Utilities page's month/year picker with a time-range selector (presets + custom), and show period-over-period trend Δ inside the summary tiles.

**Architecture:** A pure range resolver maps a preset to `{from,to,isThisMonth}` (URL state via `nuqs`). The summary API moves from `year`+`month` to `from`+`to`+`isThisMonth`, computing aggregates over the range AND the immediately-preceding equal-length period, returning pre-computed deltas. Predictions are returned only for the "This month" view. The readings-list API gains a range mode.

**Tech Stack:** Next.js 16 App Router, Drizzle/postgres.js, Zod v4, nuqs, date-fns, shadcn/ui, Recharts, lucide-react.

## Global Constraints

- **No new npm packages.** Project has **no test framework** — verify by inspection; pure helpers via a throwaway Node script. NEVER add Vitest/Jest.
- **`npx tsc --noEmit`, `npm run build`, `npm run lint` HANG/fail on the dev Mac (Node 26)** — do NOT run them; the Linux/Coolify build is authoritative. Type-correctness still matters.
- Drizzle numeric columns are strings → `parseFloat` on read, `String()` on write. All mutations `.returning()`. Route params awaited. Data pages keep `export const dynamic = 'force-dynamic'`.
- Zod v4 `from 'zod'`. API routes use `getProfile`; **KPI numbers stay admin-only** — the summary route already strips `target`/`achieved`/`penalty`/`kpi` for non-admins; preserve that for both `current` and the per-day rows.
- **Range cost = sum of per-calendar-month tiered costs** (tiers reset monthly). Never apply tiers to a multi-month total.
- **Δ direction:** consumption & cost → down=good; KPI → up=good. Δ hidden when previous-period data is absent.
- **Comparison period** = the equal-length window immediately before `from`: `prevTo = from − 1 day`, `prevFrom = prevTo − (to − from)`.
- Dates are `YYYY-MM-DD` strings; "today" = `new Date().toISOString().split('T')[0]`.

---

## File Structure

**Created:**
- `src/lib/utilities/date-ranges.ts` — pure range resolver + previous-period + month grouping
- `src/components/admin/utility-range-selector.tsx` — preset + custom selector (nuqs), modeled on `src/components/dashboard/date-filter.tsx`

**Modified:**
- `src/lib/utilities/calculations.ts` — `pctDelta`, `calculateRangeCost`
- `src/lib/db/queries/utilities.ts` — `getReadingsInRange`, `getBaselineReading`, `getOccupancyInRange`
- `src/app/api/utilities/summary/route.ts` — range + comparison + conditional prediction (rewrite of the compute section)
- `src/app/api/utilities/readings/route.ts` — GET accepts `from`/`to`
- `src/components/admin/utilities-page-client.tsx` — range state (nuqs), fetch by range, pass comparison props
- `src/components/admin/utility-summary-cards.tsx` — new tile model (total/avg/cost/kpi + Δ; predictions only this-month)
- `src/components/admin/utility-charts.tsx` — x-axis label adapts to daily vs monthly granularity

---

## Task 1: Pure range + delta helpers

**Files:**
- Create: `src/lib/utilities/date-ranges.ts`
- Modify: `src/lib/utilities/calculations.ts`

**Interfaces:**
- Produces:
  - `type RangePreset = 'this-month' | 'last-month' | 'last-3m' | 'last-6m' | 'last-12m' | 'custom'`
  - `interface ResolvedRange { from: string; to: string; isThisMonth: boolean }`
  - `resolveRange(preset: RangePreset, today: string, customFrom?: string, customTo?: string): ResolvedRange`
  - `previousPeriod(from: string, to: string): { from: string; to: string }`
  - `monthKey(date: string): string` (`'YYYY-MM'`)
  - calc: `pctDelta(current: number | null, previous: number | null): number | null`
  - calc: `calculateRangeCost(monthlyConsumptions: number[], tiers: TierInput[]): number`

- [ ] **Step 1: Create `date-ranges.ts`**

```typescript
import { addDays, subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays, format } from 'date-fns'

export type RangePreset = 'this-month' | 'last-month' | 'last-3m' | 'last-6m' | 'last-12m' | 'custom'

export interface ResolvedRange {
  from: string // YYYY-MM-DD
  to: string
  isThisMonth: boolean
}

const fmt = (d: Date) => format(d, 'yyyy-MM-dd')

/** Resolve a preset (or custom dates) to an inclusive {from,to} date range. */
export function resolveRange(
  preset: RangePreset,
  today: string,
  customFrom?: string,
  customTo?: string
): ResolvedRange {
  const t = parseISO(today)
  switch (preset) {
    case 'this-month':
      return { from: fmt(startOfMonth(t)), to: today, isThisMonth: true }
    case 'last-month': {
      const lm = subMonths(t, 1)
      return { from: fmt(startOfMonth(lm)), to: fmt(endOfMonth(lm)), isThisMonth: false }
    }
    case 'last-3m':
      return { from: fmt(subMonths(t, 3)), to: today, isThisMonth: false }
    case 'last-6m':
      return { from: fmt(subMonths(t, 6)), to: today, isThisMonth: false }
    case 'last-12m':
      return { from: fmt(subMonths(t, 12)), to: today, isThisMonth: false }
    case 'custom':
      return {
        from: customFrom || fmt(subMonths(t, 1)),
        to: customTo || today,
        isThisMonth: false,
      }
  }
}

/** The equal-length window immediately preceding `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = parseISO(from)
  const t = parseISO(to)
  const len = differenceInCalendarDays(t, f) // days
  const prevTo = subDays(f, 1)
  const prevFrom = subDays(prevTo, len)
  return { from: fmt(prevFrom), to: fmt(prevTo) }
}

/** 'YYYY-MM' bucket key for a 'YYYY-MM-DD' date. */
export function monthKey(date: string): string {
  return date.slice(0, 7)
}

/** Inclusive calendar-day count of a range. */
export function rangeDays(from: string, to: string): number {
  return differenceInCalendarDays(parseISO(to), parseISO(from)) + 1
}

// addDays/endOfMonth imported for symmetry/use in callers if needed
void addDays; void endOfMonth
```

(Confirm `date-fns` exports used exist — they do in v4. Remove the `void` line if the linter prefers; it's only to keep imports that callers may use. Simpler: only import what's used — `subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays, format`. Drop `addDays`.)

Final import line (use exactly this — no unused imports):
```typescript
import { subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays, format } from 'date-fns'
```
And delete the `void addDays; void endOfMonth` line. (`endOfMonth` IS used in `last-month`.)

- [ ] **Step 2: Add `pctDelta` + `calculateRangeCost` to `calculations.ts`**

Append to `src/lib/utilities/calculations.ts`:

```typescript
/**
 * Percentage change from previous to current. Null when previous is null or 0
 * (no meaningful base to compare against).
 */
export function pctDelta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Total cost over a range = sum of each calendar month's tiered cost. Tiers
 * reset monthly, so each month's consumption is priced independently.
 */
export function calculateRangeCost(monthlyConsumptions: number[], tiers: TierInput[]): number {
  return monthlyConsumptions.reduce((sum, c) => sum + calculateTieredCost(c, tiers).totalCost, 0)
}
```

- [ ] **Step 3: Verify with a throwaway Node script**

Create `<scratchpad>/check-ranges.mjs` (scratchpad: `/private/tmp/claude-501/-Users-sonaljayawickrama-Desktop-GitHub-Repos-Taru-Villas/680f68bb-e9b0-413a-a546-b0bf5f0a0b40/scratchpad/check-ranges.mjs`). It can't import date-fns easily from there, so test only the pure-arithmetic helpers by re-implementing the date math inline OR `import` date-fns via the project path. Simplest: import from the project node_modules:

```javascript
import { resolveRange, previousPeriod, monthKey, rangeDays } from '/Users/sonaljayawickrama/Desktop/GitHub Repos/Taru-Villas/src/lib/utilities/date-ranges.ts'
```
That won't run (TS). Instead, copy the three pure functions' bodies into the .mjs with the `date-fns` import resolved from the project:
```javascript
import { subDays, subMonths, startOfMonth, endOfMonth, parseISO, differenceInCalendarDays, format } from '/Users/sonaljayawickrama/Desktop/GitHub Repos/Taru-Villas/node_modules/date-fns/index.js'
// ...paste resolveRange, previousPeriod, monthKey, rangeDays bodies (strip TS types)...
function pctDelta(c,p){ if(c===null||p===null||p===0) return null; return (c-p)/p*100 }

console.assert(resolveRange('last-month','2026-06-25').from==='2026-05-01','lm from')
console.assert(resolveRange('last-month','2026-06-25').to==='2026-05-31','lm to')
console.assert(resolveRange('this-month','2026-06-25').from==='2026-06-01' && resolveRange('this-month','2026-06-25').isThisMonth===true,'this-month')
console.assert(resolveRange('last-3m','2026-06-25').from==='2026-03-25','3m from')
const pp = previousPeriod('2026-04-01','2026-06-25') // len ~85 days
console.assert(pp.to==='2026-03-31','prev to')
console.assert(monthKey('2026-02-14')==='2026-02','monthKey')
console.assert(rangeDays('2026-06-01','2026-06-25')===25,'rangeDays')
console.assert(pctDelta(110,100)===10 && pctDelta(90,100)===-10 && pctDelta(5,0)===null && pctDelta(5,null)===null,'pctDelta')
console.log('ALL RANGE ASSERTIONS PASSED')
```

Run: `node "<path>"` → expect `ALL RANGE ASSERTIONS PASSED`, no `Assertion failed`. Delete the script after.

- [ ] **Step 4: Commit**

```bash
git add src/lib/utilities/date-ranges.ts src/lib/utilities/calculations.ts
git commit -m "feat(utilities): pure range resolver + pctDelta + range-cost helpers"
```

---

## Task 2: Range query functions

**Files:**
- Modify: `src/lib/db/queries/utilities.ts`

**Interfaces:**
- Produces:
  - `getReadingsInRange(propertyId, utilityType, from, to): Promise<(UtilityMeterReading & { recorderName: string | null })[]>` (ascending, with recorder names — same shape as `getReadingsForMonth`)
  - `getBaselineReading(propertyId, utilityType, before): Promise<UtilityMeterReading | null>` (latest reading with `reading_date < before`)
  - `getOccupancyInRange(propertyId, from, to): Promise<DailyOccupancy[]>`

- [ ] **Step 1: Add the three functions**

In `src/lib/db/queries/utilities.ts`, after `getReadingsForMonth` (or near the other read helpers):

```typescript
/** Readings for a property/utility in [from, to] inclusive, ascending, with recorder names. */
export async function getReadingsInRange(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  from: string,
  to: string
) {
  const readings = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        gte(utilityMeterReadings.readingDate, from),
        lte(utilityMeterReadings.readingDate, to)
      )
    )
    .orderBy(asc(utilityMeterReadings.readingDate))

  const recorderIds = readings.map((r) => r.recordedBy).filter(Boolean) as string[]
  let recorderMap: Record<string, string> = {}
  if (recorderIds.length > 0) {
    const recorders = await db.select({ id: profiles.id, fullName: profiles.fullName }).from(profiles)
    recorderMap = Object.fromEntries(recorders.map((p) => [p.id, p.fullName]))
  }
  return readings.map((r) => ({
    ...r,
    recorderName: r.recordedBy ? recorderMap[r.recordedBy] ?? null : null,
  }))
}

/** The latest reading strictly before `before` (the cumulative baseline). */
export async function getBaselineReading(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  before: string
) {
  const [row] = await db
    .select()
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        lt(utilityMeterReadings.readingDate, before)
      )
    )
    .orderBy(desc(utilityMeterReadings.readingDate))
    .limit(1)
  return row ?? null
}

/** Occupancy rows for a property in [from, to] inclusive. */
export async function getOccupancyInRange(propertyId: string, from: string, to: string) {
  return db
    .select()
    .from(dailyOccupancy)
    .where(
      and(
        eq(dailyOccupancy.propertyId, propertyId),
        gte(dailyOccupancy.logDate, from),
        lte(dailyOccupancy.logDate, to)
      )
    )
    .orderBy(asc(dailyOccupancy.logDate))
}
```

- [ ] **Step 2: Ensure `lt` is imported**

The file imports from `drizzle-orm` (`eq, and, asc, desc, gte, lte, sql`). Add `lt`:
```typescript
import { eq, and, asc, desc, gte, lte, lt, sql } from 'drizzle-orm'
```
Run `grep -n "from 'drizzle-orm'" src/lib/db/queries/utilities.ts` and confirm `lt` is present after editing.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/utilities.ts
git commit -m "feat(utilities): range + baseline + occupancy query helpers"
```

---

## Task 3: Summary API — range, comparison & conditional prediction

**Files:**
- Modify: `src/app/api/utilities/summary/route.ts` (rewrite the params + compute section; keep the existing imports/helpers and `predictMonthlyBill`/`calculateDailyConsumption` usage)

**Interfaces:**
- Consumes: Task 1 (`previousPeriod`, `monthKey`, `pctDelta`, `calculateRangeCost`, `rangeDays`), Task 2 queries, existing `computeElectricityBreakdown`, `resolveBandTarget`, `computeKpiAchievement`, `dayPenaltyState`, `predictMonthlyBill`, `calculateDailyConsumption`, `getTiersForProperty`, `getElectricityBands`, `getWaterKpiTarget`, `getConsumptionHistory`.
- Produces the response shape consumed by Tasks 5-7:
```
{
  range: { from, to, days },
  current: { totalConsumption: number|null, avgPerDay: number|null, totalCost: number|null, kpiPct: number|null, kpiEvaluatedDays: number, kpiAchievedDays: number },
  previous: { totalConsumption: number|null, avgPerDay: number|null, totalCost: number|null, kpiPct: number|null },
  deltas: { consumptionPct: number|null, avgPct: number|null, costPct: number|null, kpiDeltaPp: number|null },
  dailyRows: EnrichedDayRow[],          // admin-stripped as today
  dailyConsumption: { date: string; consumption: number }[],  // daily, or monthly when days>90 (date='YYYY-MM-01')
  history,
  tiersConfigured: boolean,
  prediction: MonthlyPrediction | null, // only when isThisMonth
  kpi: { configured, pct, evaluatedDays, achievedDays }       // admin-only as today
}
```

- [ ] **Step 1: Replace params parsing**

In the GET handler, replace the `year`/`month` extraction + validation with `from`/`to`/`isThisMonth`:

```typescript
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const isThisMonth = searchParams.get('isThisMonth') === '1'

    if (!propertyId || !utilityType || !from || !to) {
      return NextResponse.json({ error: 'propertyId, utilityType, from, to are required' }, { status: 400 })
    }
    if (!['water', 'electricity'].includes(utilityType)) {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }
    const dateRe = /^\d{4}-\d{2}-\d{2}$/
    if (!dateRe.test(from) || !dateRe.test(to) || from > to) {
      return NextResponse.json({ error: 'Invalid from/to' }, { status: 400 })
    }
    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
```

- [ ] **Step 2: Update imports**

```typescript
import {
  getReadingsInRange,
  getBaselineReading,
  getOccupancyInRange,
  getTiersForProperty,
  getConsumptionHistory,
  getElectricityBands,
  getWaterKpiTarget,
} from '@/lib/db/queries/utilities'
import {
  predictMonthlyBill,
  calculateDailyConsumption,
  computeElectricityBreakdown,
  resolveBandTarget,
  computeKpiAchievement,
  dayPenaltyState,
  pctDelta,
  calculateRangeCost,
  type TierInput,
  type SlotRow,
} from '@/lib/utilities/calculations'
import { previousPeriod, monthKey, rangeDays } from '@/lib/utilities/date-ranges'
```

- [ ] **Step 3: Add a period-aggregation helper inside the route module (above the handler)**

This computes a period's enriched dailyRows + aggregates from already-fetched data; reused for current and previous periods.

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

type ReadingRow = {
  readingDate: string
  readingValue: string | null
  eveningReading: string | null
  nightReading: string | null
  morningStatus: 'manual' | 'autofilled' | 'edited' | null
  eveningStatus: 'manual' | 'autofilled' | 'edited' | null
  nightStatus: 'manual' | 'autofilled' | 'edited' | null
}

function buildDailyRows(
  utilityType: 'water' | 'electricity',
  readings: ReadingRow[],
  baseline: ReadingRow | null,
  occByDate: Map<string, { guestCount: number; staffCount: number }>,
  bandInputs: { minGuests: number; targetUnits: number }[],
  waterTarget: number | null
): EnrichedDayRow[] {
  if (utilityType === 'electricity') {
    const slotRows: SlotRow[] = readings.map((r) => ({
      date: r.readingDate,
      morning: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      evening: r.eveningReading !== null ? parseFloat(r.eveningReading) : null,
      night: r.nightReading !== null ? parseFloat(r.nightReading) : null,
    }))
    const breakdown = computeElectricityBreakdown(slotRows)
    return breakdown.map((b, i) => {
      const r = readings[i]
      const occ = occByDate.get(b.date)
      const guestCount = occ ? occ.guestCount : null
      const target = resolveBandTarget(guestCount, bandInputs)
      const penalty = dayPenaltyState({ morning: r.morningStatus, evening: r.eveningStatus, night: r.nightStatus })
      const achieved = penalty === 'missed' ? false : b.total !== null && target !== null ? b.total <= target : null
      return {
        date: b.date, readingValue: slotRows[i].morning, day: b.day, peak: b.peak, offPeak: b.offPeak,
        total: b.total, pending: b.pending, guestCount, staffCount: occ ? occ.staffCount : null,
        target, achieved, penalty,
      }
    })
  }
  // Water: consecutive deltas (baseline gives day-0 a predecessor)
  return readings.map((r, i) => {
    const prev = i > 0 ? readings[i - 1] : baseline && baseline.readingValue !== null ? baseline : null
    const rawTotal = prev && prev.readingValue !== null && r.readingValue !== null
      ? parseFloat(r.readingValue) - parseFloat(prev.readingValue) : null
    const total = rawTotal !== null && rawTotal >= 0 ? rawTotal : null
    const occ = occByDate.get(r.readingDate)
    return {
      date: r.readingDate, readingValue: r.readingValue !== null ? parseFloat(r.readingValue) : null,
      day: null, peak: null, offPeak: null, total, pending: total === null,
      guestCount: occ ? occ.guestCount : null, staffCount: occ ? occ.staffCount : null,
      target: waterTarget, achieved: total !== null && waterTarget !== null ? total <= waterTarget : null,
      penalty: 'normal' as const,
    }
  })
}

function aggregatePeriod(
  dailyRows: EnrichedDayRow[],
  readings: ReadingRow[],
  baseline: ReadingRow | null,
  from: string, to: string,
  tierInputs: TierInput[]
) {
  // Total consumption = last in-range reading_value - baseline reading_value (clamp >=0)
  const lastWithValue = [...readings].reverse().find((r) => r.readingValue !== null)
  const baseVal = baseline && baseline.readingValue !== null ? parseFloat(baseline.readingValue) : null
  const lastVal = lastWithValue ? parseFloat(lastWithValue.readingValue as string) : null
  const rawTotal = baseVal !== null && lastVal !== null ? lastVal - baseVal : null
  const totalConsumption = rawTotal !== null && rawTotal >= 0 ? rawTotal : null
  const days = rangeDays(from, to)
  const avgPerDay = totalConsumption !== null ? totalConsumption / days : null
  // Cost: sum per-calendar-month tiered cost from dailyRows' totals
  const monthly = new Map<string, number>()
  for (const row of dailyRows) if (row.total !== null) monthly.set(monthKey(row.date), (monthly.get(monthKey(row.date)) ?? 0) + row.total)
  const totalCost = tierInputs.length > 0 ? calculateRangeCost([...monthly.values()], tierInputs) : null
  const ach = computeKpiAchievement(dailyRows.map((r) => ({ total: r.total, target: r.target, missed: r.penalty === 'missed' })))
  return { totalConsumption, avgPerDay, totalCost, kpiPct: ach.pct, kpiEvaluatedDays: ach.evaluatedDays, kpiAchievedDays: ach.achievedDays }
}
```

- [ ] **Step 4: Fetch + compute both periods, build the response**

Replace the existing fetch + prediction/dailyRows/kpi block with:

```typescript
    const prev = previousPeriod(from, to)
    const [
      curReadings, curBaseline, tiers, history, occupancy, bands, waterTarget,
      prevReadings, prevBaseline, prevOccupancy,
    ] = await Promise.all([
      getReadingsInRange(propertyId, utilityType, from, to),
      getBaselineReading(propertyId, utilityType, from),
      getTiersForProperty(propertyId, utilityType),
      getConsumptionHistory(propertyId, utilityType, 6),
      getOccupancyInRange(propertyId, from, to),
      utilityType === 'electricity' ? getElectricityBands(propertyId) : Promise.resolve([]),
      utilityType === 'water' ? getWaterKpiTarget(propertyId) : Promise.resolve(null),
      getReadingsInRange(propertyId, utilityType, prev.from, prev.to),
      getBaselineReading(propertyId, utilityType, prev.from),
      getOccupancyInRange(propertyId, prev.from, prev.to),
    ])

    const tierInputs: TierInput[] = tiers.map((t) => ({
      tierNumber: t.tierNumber, minUnits: parseFloat(t.minUnits),
      maxUnits: t.maxUnits ? parseFloat(t.maxUnits) : null, ratePerUnit: parseFloat(t.ratePerUnit),
    }))
    const bandInputs = bands.map((b) => ({ minGuests: b.minGuests, targetUnits: parseFloat(b.targetUnits) }))
    const waterTargetNum = waterTarget ? parseFloat(waterTarget.dailyTargetUnits) : null
    const curOcc = new Map(occupancy.map((o) => [o.logDate, { guestCount: o.guestCount, staffCount: o.staffCount }]))
    const prevOcc = new Map(prevOccupancy.map((o) => [o.logDate, { guestCount: o.guestCount, staffCount: o.staffCount }]))

    const dailyRows = buildDailyRows(utilityType, curReadings as ReadingRow[], curBaseline as ReadingRow | null, curOcc, bandInputs, waterTargetNum)
    const prevRows = buildDailyRows(utilityType, prevReadings as ReadingRow[], prevBaseline as ReadingRow | null, prevOcc, bandInputs, waterTargetNum)

    const current = aggregatePeriod(dailyRows, curReadings as ReadingRow[], curBaseline as ReadingRow | null, from, to, tierInputs)
    const previousAgg = aggregatePeriod(prevRows, prevReadings as ReadingRow[], prevBaseline as ReadingRow | null, prev.from, prev.to, tierInputs)

    const deltas = {
      consumptionPct: pctDelta(current.totalConsumption, previousAgg.totalConsumption),
      avgPct: pctDelta(current.avgPerDay, previousAgg.avgPerDay),
      costPct: pctDelta(current.totalCost, previousAgg.totalCost),
      kpiDeltaPp: current.kpiPct !== null && previousAgg.kpiPct !== null ? current.kpiPct - previousAgg.kpiPct : null,
    }

    // Daily consumption series (chart): monthly-aggregate when range > 90 days
    const days = rangeDays(from, to)
    let dailyConsumption: { date: string; consumption: number }[]
    if (days > 90) {
      const m = new Map<string, number>()
      for (const r of dailyRows) if (r.total !== null) m.set(monthKey(r.date), (m.get(monthKey(r.date)) ?? 0) + r.total)
      dailyConsumption = [...m.entries()].sort().map(([k, v]) => ({ date: `${k}-01`, consumption: v }))
    } else {
      dailyConsumption = dailyRows.filter((r) => r.total !== null).map((r) => ({ date: r.date, consumption: r.total as number }))
    }

    // Prediction only for the current-month view
    let prediction = null
    if (isThisMonth) {
      const [y, mo] = from.split('-').map(Number)
      const readingsForCalc: { date: string; value: number }[] = []
      if (curBaseline && curBaseline.readingValue !== null) readingsForCalc.push({ date: curBaseline.readingDate, value: parseFloat(curBaseline.readingValue) })
      for (const r of curReadings) if (r.readingValue !== null) readingsForCalc.push({ date: r.readingDate, value: parseFloat(r.readingValue) })
      prediction = predictMonthlyBill(readingsForCalc, tierInputs, y, mo)
    }

    const isAdmin = profile.role === 'admin'
    const safeDailyRows = isAdmin ? dailyRows : dailyRows.map((r) => ({ ...r, target: null, achieved: null, penalty: 'normal' as const }))

    return NextResponse.json({
      range: { from, to, days },
      current: isAdmin ? current : { ...current, kpiPct: null, kpiEvaluatedDays: 0, kpiAchievedDays: 0 },
      previous: isAdmin ? previousAgg : { ...previousAgg, kpiPct: null },
      deltas: isAdmin ? deltas : { ...deltas, kpiDeltaPp: null },
      dailyRows: safeDailyRows,
      dailyConsumption,
      history: history.map((h) => ({ month: h.month, consumption: Number(h.consumption), readingCount: h.readingCount })),
      tiersConfigured: tiers.length > 0,
      prediction,
      kpi: isAdmin
        ? { configured: utilityType === 'electricity' ? bands.length > 0 : waterTarget !== null, pct: current.kpiPct, evaluatedDays: current.kpiEvaluatedDays, achievedDays: current.kpiAchievedDays }
        : { configured: false, pct: null, evaluatedDays: 0, achievedDays: 0 },
    })
```

Delete the old `getReadingsForMonth`/`getPreviousMonthLastReading`-based block and the old `EnrichedDayRow` inline type (now defined at module scope in Step 3).

- [ ] **Step 5: Self-review + commit**

Confirm: both periods computed via the shared helper; cost is per-month summed; deltas null-safe; KPI admin-stripped on `current`/`previous`/`deltas`/`dailyRows`/`kpi`; prediction only when `isThisMonth`; chart series monthly when days>90. Then:

```bash
git add src/app/api/utilities/summary/route.ts
git commit -m "feat(utilities): summary API by date range with period-over-period deltas"
```

---

## Task 4: Readings list API — range mode

**Files:**
- Modify: `src/app/api/utilities/readings/route.ts` (GET only)

**Interfaces:**
- Consumes: `getReadingsInRange` (Task 2).

- [ ] **Step 1: Accept `from`/`to` in GET**

Replace the GET's `year`/`month` extraction + the `getReadingsForMonth` call with range handling (keep auth/access checks):

```typescript
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get('propertyId')
    const utilityType = searchParams.get('utilityType') as 'water' | 'electricity' | null
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    if (!propertyId || !utilityType || !from || !to) {
      return NextResponse.json({ error: 'propertyId, utilityType, from, to are required' }, { status: 400 })
    }
    if (!['water', 'electricity'].includes(utilityType)) {
      return NextResponse.json({ error: 'Invalid utilityType' }, { status: 400 })
    }
    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const readings = await getReadingsInRange(propertyId, utilityType, from, to)
    return NextResponse.json(readings)
```

Update the import: replace `getReadingsForMonth` with `getReadingsInRange` in the import from `@/lib/db/queries/utilities` (keep `getLatestReading`, `upsertReading`, `upsertOccupancy`, `getSlotConfig`).

- [ ] **Step 2: Commit**

```bash
git add src/app/api/utilities/readings/route.ts
git commit -m "feat(utilities): readings list API accepts a date range"
```

---

## Task 5: Range selector component

**Files:**
- Create: `src/components/admin/utility-range-selector.tsx`

**Interfaces:**
- Consumes: `RangePreset`, `resolveRange`, `ResolvedRange` (Task 1).
- Produces: `<UtilityRangeSelector onChange={(r: ResolvedRange & { preset: RangePreset }) => void} />` — writes `range`/`from`/`to` to the URL via nuqs and calls `onChange` with the resolved range.

- [ ] **Step 1: Create the component** (modeled on `src/components/dashboard/date-filter.tsx`)

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQueryState } from 'nuqs'
import { CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resolveRange, type RangePreset, type ResolvedRange } from '@/lib/utilities/date-ranges'

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'last-3m', label: '3 months' },
  { key: 'last-6m', label: '6 months' },
  { key: 'last-12m', label: '12 months' },
  { key: 'custom', label: 'Custom' },
]

const today = () => new Date().toISOString().split('T')[0]

interface Props {
  onChange: (r: ResolvedRange & { preset: RangePreset }) => void
}

export function UtilityRangeSelector({ onChange }: Props) {
  const [preset, setPreset] = useQueryState('range', { defaultValue: 'this-month' })
  const [fromParam, setFromParam] = useQueryState('from')
  const [toParam, setToParam] = useQueryState('to')
  const active = preset as RangePreset
  const [customFrom, setCustomFrom] = useState(fromParam || today())
  const [customTo, setCustomTo] = useState(toParam || today())

  const emit = useCallback(
    (p: RangePreset, cf?: string, ct?: string) => {
      const r = resolveRange(p, today(), cf, ct)
      onChange({ ...r, preset: p })
    },
    [onChange]
  )

  // Emit on mount + whenever the preset changes (custom emits via Apply)
  useEffect(() => {
    if (active !== 'custom') emit(active)
    else if (customFrom && customTo) emit('custom', customFrom, customTo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])

  const clickPreset = (key: RangePreset) => {
    setPreset(key)
    if (key !== 'custom') {
      setFromParam(null)
      setToParam(null)
      emit(key)
    }
  }
  const applyCustom = () => {
    if (customFrom && customTo && customFrom <= customTo) {
      setFromParam(customFrom)
      setToParam(customTo)
      emit('custom', customFrom, customTo)
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1.5">
        <CalendarDays className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Period:</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map((p) => (
          <Button key={p.key} variant={active === p.key ? 'default' : 'outline'} size="sm"
            className="h-8 text-xs" onClick={() => clickPreset(p.key)}>
            {p.label}
          </Button>
        ))}
      </div>
      {active === 'custom' && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="util-from" className="text-xs">From</Label>
            <Input id="util-from" type="date" value={customFrom} max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="util-to" className="text-xs">To</Label>
            <Input id="util-to" type="date" value={customTo} min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)} className="h-8 w-36 text-xs" />
          </div>
          <Button size="sm" className="h-8 text-xs" onClick={applyCustom}>Apply</Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/utility-range-selector.tsx
git commit -m "feat(utilities): time-range selector (presets + custom, nuqs)"
```

---

## Task 6: Page client — wire the range selector + comparison props

**Files:**
- Modify: `src/components/admin/utilities-page-client.tsx`

**Interfaces:**
- Consumes: Task 3 summary shape, Task 5 selector, `RangePreset`/`ResolvedRange`.

- [ ] **Step 1: Replace month/year state with range state**

Remove `year`/`month` `useState` and the `monthNames`/`yearOptions` consts. Add:

```typescript
  const [range, setRange] = useState<{ from: string; to: string; isThisMonth: boolean } | null>(null)
```

Update the `SummaryData` interface to the Task 3 shape: add `range`, `current`, `previous`, `deltas`, `dailyConsumption`, keep `dailyRows`, `history`, `tiersConfigured`, `prediction`, `kpi`. (Define the nested types inline matching Task 3's response.)

- [ ] **Step 2: Fetch by range**

Change `fetchData` to depend on `range` and send `from`/`to`/`isThisMonth`:

```typescript
  const fetchData = useCallback(async () => {
    if (!range) return
    setLoading(true)
    try {
      const qs = `propertyId=${property.id}&utilityType=${utilityType}&from=${range.from}&to=${range.to}&isThisMonth=${range.isThisMonth ? 1 : 0}`
      const [summaryRes, readingsRes] = await Promise.all([
        fetch(`/api/utilities/summary?${qs}`),
        fetch(`/api/utilities/readings?propertyId=${property.id}&utilityType=${utilityType}&from=${range.from}&to=${range.to}`),
      ])
      if (summaryRes.ok) setSummary(await summaryRes.json())
      if (readingsRes.ok) setReadings(await readingsRes.json())
    } catch (error) {
      console.error('Failed to fetch utility data:', error)
    } finally {
      setLoading(false)
    }
  }, [property.id, utilityType, range])
```

- [ ] **Step 3: Render the selector + pass comparison props**

In the header Controls block, replace the two month/year `<Select>`s with:

```tsx
          <UtilityRangeSelector onChange={(r) => setRange({ from: r.from, to: r.to, isThisMonth: r.isThisMonth })} />
```

(Import `UtilityRangeSelector` from `@/components/admin/utility-range-selector`. Remove now-unused `Select` imports if nothing else uses them — keep them if the utility-type tabs use Select; they use Tabs, so check and remove unused `Select`/`SelectItem` imports.)

Update the `<UtilitySummaryCards .../>` props to the new model (Task 7 defines the prop names):

```tsx
      <UtilitySummaryCards
        utilityType={utilityType}
        isThisMonth={range?.isThisMonth ?? false}
        current={summary?.current ?? null}
        deltas={summary?.deltas ?? null}
        prediction={summary?.prediction ?? null}
        tiersConfigured={summary?.tiersConfigured ?? false}
        rangeLabel={summary?.range ? `${summary.range.days} days` : ''}
        showKpi={isAdmin}
        loading={loading}
      />
```

`todayRow` stays (used for the reading form's occupancy prefill) — it reads `summary?.dailyRows`.

- [ ] **Step 4: Self-review + commit**

Confirm: no remaining references to `year`/`month`/`monthNames`/`yearOptions`; the selector drives `range`; fetch sends from/to; cards get the new props; charts still receive `summary?.dailyConsumption`/`history`.

```bash
git add src/components/admin/utilities-page-client.tsx
git commit -m "feat(utilities): drive Utilities page by date range + comparisons"
```

---

## Task 7: Summary cards — totals + Δ tiles (predictions only for This month)

**Files:**
- Modify: `src/components/admin/utility-summary-cards.tsx`

**Interfaces:**
- Consumes: Task 3 `current`/`deltas`/`prediction` shapes.

- [ ] **Step 1: Rewrite the component props + tiles**

Replace `SummaryCardsProps` and the card-building logic. New props:

```typescript
interface Period { totalConsumption: number | null; avgPerDay: number | null; totalCost: number | null; kpiPct: number | null; kpiEvaluatedDays: number }
interface Deltas { consumptionPct: number | null; avgPct: number | null; costPct: number | null; kpiDeltaPp: number | null }
interface PredictionShape { predictedConsumption: number; predictedCost: number; daysInMonth: number }

interface SummaryCardsProps {
  utilityType: 'water' | 'electricity'
  isThisMonth: boolean
  current: Period | null
  deltas: Deltas | null
  prediction: PredictionShape | null
  tiersConfigured: boolean
  rangeLabel: string
  showKpi: boolean
  loading: boolean
}
```

Render a `Δ` line helper: given `pct` and a `goodWhenDown` flag, show `▼ X%` green / `▲ X%` red (consumption & cost: goodWhenDown=true; KPI uses pp delta, goodWhenDown=false). Hide when null. Use lucide `ArrowUp`/`ArrowDown`. Tiles:
- **Total Consumption** — `current.totalConsumption` + unit; Δ `deltas.consumptionPct` (goodWhenDown). Subtitle: `avg X/day` + `rangeLabel`.
- **Total Cost** — `current.totalCost` (LKR) or "No rates set" when `!tiersConfigured`; Δ `deltas.costPct` (goodWhenDown).
- **KPI Achieved** (only when `showKpi`) — `current.kpiPct`% or "No KPI set"; Δ `deltas.kpiDeltaPp` as `+N pp`/`−N pp` (goodWhenDown=false). Subtitle: `X days evaluated`.
- **Predicted Usage** + **Predicted Bill** (only when `isThisMonth && prediction`) — from `prediction`.

Grid: base 2 tiles (consumption, cost) + KPI when showKpi + 2 prediction tiles when this-month. Use a responsive `grid gap-4 sm:grid-cols-2 lg:grid-cols-3` and let it wrap (don't hardcode a fixed column count that breaks when tiles vary). Provide the full file in implementation following the existing card markup style (Card/CardHeader/CardTitle/CardContent, lucide icons, `text-2xl font-bold` value).

Full reference for the Δ sub-component:
```tsx
function Delta({ pct, goodWhenDown, suffix = '%' }: { pct: number | null; goodWhenDown: boolean; suffix?: string }) {
  if (pct === null) return null
  const up = pct > 0
  const good = goodWhenDown ? !up : up
  const Icon = up ? ArrowUp : ArrowDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${good ? 'text-emerald-600' : 'text-red-600'}`}>
      <Icon className="size-3" />{Math.abs(pct).toFixed(0)}{suffix}
    </span>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/utility-summary-cards.tsx
git commit -m "feat(utilities): total + trend-delta summary tiles"
```

---

## Task 8: Charts — adapt x-axis to daily vs monthly

**Files:**
- Modify: `src/components/admin/utility-charts.tsx`

- [ ] **Step 1: Format the daily series by granularity**

The chart currently builds `dailyData` (around line 56) as `dailyConsumption.map((d) => ({ date: formatDate(d.date), consumption: d.consumption }))`, where `formatDate` (line 42) renders `"Jun 5"`. The `dailyConsumption` series now contains either daily points (`date='YYYY-MM-DD'`) or **monthly** points (`date='YYYY-MM-01'`, when the API aggregated a >90-day range). Detect monthly granularity and label months as `"Jun"`.

Replace the `dailyData` map (lines ~56-59) with:

```tsx
  const isMonthly =
    dailyConsumption.length > 1 && dailyConsumption.every((d) => d.date.endsWith('-01'))
  const dailyData = dailyConsumption.map((d) => ({
    date: isMonthly
      ? new Date(d.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })
      : formatDate(d.date),
    consumption: d.consumption,
  }))
```

Then change the daily-consumption card title (line ~71) from `Daily Consumption` to `Consumption` (range-agnostic). Leave the `<XAxis dataKey="date" ...>` as-is (it reads the now-correctly-formatted `date` field). Keep the Monthly Trend (history) chart unchanged.

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/utility-charts.tsx
git commit -m "feat(utilities): consumption chart adapts to daily/monthly range granularity"
```

---

## Task 9: Final verification

- [ ] **Step 1: Consistency greps**
- `grep -rn "year=\|month=\|getReadingsForMonth\|getPreviousMonthLastReading" src/app/api/utilities src/components/admin/utilities-page-client.tsx` → no stale monthly params in the summary/readings GET or page client (the helpers may still exist in queries for other callers; that's fine).
- `grep -rn "from=\|to=\|isThisMonth" src/components/admin/utilities-page-client.tsx` → range params present.
- `grep -rn "current\.\|deltas\.\|prediction" src/components/admin/utility-summary-cards.tsx` → new props consumed.

- [ ] **Step 2: Manual smoke (operator / dev server)**

1. Open `/properties/<TLH>/utilities`, electricity. Default "This month" shows consumption-to-date + predictions; switching to "Last 3 months" hides predictions and shows totals + Δ vs the prior 3 months.
2. "Last 12 months" → chart shows monthly bars (not 365 daily). Custom range applies on Apply; URL carries `?range=custom&from=…&to=…`.
3. A non-admin sees no KPI tile / no Δ on KPI; admin sees them.
4. Δ colour: a higher-consumption period shows red ▲; lower shows green ▼.
5. Reading table + edit/delete still work within the selected range.

- [ ] **Step 3: Finish** — refresh the MEMORY pointer; use `superpowers:finishing-a-development-branch`.

---

## Self-Review Notes

- **Spec coverage:** range selector + presets + custom + nuqs (T1,T5,T6); summary by from/to + previous-period + deltas + per-month cost + conditional prediction + admin strip (T1,T3); readings range mode (T4); tiles with Δ + predictions-only-this-month + colour rules (T7); chart daily/monthly adaptation (T8). All spec sections mapped.
- **Type consistency:** `ResolvedRange`/`RangePreset` (T1) used in T5/T6; the summary response shape (T3) consumed verbatim by T6/T7; `EnrichedDayRow`/`ReadingRow` defined at module scope in T3; `pctDelta`/`calculateRangeCost` (T1) used in T3; `getReadingsInRange`/`getBaselineReading`/`getOccupancyInRange` (T2) used in T3/T4.
- **Carry-over from prior work (still true):** local tsc/build/lint hang on the dev Mac → Linux CI is authoritative; KPI numbers must stay admin-only (preserved in T3).
- **Acceptable edges (documented in spec):** previous-period absent → null deltas (no ▲/▼); single-reading range → null consumption; the existing data anomalies (e.g. TLH Feb 16) still surface within a range.
