# Design: Time-of-Use Electricity Readings, Occupancy Tracking & Daily KPIs

**Date:** 2026-06-24
**Status:** Approved (design) — pending implementation plan
**Area:** Utility Metering (Meter Readings)

## Summary

Extend the Meter Readings feature with three capabilities:

1. **Three electricity readings per day** at admin-configurable times (defaults 05:30 / 17:30 / 22:30), with an automatic **Day / Peak / Off-Peak** usage breakdown. Water is unchanged (single daily reading).
2. **Daily occupancy tracking** — guest count and staff count, recorded once per property per day.
3. **Flat daily usage KPIs** per property per utility, with dashboards showing **% of days the KPI was achieved vs not**, on both the per-property Utilities page and the org overview dashboard.

## Decisions (from brainstorming)

- **KPI type:** flat daily target per property per utility. Headcount is tracked for context but does **not** alter the KPI. A day is *achieved* when total daily usage ≤ target (lower is better).
- **3-reading / breakdown scope:** electricity only. Water stays a single daily reading.
- **KPI comparison scope:** total daily usage (sum of Day+Peak+Off-Peak for electricity; next-day−today for water). No per-bucket KPIs.
- **Stats surfaces:** per-property Utilities page **and** org overview dashboard.
- **Headcount entry:** both the admin/PM management form and the public `/u/[slug]` form.
- **Slot times:** admin-editable, **org-wide** (one shared set). They are display labels + entry guidance — they do **not** affect the delta math.

## Data Model

### A. Electricity time-of-use readings — extend `utility_meter_readings`

Add two nullable columns to the existing one-row-per-`(property, utility, date)` table:

| Column | Meaning | Used by |
|---|---|---|
| `reading_value` *(existing)* | **morning** (slot 1) reading | water (sole daily reading) + electricity (morning) |
| `evening_reading` *(new, nullable numeric(12,2))* | **slot 2** reading | electricity only |
| `night_reading` *(new, nullable numeric(12,2))* | **slot 3** reading | electricity only |

**Rationale for columns over a slot-enum-with-3-rows model:** keeps one row per day, leaves the existing `UNIQUE(property, utility, date)` constraint and the monthly-billing consumption query untouched, requires **zero data migration** (existing readings become the morning reading), and water is completely unaffected. Bucket math is a within-row subtraction. Trade-off: the entry API targets a specific column by slot — minor.

**Derived buckets (electricity):**

- **Day** = `evening_reading − reading_value`
- **Peak** = `night_reading − evening_reading`
- **Off-Peak** = *next day's* `reading_value − night_reading`
- **Total daily** = next day's `reading_value − reading_value` (≡ Day + Peak + Off-Peak)

Off-Peak and Total finalize only once the **next morning's** reading exists; until then the UI renders "—"/"pending". Water daily usage is unchanged (next day − today).

Cumulative monotonicity (`reading_value ≤ evening_reading ≤ night_reading`) holds naturally since a meter only counts up; the entry form should validate this and warn on a decrease (consistent with existing reading validation).

### B. Daily occupancy — new table `daily_occupancy`

Per-property-per-day, **not** utility-scoped (so headcount is never duplicated across the water/electricity rows).

```
daily_occupancy:
  id           uuid pk default random
  property_id  uuid not null -> properties.id (on delete cascade)
  log_date     date not null
  guest_count  integer not null default 0
  staff_count  integer not null default 0
  note         text null
  recorded_by  uuid null -> profiles.id (on delete set null)
  created_at   timestamptz not null default now()
  updated_at   timestamptz not null default now()
  UNIQUE(property_id, log_date)
```

### C. KPI targets — new table `utility_kpi_targets`

Mirrors the `utility_rate_tiers` admin-config pattern.

```
utility_kpi_targets:
  id                  uuid pk default random
  property_id         uuid not null -> properties.id (on delete cascade)
  utility_type        utility_type not null            -- existing enum: water | electricity
  daily_target_units  numeric(12,2) not null
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()
  UNIQUE(property_id, utility_type)
```

A day is *achieved* when total daily usage ≤ `daily_target_units`. Days with no KPI configured are excluded from the achievement %.

### D. Slot-time config — new table `electricity_slot_config`

