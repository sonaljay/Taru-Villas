# Design: Utilities Time-Range Selector + Trend Comparisons

**Date:** 2026-06-25
**Status:** Approved (design) — pending spec review
**Area:** Utility Metering — per-property Utilities page (`/properties/[propertyId]/utilities`)

## Summary

Replace the per-property Utilities page's **month + year dropdowns** with a **time-range selector** (presets + custom from–to), and add **period-over-period trend comparisons** inside the summary tiles (▲/▼ % vs the immediately preceding equal-length period). The summary API moves from `year`+`month` to `from`+`to` and additionally returns the comparison metrics.

Scope: the **per-property Utilities page only**. The org dashboard KPI rollup is unchanged.

## Decisions (from brainstorming)

- **Selector replaces** the month/year dropdowns (single control, single mental model).
- Presets: **This month · Last month · Last 3 months · Last 6 months · Last 12 months · Custom (from–to)**. Default = **This month** (preserves current behaviour). "Last N months" is **rolling** (today back N months). Custom = explicit dates.
- **Comparison = previous equal-length period** (the window immediately before `from`). Shows **Δ%** per tile.
- **Predictions (Predicted Usage / Predicted Bill) appear only in the "This month" view**; all other ranges are historical and drop them.
- **Δ colour semantics:** consumption & cost → **down = good (green ▼), up = bad (red ▲)**; KPI achieved → **up = good (green ▲)**.
- Range state lives in the **URL via `nuqs`** (shareable, survives refresh).

## Range Resolution

A pure helper resolves a preset (or custom dates) to a `{ from, to }` pair of `YYYY-MM-DD` strings in IST-naive calendar terms (dates only, no time):

| Preset | from | to |
|---|---|---|
| This month | first day of current month | today |
| Last month | first day of previous month | last day of previous month |
| Last 3 months | today − 3 months | today |
| Last 6 months | today − 6 months | today |
| Last 12 months | today − 12 months | today |
| Custom | user from | user to |

