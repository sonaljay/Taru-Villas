# Admin Bulk CSV Import — Electricity, Water, Wastage

**Date:** 2026-06-26
**Status:** Design approved, pending spec review

## Goal

Let admins bulk-load historical/backfill data for three property-scoped datasets via CSV upload:

1. **Electricity readings** (cumulative meter values, 3 ToU slots) + optional daily occupancy
2. **Water readings** (cumulative meter value, morning slot only) + optional daily occupancy
3. **Daily wastage** (6 kg categories)

Each upload is scoped to a single property (the property whose page the admin is on — no property column in the CSV). Imports overwrite existing rows for matching dates (upsert), after a preview/confirm step.

## Non-Goals

- No multi-property CSVs (property is chosen by UI context).
- No occupancy columns in the wastage template (occupancy is not part of `waste_logs`).
- No changes to the normal manual-entry routes or their validation.
- No new npm dependencies (CSV parsing is hand-rolled).

## Key Decisions

| Decision | Choice |
|----------|--------|
| Property identification | Chosen in UI (admin is on that property's page); no property column in CSV |
| Duplicate dates | Overwrite (upsert), with a preview showing new vs. overwrite counts before commit |
| Occupancy | Both electricity AND water templates carry optional `guest_count`/`staff_count` columns that upsert the same per-day `daily_occupancy` row. Wastage has none. |
| Location | Admin-only "Bulk Import" card inside the property page — in the Utilities config section (utility-type-aware) and the Waste page |
| Electricity partial rows | Blank `evening`/`night` allowed — upsert only the filled slots |
| Validation bypass | Bulk import bypasses the ±15-min IST entry window and cumulative-order checks (intentional admin backfill path). Slot status = `'manual'`. |

## CSV Templates

All dates are `YYYY-MM-DD`, treated as the IST calendar day and stored directly in the Postgres `date` column. `note` is optional and may be quoted if it contains commas. Numeric values are non-negative; meter values are **cumulative** readings (identical semantics to manual entry).

### Electricity
```
date,morning,evening,night,guest_count,staff_count,note
2026-01-15,12450.50,12480.00,12510.25,8,4,
```
- `morning`/`evening`/`night` = cumulative meter values for each ToU slot. Any of the three may be blank (only filled slots are upserted).
- `guest_count`/`staff_count` optional integers; blank = leave occupancy untouched for that date.

### Water
```
date,reading,guest_count,staff_count,note
2026-01-15,8234.00,8,4,
```
- `reading` = cumulative meter value (stored in the morning slot — water uses morning only).
- `guest_count`/`staff_count` optional; blank = leave occupancy untouched.

### Wastage
```
date,paper_kg,glass_kg,plastic_kg,food_kg,metal_kg,electronic_kg,note
2026-01-15,2.5,1.0,3.2,5.5,0.8,0,
```
- All 6 category values are kg (numeric, default 0 if blank). `note` optional.

## Flow (two-phase, single endpoint with `dryRun`)

1. Admin clicks **Download template** (generated client-side, no server round-trip).
2. Admin fills the CSV, picks the file via `<input type="file">`.
3. Component parses CSV client-side (hand-rolled parser handling quoted fields), then POSTs the parsed rows to the bulk endpoint with `dryRun: true`.
4. Server validates and returns a **preview**: `{ total, newCount, overwriteCount, errors: [{ row, message }] }`. Nothing is written.
5. Component shows the preview (e.g. "32 rows: 28 new, 4 overwrite, 0 errors"). If there are hard errors they are listed and **Confirm** is disabled until the file is fixed and re-selected.
6. Admin clicks **Confirm import** → same payload with `dryRun: false` → server upserts inside a transaction and returns `{ imported, overwritten }`.
7. On success, toast + trigger the page's existing refresh (`fetchData` for Utilities, `router.refresh()` for Waste) so charts/tables update.

## Backend

### API routes
- `POST /api/utilities/bulk-import` — handles `type: 'electricity' | 'water'`.
- `POST /api/waste/bulk-import` — handles wastage.

Both:
- Require `profile.role === 'admin'` → 403 otherwise.
- Check property access via `getUserProperties` (admin = all access).
- Accept `{ propertyId, type?, rows, dryRun }` where `rows` is the parsed CSV (array of objects). Validated with Zod per row.
- Bypass the IST entry window and cumulative-order checks (admin backfill path). Slot status written as `'manual'`.

### New query helpers
- `queries/utilities.ts`:
  - `bulkUpsertReadings(propertyId, utilityType, rows)` — one upsert statement per row writing the relevant slot columns (morning for water; morning/evening/night for electricity, only non-null slots), `ON CONFLICT (property_id, utility_type, reading_date) DO UPDATE`. Returns counts of inserted vs updated.
  - `bulkUpsertOccupancy(propertyId, rows)` — upsert `daily_occupancy` on `(property_id, log_date)` for rows where guest/staff counts are present.
- `queries/waste.ts`:
  - `upsertWasteLog(data)` — **new** (wastage is currently insert-only). `ON CONFLICT (property_id, log_date) DO UPDATE` setting all 6 kg columns + note + `updated_at`.

All numeric values are passed to Drizzle as strings (matching existing convention). Counts of new vs. overwrite are computed by querying existing dates for the property before the upsert (used for both the preview and the final result message).

### Validation (per row)
Hard errors (row rejected, surfaced in preview):
- Malformed date (not `YYYY-MM-DD`) or invalid calendar date.
- Future date (after today, IST).
- Non-numeric or negative numeric value.
- Duplicate date within the uploaded file.

Everything valid is upserted on confirm (overwrite semantics per the duplicate decision).

## UI

Reusable client component `BulkImportCard` (in `src/components/admin/`):
- Props: `{ type: 'electricity' | 'water' | 'wastage', propertyId: string, onSuccess?: () => void }`.
- Renders a shadcn `Card` with: description, **Download template** button, file input, and (after parse) a preview `Table` + **Confirm import** button.
- Uses `toast` for success/error, disables buttons during submit.

Placement:
- `utilities-page-client.tsx`: inside the existing `{isAdmin && (...)}` config block, passing `type={utilityType}` so it matches the active water/electricity tab. `onSuccess={fetchData}`.
- `waste-page-client.tsx`: inside its admin-only section, `type="wastage"`, `onSuccess={() => router.refresh()}`.

## Files Touched

| File | Change |
|------|--------|
| `src/lib/db/queries/utilities.ts` | Add `bulkUpsertReadings`, `bulkUpsertOccupancy` |
| `src/lib/db/queries/waste.ts` | Add `upsertWasteLog` |
| `src/app/api/utilities/bulk-import/route.ts` | New POST route (admin-only, dryRun + commit) |
| `src/app/api/waste/bulk-import/route.ts` | New POST route (admin-only, dryRun + commit) |
| `src/components/admin/bulk-import-card.tsx` | New reusable component + CSV parse/template helpers |
| `src/components/admin/utilities-page-client.tsx` | Mount `BulkImportCard` in admin config block |
| `src/components/waste/waste-page-client.tsx` | Mount `BulkImportCard` in admin section |

No schema changes, no migration (all target tables and unique constraints already exist).

## Verification

- `npx tsc --noEmit` and `npm run build` pass.
- Manual: download each template, fill sample rows, dry-run preview shows correct new/overwrite/error counts, confirm writes rows, charts/tables refresh, re-importing the same file overwrites (no duplicates).
- Non-admin cannot see the card and the endpoints 403 for non-admins.
