# Design: Time-of-Use Electricity Readings, Occupancy Tracking & Daily KPIs

**Date:** 2026-06-24
**Status:** Approved (design) — pending implementation plan
**Area:** Utility Metering (Meter Readings)

## Summary

Extend the Meter Readings feature with three capabilities:

1. **Three electricity readings per day** at admin-configurable times (defaults 05:30 / 17:30 / 22:30), with an automatic **Day / Peak / Off-Peak** usage breakdown. Water is unchanged (single daily reading).
2. **Daily occupancy tracking** — guest count and staff count, recorded once per property per day.
3. **Daily usage KPIs** with dashboards showing **% of days the KPI was achieved vs not**, on both the per-property Utilities page and the org overview dashboard. The **electricity** KPI is a **guest-count-banded step function** (the day's target is looked up from that day's guest count); the **water** KPI is an optional flat target.

## Decisions (from brainstorming)

- **Electricity KPI type:** a **guest-count-banded step function**, configured **per property**, **fully editable** (admins add/remove rows and edit both the guest-count thresholds and the target values). The day's target = the band whose guest-count threshold the day's recorded guest count falls into. A day is *achieved* when total daily usage ≤ that target (lower is better). The default seed matches the user's spreadsheet formula (see §C).
- **Water KPI type:** an optional **flat daily target per property**. A day is *achieved* when total daily usage ≤ target.
- **Staff count is context-only** — it is recorded and displayed but does **not** feed any KPI (the formula keys on guest count alone).
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

### C. KPI targets — two tables

**Electricity — `electricity_kpi_bands`** (per property, guest-count step function; mirrors the `utility_rate_tiers` replace-all admin-config pattern). Each row is one band: `min_guests` is the inclusive lower bound; the band applies up to the next band's `min_guests` (the highest band is unbounded).

```
electricity_kpi_bands:
  id            uuid pk default random
  property_id   uuid not null -> properties.id (on delete cascade)
  min_guests    integer not null                 -- inclusive lower bound of the band
  target_units  numeric(12,2) not null            -- daily kWh allowance for this band
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()
  UNIQUE(property_id, min_guests)
```