"Today" is the current date (the app's existing `new Date().toISOString().split('T')[0]` convention). Month subtraction uses date-fns (`subMonths`, already a dependency).

The **previous comparison period** = `[from − len, from)` where `len = (to − from)` in days: `prevTo = from − 1 day`, `prevFrom = prevTo − len`. (For *This month*, this compares month-to-date against the same number of days ending the day before the 1st.)

## Data Model / Queries

No schema changes. New/changed query functions in `src/lib/db/queries/utilities.ts`:

- `getReadingsInRange(propertyId, utilityType, from, to)` — readings with `reading_date` in `[from, to]`, ascending (incl. the status columns).
- `getBaselineReading(propertyId, utilityType, before)` — the latest reading strictly before `before` (the cumulative baseline so the first in-range day's consumption is computable). Reuses the existing `getPreviousMonthLastReading` pattern but parameterised on an arbitrary date.
- `getOccupancyInRange(propertyId, from, to)` — occupancy rows in range (replaces the month-scoped `getOccupancyForMonth` usage; keep the old one if still referenced elsewhere).
- Consumption-history for the chart: reuse/extend `getConsumptionHistory` to honour the range (monthly buckets within `[from, to]`).

## Pure Calculations (`src/lib/utilities/calculations.ts`)

- **Range total consumption** = `lastReadingValue(≤to) − baselineValue(<from)`; clamp to `≥ 0` (meter resets → treat as unavailable). `null` when fewer than one in-range reading + baseline.
- **Avg/day** = total ÷ (days in range with data).
- **Range cost** (electricity/water with tiers): **sum of per-calendar-month tiered costs** within the range — for each calendar month overlapped by the range, compute that month's consumption (within-range portion) and apply `calculateTieredCost`, then sum. (Tiers reset monthly, so this is correct; applying tiers to a multi-month total would not be.) A new helper `calculateRangeCost(monthlyConsumptions, tiers)` sums `calculateTieredCost` over months.
- **Δ%** helper `pctDelta(current, previous): number | null` = `previous ? (current − previous) / previous * 100 : null` (null when no previous data / previous is 0).
- KPI achievement over the range reuses the existing penalty-aware `computeKpiAchievement` on the range's `dailyRows`.

The existing `dailyRows` enrichment (breakdown + occupancy + target + penalty, with the admin-only strip) is reused, just over the range's readings + baseline instead of a month.

## Summary API (`src/app/api/utilities/summary/route.ts`)

Request: `?propertyId&utilityType&from=YYYY-MM-DD&to=YYYY-MM-DD&isThisMonth=0|1`.
(`isThisMonth` lets the client signal the special prediction-enabled case without the server re-deriving calendar intent.)

Response (per period, admin-stripped for KPI as today):
```
{
  range: { from, to, days },
  current: { totalConsumption, avgPerDay, totalCost, kpiPct, kpiEvaluatedDays },
  previous: { totalConsumption, avgPerDay, totalCost, kpiPct },   // for Δ tiles
  deltas: { consumptionPct, costPct, avgPct, kpiDeltaPp },        // pre-computed Δ
  dailyRows,                 // range-scoped (admin-stripped as today)
  dailyConsumption,          // for the chart; daily, or monthly-aggregated when days > 90
  history,                   // monthly history (unchanged)
  tiersConfigured,
  prediction: isThisMonth ? { ...existing month prediction... } : null,
  kpi: { configured, pct, evaluatedDays, achievedDays }           // admin-only as today
}
```

The route computes `current` over `[from,to]` and `previous` over the preceding equal window using the same helpers, then the deltas. `prediction` is computed (existing monthly logic) only when `isThisMonth`.

## UI

### Range selector — `src/components/admin/utility-range-selector.tsx` (new)
A `Select` of presets + (when "Custom") two date `<Input type="date">`s for from/to. On change, writes `range` (preset key) and, for custom, `from`/`to` to the URL via `nuqs` `useQueryState` (`shallow: false` so the server re-reads). Replaces the month/year `Select`s in the page header.

### Page client — `src/components/admin/utilities-page-client.tsx`
- Read `range`/`from`/`to` from URL (nuqs), resolve to `{from,to}` (pure helper), set `isThisMonth` when preset === 'this-month'.
- Fetch summary with `from`/`to`/`isThisMonth`; fetch readings list over the range.
- Pass new comparison props to the summary cards.

### Summary cards — `src/components/admin/utility-summary-cards.tsx`
- Tiles: **Total Consumption (Δ%)**, **Avg/day (Δ%)**, **Total Cost (Δ%)**, **KPI Achieved (Δ pp)** — KPI tile admin-only (as today). The Δ renders as a small ▲/▼ line with colour by the good-direction rules above; hidden when Δ is null (no prior data).
- **Only when `isThisMonth`:** additionally render **Predicted Usage** and **Predicted Bill** (existing). Grid column count adjusts (e.g. 4 base, +2 for this-month, KPI tile gated by admin).
- A small caption per tile names the comparison window ("vs previous 3 months").

### Charts — `src/components/admin/utility-charts.tsx`
- Daily-consumption chart consumes `dailyConsumption`, which the API delivers **daily for ≤90-day ranges and monthly-aggregated for longer**. The chart's x-axis label formatting adapts (day vs month). History chart unchanged.

## Out of Scope / Deferred

- Org dashboard rollup range selector (stays last-30-days).
- Same-period-last-year comparison (only ~6 months of data exists; previous-equal-period chosen).
- Per-utility cost when no tiers configured (shows "No rates set", as today).
- CSV/export of a range.
- Saved/favourite ranges.

## Notes / Edge Cases

- **Insufficient history for the comparison** (previous window has no readings) → `deltas` are `null` and the tile shows no ▲/▼ (just the current value). Common for the earliest data (e.g. comparing Jan against pre-Jan when nothing exists).
- **Range with a single reading** → consumption null (needs ≥2 points incl. baseline); tile shows "—".
- **Custom range validation:** `from ≤ to`, both `YYYY-MM-DD`; invalid → 400 from the API, and the selector prevents `from > to`.
- **The anomaly days** already in the data (e.g. TLH Feb 16 electricity) still surface as distorted within a range; out of scope to special-case here.
