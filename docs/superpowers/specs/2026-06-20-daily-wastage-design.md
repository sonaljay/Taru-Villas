# Daily Wastage — Design Spec

**Date:** 2026-06-20
**Status:** Approved
**Author:** Engineering

## Overview

A per-property, per-day log of waste generated across six fixed categories, each
measured in kilograms. Modeled closely on the existing **Meter Readings**
(utilities) feature: a property picker page, a property-scoped management page,
summary cards, and trend charts. There is **no cost/pricing**, **no OCR/scan**,
and **no public (unauthenticated) route**.

### Waste categories (fixed, v1)

| Category | Column | Unit |
|----------|--------|------|
| Paper | `paper_kg` | kg |
| Glass | `glass_kg` | kg |
| Polythene & Plastic | `plastic_kg` | kg |
| Food | `food_kg` | kg |
| Metal | `metal_kg` | kg |
| Electronic Waste | `electronic_kg` | kg |

### Decisions (confirmed)

- **Entry model:** one combined daily entry — a single row per `(property, date)`
  with one numeric column per category.
- **Access:** all authenticated users (incl. staff) can log waste for any
  property they can access — same as Meter Readings.
- **Analytics:** summary cards (per-category month totals + grand total) plus
  trend charts (last 6 months).
- **Categories:** fixed list in v1 (hard-coded columns, not an enum or
  admin-configurable list).

## Data Model

New table `waste_logs`:

```
waste_logs
  id            uuid       primary key, default random
  property_id   uuid       not null → properties.id (ON DELETE cascade)
  log_date      date       not null
  paper_kg      numeric(10,2) not null default 0
  glass_kg      numeric(10,2) not null default 0
  plastic_kg    numeric(10,2) not null default 0   -- Polythene & Plastic
  food_kg       numeric(10,2) not null default 0
  metal_kg      numeric(10,2) not null default 0
  electronic_kg numeric(10,2) not null default 0
  note          text       null
  recorded_by   uuid       null → profiles.id (ON DELETE set null)
  created_at    timestamptz not null default now()
  updated_at    timestamptz not null default now()

  UNIQUE (property_id, log_date)
```

Rationale for fixed columns (vs an enum + one-row-per-type like a generic
metering model): the category list is fixed and the form captures all six at
once, so a single row per day keeps entry, the table, and the summary trivial.

Drizzle table + relations added to `src/lib/db/schema.ts` (relations: `property`,
`recorder`). Type exports: `WasteLog`, `NewWasteLog`.

### Migration

Per the project's manual-migration workflow (Drizzle migration history is broken
— see MEMORY): hand-write `drizzle/0013_waste_logs.sql` using the existing
convention (`IF NOT EXISTS`, `--> statement-breakpoint`), apply via the Supabase
SQL editor, and commit the file. The TS schema stays in sync via the manual
apply.

## Queries — `src/lib/db/queries/waste.ts`

- `getWasteLogsForMonth(propertyId, year, month)` — rows for the month, ascending
  by `log_date`, enriched with `recorderName`.
- `getWasteLogById(id)`
- `createWasteLog(data)` — `.returning()`
- `updateWasteLog(id, data)` — sets `updatedAt`, `.returning()`
- `deleteWasteLog(id)` — `.returning()`
- `getWasteSummaryForMonth(propertyId, year, month)` — per-category sums + grand
  total for the month.
- `getWasteHistory(propertyId, months = 6)` — per-category monthly totals for the
  trend chart (grouped by `YYYY-MM`).

## API — `src/app/api/waste/`

All routes use `getProfile()` for auth and a property-access check via
`getUserProperties()` (admins = all access).

- `route.ts`
  - `GET` — list by `propertyId` + `year` + `month`.
  - `POST` — create a daily log. Validates kg values are numbers `>= 0`. On a
    duplicate `(property, date)` (unique violation, PG code `23505`) returns a
    friendly **409** instructing the user to edit the existing day's row.
- `[id]/route.ts`
  - `PATCH` — update an existing log (awaits `context.params`).
  - `DELETE` — delete a log (awaits `context.params`).
- `summary/route.ts`
  - `GET` — month summary + 6-month history for cards and charts.

Zod v4 schemas; numeric kg fields coerced/validated as non-negative numbers and
stored as strings (numeric columns).

## Pages

- `/waste` — property picker page (cards), mirrors `/utilities`. Uses
  `getPropertiesForUser`. Added to `mainNavItems`.
- `/properties/[propertyId]/waste` — management page (server component). Awaits
  `params`, `requireAuth()`, non-admin property-access check via
  `getUserProperties()`, then renders `WastePageClient`.

Both pages export `const dynamic = 'force-dynamic'`.

## Components — `src/components/waste/`

- `waste-page-client.tsx` — month selector, summary cards, charts, log table, and
  an "Add entry" dialog. Fetches summary + logs on mount and on month change.
- `waste-log-form.tsx` — combined daily entry: date picker + six kg inputs +
  optional note. Used for both create and edit.
- `waste-log-table.tsx` — columns: Date | Paper | Glass | Plastic | Food | Metal
  | E-Waste | **Total** | Recorded by | edit/delete actions.
- `waste-summary-cards.tsx` — per-category month totals + grand total.
- `waste-charts.tsx` — Recharts trend over the last 6 months.

Components follow established conventions: `'use client'`, React Hook Form,
Sonner toasts, shadcn dialog/alert-dialog patterns, `router.refresh()` after
mutations.

## Wiring

- **Sidebar** (`src/components/layout/app-sidebar.tsx`): add
  `{ title: 'Daily Wastage', href: '/waste', icon: Trash2 }` to `mainNavItems`.
- **Breadcrumb** (`src/components/layout/header.tsx`): add
  `'waste': 'Daily Wastage'`.
- **Middleware:** no change (no public route).

## Editing existing days

Because `(property_id, log_date)` is unique, re-entering a date that already has
a log is done via the table's edit action, not a second create. A `POST` on a
duplicate date returns a friendly 409.

## Out of scope (v1)

- Cost/pricing tiers.
- Camera/OCR capture.
- Public unauthenticated entry page.
- Admin-configurable categories.
- Auto-task creation from waste thresholds.

## Verification

- `npx tsc --noEmit` and `npm run build` pass.
- `force-dynamic` on both new pages.
- All mutations use `.returning()`.
- Auth: pages use `requireAuth()`, APIs use `getProfile()` + property checks.
- Zod schemas avoid strict validators; kg fields non-negative.
