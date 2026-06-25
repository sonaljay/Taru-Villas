# Design: Water KPI Guest-Count Bands (unify with electricity)

**Date:** 2026-06-25
**Status:** Approved (design) — pending spec review
**Area:** Utility Metering — KPI configuration

## Summary

Replace water's **flat daily KPI target** with the same **guest-count-banded step function** electricity uses. The two utilities are unified onto **one bands table** (`electricity_kpi_bands` is generalized to `utility_kpi_bands` with a `utility_type` column), one query pair, one API route, and one config form. The now-unused flat-target path (`utility_kpi_targets` table, `/api/utilities/kpis` route, `utility-water-kpi-form`) is removed. The Long House's water bands are seeded with the default so its water KPI works immediately.

## Decisions (from brainstorming)

- **Generalize** the existing `electricity_kpi_bands` table into `utility_kpi_bands` (+ `utility_type`), rather than a parallel water table. DRY; removes dead code.
- **Fully replace** water's flat target (the `utility_kpi_targets` table is empty in prod — zero data to migrate; drop it).
- **Seed The Long House** water bands with the default (below) on apply.
- Water bands behave identically to electricity: per-day target = the band for that day's recorded guest count (`resolveBandTarget`), KPI achieved when daily usage ≤ target, admin-only.

## Default seed values (the form's "Set up bands" default)

| `min_guests` | Electricity (kWh) | Water (m³) |
|---|---|---|
| 0 | 224 | 7 |
| 1 | 305 | 10 |
| 6 | 331 | 10 |
| 11 | 390 | 11 |
| 16 | 434 | 11 |
| 21 | 483 | 11 |
| 26 | 501 | 4 |

(Water values from the user's formula `=IF(H9<1,7, IF(H9<6,10, IF(H9<11,10, IF(H9<16,11, IF(H9<21,11, IF(H9<26,11, 4))))))`.)

## Schema

### Generalize the bands table
`electricity_kpi_bands` → **`utility_kpi_bands`**:
- add `utility_type` (existing `utility_type` enum: water | electricity), `NOT NULL`; existing rows backfilled to `'electricity'`.
- drop unique `(property_id, min_guests)`; add unique `(property_id, utility_type, min_guests)`.
- columns otherwise unchanged: `id, property_id, min_guests, target_units, created_at, updated_at`.

TS: `electricityKpiBands` → `utilityKpiBands` (table `'utility_kpi_bands'`) with `utilityType` column + new unique; types `ElectricityKpiBand`/`NewElectricityKpiBand` → `UtilityKpiBand`/`NewUtilityKpiBand`.

### Drop the flat-target table
Remove `utility_kpi_targets` table + relations + `UtilityKpiTarget`/`NewUtilityKpiTarget` types (empty in prod). Migration `DROP TABLE IF EXISTS utility_kpi_targets`.

### Migration `drizzle/0016_utility_kpi_bands.sql` (hand-written, Supabase-applied)
1. `ALTER TABLE electricity_kpi_bands RENAME TO utility_kpi_bands;`
2. `ALTER TABLE utility_kpi_bands ADD COLUMN IF NOT EXISTS utility_type "utility_type";` then `UPDATE utility_kpi_bands SET utility_type='electricity' WHERE utility_type IS NULL;` then `ALTER COLUMN utility_type SET NOT NULL;`
3. drop old unique, add `unique (property_id, utility_type, min_guests)` (rename the constraint accordingly; guard renames so re-running is safe).
4. `DROP TABLE IF EXISTS utility_kpi_targets;`
5. **Seed TLH water bands** (idempotent `INSERT … ON CONFLICT (property_id, utility_type, min_guests) DO NOTHING`) for property `5351150a-080b-446b-a9d5-a2cb93109332`, utility_type `'water'`, the 7 water rows above.

Use guarded SQL (rename inside a `DO`/`IF EXISTS` check) so re-applying is safe. Statement-breakpoints between statements.

## Queries (`src/lib/db/queries/utilities.ts`)

- `getElectricityBands(propertyId)` → **`getKpiBands(propertyId, utilityType)`** (filter on `utility_type`, ascending by `min_guests`).
- `upsertElectricityBands(propertyId, bands)` → **`upsertKpiBands(propertyId, utilityType, bands)`** (replace-all within that property+utility in a transaction).
- **Remove** `getWaterKpiTarget` / `upsertWaterKpiTarget`.

## API Routes

- **`/api/utilities/kpi-bands`** (GET + admin-only PUT): both now take `utilityType` (`water|electricity`). GET `?propertyId&utilityType`; PUT body `{ propertyId, utilityType, bands }`. The duplicate-`minGuests` validation stays.
- **Remove** `/api/utilities/kpis` (the water flat-target route) — delete the file.

## Summary route + rollup

- **Summary** (`/api/utilities/summary`): fetch `getKpiBands(propertyId, utilityType)` for the selected utility (works for both). `buildDailyRows` uses `resolveBandTarget(guestCount, bandInputs)` for **both** electricity and water (drop the `waterTarget` flat path). `kpi.configured = bands.length > 0` for both utilities. (Admin-only KPI strip unchanged.)
- **Rollup** (`getOrgUtilityKpiRollup`): water path switches from the flat `utility_kpi_targets` lookup to `getKpiBands(propertyId, 'water')` + `resolveBandTarget(guestCount)` — identical to the electricity path (missed-entry penalty already electricity-only via slot status; water has no slot penalty).

## UI

- **`utility-kpi-bands-form.tsx`**: add a `utilityType: 'water' | 'electricity'` prop. Use it to pick the **default seed** (electricity vs water table above) and the **unit label** (`kWh` vs `m³`), and to send/read `utilityType` on the kpi-bands API. Card title e.g. "Electricity/Water KPI Bands ({unit} by guest count)".
- **Remove** `utility-water-kpi-form.tsx` (replaced by the bands form for water).
- **`utilities-page-client.tsx`** admin config block: render `UtilityKpiBandsForm` for **both** utilities (pass `utilityType`); electricity additionally keeps `UtilitySlotConfigForm`. Remove the `UtilityWaterKpiForm` import + usage.

## Seed for The Long House

Folded into the migration (step 5) as idempotent inserts, so applying `0016` both generalizes the schema and lights up TLH's water KPI. (If preferred, the same inserts can run as a separate idempotent script — same effect.)

## Ops / Deploy

One operator step: **apply `drizzle/0016_utility_kpi_bands.sql` in the Supabase SQL editor** before/at merge (it renames the table + drops the empty flat-target table + seeds TLH). The deployed code references `utility_kpi_bands`, so it 500s on KPI reads until applied. No env/cron changes.

## Out of Scope / Deferred

- Water for properties other than TLH (admins configure via the UI; default seed offered).
- Changing electricity band values (unchanged).
- Per-bucket water targets (water has no Day/Peak/Off-Peak split; single daily total vs band).
- Backfilling historical water KPI beyond what the existing readings + occupancy already support.