**Target lookup:** for a day with `guestCount` guests, the target is `target_units` of the band with the **largest `min_guests` ≤ guestCount**. If no band qualifies (guestCount below the lowest band, which shouldn't happen when a `min_guests = 0` band exists), the target is null (day excluded).

**Default seed (offered in the config UI, not auto-inserted)** — matches the user's formula `=IF(I7<1,224, IF(I7<6,305, IF(I7<11,331, IF(I7<16,390, IF(I7<21,434, IF(I7<26,483, 501))))))`:

| `min_guests` | `target_units` |
|---|---|
| 0 | 224 |
| 1 | 305 |
| 6 | 331 |
| 11 | 390 |
| 16 | 434 |
| 21 | 483 |
| 26 | 501 |

**Water — `utility_kpi_targets`** (optional flat target per property):

```
utility_kpi_targets:
  id                  uuid pk default random
  property_id         uuid not null -> properties.id (on delete cascade)
  utility_type        utility_type not null            -- existing enum; only 'water' is used in v1
  daily_target_units  numeric(12,2) not null
  created_at          timestamptz not null default now()
  updated_at          timestamptz not null default now()
  UNIQUE(property_id, utility_type)
```

**Achievement rules:**
- **Electricity:** a day counts toward the denominator only when its **total is computable** (next-morning reading exists) **and** its **guest count is recorded** **and** at least one band is configured. Achieved when total ≤ banded target.
- **Water:** a day counts when total is computable and a flat target is configured. Achieved when total ≤ target.
- Days that are indeterminate (pending total, missing guest count, or no KPI configured) are **excluded from both numerator and denominator**.

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

- **New summary card:** "KPI Achieved — X% of days" over the selected window (evaluable days per the achievement rules in §C). Indeterminate days are excluded from the denominator.
- **Readings table additions (electricity):** Day / Peak / Off-Peak / Total columns, the **day's banded target**, a **KPI pass/fail badge**, and **guests / staff** columns. Water table gets Total (existing daily usage), the flat target, a KPI badge, and guests/staff. Colour: pass = emerald, fail = red, pending/indeterminate = muted.
- **Electricity KPI config (admin only):** a "KPI Bands" card mirroring the existing `UtilityTierForm` — a replace-all editor with add/remove rows (guest-count threshold + target kWh), seeded with the default bands. Water gets a simple flat-target input (admin only).

### Org overview dashboard

- **New portfolio rollup:** per property, water + electricity KPI-achievement % across the window — admin compliance-at-a-glance. Follows the existing dashboard query/section conventions in `src/lib/db/queries/dashboard.ts` and the overview page.

## Query Layer (`src/lib/db/queries/utilities.ts` + `dashboard.ts`)

- **Pure helpers in `src/lib/utilities/calculations.ts`** (no DB, testable by inspection per project convention):
  - `computeElectricityBreakdown(rows)` — given per-day rows (morning/evening/night) plus the next day's morning reading, returns per-day `{ date, day, peak, offPeak, total, pending }`.
  - `resolveBandTarget(guestCount, bands)` — returns the banded target via largest-`minGuests`-≤-guestCount lookup, or null.
  - `computeKpiAchievement(days)` — returns `{ evaluatedDays, achievedDays, pct }` applying the §C exclusion rules.
- A query helper joins readings (ordered by date, with next-day morning lookup for off-peak/total), `daily_occupancy`, and the KPI config, returning the per-day enriched rows the table + cards consume.
- Org rollup reuses the per-property achievement aggregation grouped by property (acceptable N+1 over ~10 properties, consistent with existing dashboard patterns).
- Occupancy, slot-config, electricity-band, and water-flat-target CRUD all live in `utilities.ts`.

## API Routes

- `POST /api/utilities/readings` & `/api/utilities/public`: accept an optional `slot` (`morning|evening|night`, electricity only; water ignores it) and optional `guestCount`/`staffCount` → upsert reading column + occupancy.
- `PUT /api/utilities/kpi-bands` (admin-only): replace-all electricity guest-count bands for a property — mirrors the `PUT /api/utilities/tiers` route. `GET` returns the property's bands.
- `PUT /api/utilities/kpis` (admin-only): set the water flat target for a property. `GET` returns it.
- `PUT /api/utilities/slot-config` (admin-only): set org-wide slot times. `GET` returns them (with defaults).
- Occupancy upsert is folded into the readings routes (and exposed via the summary read for display); no separate occupancy route in v1.

## Auth

- Reading + occupancy entry: all authenticated users (existing utilities access model); public form via existing `isPublicRoute` allowance.
- KPI config (bands + water flat) + slot-time config: **admin-only** (like tier config) — `PUT` routes return 403 for non-admins; config UI gated in the management page / admin surface.

## Migration

One hand-written additive migration `drizzle/0014_electricity_tou_occupancy_kpi.sql` (per the project's manual-SQL workflow — see MEMORY): `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `evening_reading` / `night_reading`, and `CREATE TABLE IF NOT EXISTS` for `daily_occupancy`, `electricity_kpi_bands`, `utility_kpi_targets`, `electricity_slot_config`, with `--> statement-breakpoint` separators. Applied via Supabase SQL editor before pushing to `main`. TS schema in `src/lib/db/schema.ts` kept in sync manually.

## Out of Scope / Deferred

- Per-bucket KPIs (only total-daily for now).
- Guest-count bands for **water** (water stays a flat target in v1).
- Per-property slot times (org-wide for now).
- Auto-task creation when KPI is missed (visual flagging only).
- Time-of-use **tariff pricing** by bucket — this design tracks usage buckets only; pricing stays on the existing tier model against total consumption.