Org-wide single set of three slot times. Display labels + entry guidance only; not used in delta math.

```
electricity_slot_config:
  id            uuid pk default random
  org_id        uuid not null -> organizations.id
  morning_time  time not null default '05:30'
  evening_time  time not null default '17:30'
  night_time    time not null default '22:30'
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
  UNIQUE(org_id)
```

Read with a default fallback (05:30 / 17:30 / 22:30) when no row exists, so the feature works before any admin saves config.

## Data Entry

### Management form (`/properties/[propertyId]/utilities`)

- **Electricity tab:** the reading entry form gains a **slot selector** (Morning / Evening / Night, labelled with the configured times). One reading per submit — matching the real 3-rounds-a-day workflow. OCR scan continues to work per reading. On submit, the API upserts the day's row, setting the targeted slot column.
- **Water tab:** unchanged single input.
- **Daily occupancy block:** a small guest + staff form, rendered **outside** the water/electricity tabs (shared, once per day), scoped to the selected date. Upserts `daily_occupancy`.

### Public form (`/u/[slug]`)

- **Electricity:** same slot selector as the management form.
- **Occupancy:** optional guest + staff fields; on submit, upserts that date's `daily_occupancy` row. (Accepted trade-off: public/no-auth headcount entry.)

## Stats / Dashboards

### Per-property Utilities page (per tab)

- **New summary card:** "KPI Achieved — X% of days" over the selected window (days with a configured KPI and a computable total). Pending days (awaiting next-morning reading) are excluded from the denominator.
- **Readings table additions (electricity):** Day / Peak / Off-Peak / Total columns, a **KPI pass/fail badge** per day, and **guests / staff** columns. Water table gets Total (existing), KPI badge, and guests/staff. Colour: pass = emerald, fail = red, pending = muted.

### Org overview dashboard

- **New portfolio rollup:** per property, water + electricity KPI-achievement % across the window — admin compliance-at-a-glance. Follows the existing dashboard query/section conventions in `src/lib/db/queries/dashboard.ts` and the overview page.

## Query Layer (`src/lib/db/queries/utilities.ts` + `dashboard.ts`)

- A helper computes per-day usage + buckets from consecutive readings (ordered by date, with `lead/lag`-style next-day lookup for off-peak/total), joins KPI target → pass/fail, and joins `daily_occupancy`.
- KPI-achievement aggregation: `count(days where total ≤ target) / count(days with target and computable total)` over the window.
- Org rollup reuses the per-property achievement aggregation grouped by property (acceptable N+1 or single grouped query, consistent with existing dashboard patterns).
- Occupancy + slot-config + KPI-target CRUD live in `utilities.ts`.

## API Routes

- `POST /api/utilities/readings` & `/api/utilities/public`: accept an optional `slot` (`morning|evening|night`, electricity only; water ignores it) and optional `guestCount`/`staffCount` → upsert reading column + occupancy.
- `PUT /api/utilities/kpis` (admin-only): set per-property/utility daily targets — mirrors the tiers config route.
- `PUT /api/utilities/slot-config` (admin-only): set org-wide slot times.
- Occupancy may also have its own `POST/PATCH` if not folded into the readings routes.

## Auth

- Reading + occupancy entry: all authenticated users (existing utilities access model); public form via existing `isPublicRoute` allowance.
- KPI targets + slot-time config: **admin-only** (like tier config) — `PUT` routes return 403 for non-admins; config UI gated in the management page / admin surface.

## Migration

One hand-written additive migration `drizzle/0014_electricity_tou_occupancy_kpi.sql` (per the project's manual-SQL workflow — see MEMORY): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `evening_reading` / `night_reading`, and `CREATE TABLE IF NOT EXISTS` for `daily_occupancy`, `utility_kpi_targets`, `electricity_slot_config`, with `--> statement-breakpoint` separators. Applied via Supabase SQL editor before pushing to `main`. TS schema in `src/lib/db/schema.ts` kept in sync manually.

## Out of Scope / Deferred

- Per-bucket KPIs (only total-daily for now).
- Per-property slot times (org-wide for now).
- Auto-task creation when KPI is missed (visual flagging only).
- Time-of-use **tariff pricing** by bucket — this design tracks usage buckets only; pricing stays on the existing tier model against total consumption.
