# Design: Electricity Slot Entry Windows, Missed-Entry Auto-Fill & Penalty

**Date:** 2026-06-25
**Status:** Approved (design) — pending spec review
**Area:** Utility Metering / Meter Readings (electricity time-of-use)
**Builds on:** the shipped ToU/occupancy/KPI feature (`electricity-tou-occupancy-kpi`, merged PR #2). Reuses `electricity_slot_config` (org-wide slot times), `utility_meter_readings` (morning=`reading_value`, `evening_reading`, `night_reading`), `electricity_kpi_bands`, `daily_occupancy`, and the pure calculators in `src/lib/utilities/calculations.ts`.

## Summary

Three related changes:

1. **Slot entry windows + missed-entry auto-fill + penalty (the main feature).** Each electricity slot reading may only be entered within **±15 minutes** of its configured time (IST). If a slot's window closes with no manual entry, a cron job **auto-fills** the missing meter reading from the **30-day rolling average** of the corresponding usage bucket, and the day is **penalised**: it counts as **KPI not-achieved** ("Missed"), regardless of usage. Admins may **backfill** a slot after its window; doing so replaces the auto-filled value, re-evaluates the day on merit, and re-labels it **"edited (late)"**.
2. **Move occupancy entry into the reading form.** Guest + staff counts move from the standalone "Daily Occupancy" card into the "Add Reading" form (and stay on the public form), so whoever enters a reading can record occupancy in one step.
3. **Make KPI numbers fully admin-only.** Non-admins may enter readings but must not see KPI targets, achievement %, the target column, or the missed/failed penalty state — enforced in the API (summary route strips these for non-admins; KPI GET routes become admin-only), not just hidden in the UI. Slot times remain visible to all (needed as entry guidance).

## Decisions (from brainstorming)

- **Window:** **±15 min centered** on each slot time (e.g. 17:30 → 17:15–17:45), in **IST** (Asia/Kolkata). The ±15 half-width is a fixed constant in v1 (not configurable). Slot times themselves remain org-wide admin-configurable (`electricity_slot_config`).
- **Window scope:** public link + dashboard entry are windowed for everyone; **admins can backfill outside the window**.
- **Miss penalty:** a missed/auto-filled slot forces the **whole day to KPI not-achieved** ("Missed"), regardless of the averaged number.
- **Admin backfill:** replaces the auto-filled value, the day is re-evaluated normally, and the flag changes from **"missed"** to **"edited (late)"** (distinguishable; no hard auto-fail once corrected).
- **KPI visibility:** **fully admin-only** (numbers + penalty state). Non-admins enter readings only.
- **Auto-fill mapping:** synthesize the missing *cumulative reading* from the previous slot + the 30-day rolling average of the bucket beginning at that previous slot (see §3).
- **Scope:** electricity only (water has no slots/windows).

## 1. Per-Slot Provenance (schema)

Add three status columns to `utility_meter_readings`, each an enum `reading_slot_status` = `manual | autofilled | edited`, nullable (NULL = slot not yet recorded):

```
ALTER TYPE: CREATE TYPE "reading_slot_status" AS ENUM ('manual','autofilled','edited');
utility_meter_readings:
  + morning_status  reading_slot_status   -- null until the morning slot is recorded
  + evening_status  reading_slot_status
  + night_status    reading_slot_status
```

Semantics per slot:
- `manual` — entered by a person within the slot's window (the normal case; also water, which always uses `morning_status = manual`).
- `autofilled` — populated by the cron after the window closed unmanned.
- `edited` — entered/corrected by an admin **outside** the window (late backfill).

Migration `drizzle/0015_electricity_slot_status.sql` (hand-written, additive: `CREATE TYPE IF NOT EXISTS` via DO-block guard, `ADD COLUMN IF NOT EXISTS` ×3). Applied manually in Supabase.

**Derived day-level penalty:** a day is **"missed"** (and KPI auto-failed) iff any of its non-null slot statuses is `autofilled`. A day with an `edited` slot but no `autofilled` slot is **"edited (late)"** (evaluated on merit). A day with all `manual` slots is normal.

## 2. Window Enforcement (entry time)

A pure helper `resolveSlotWindow(nowIST, slotTimes)` in `src/lib/utilities/slot-windows.ts` returns, for a given IST instant, which slot (if any) is currently open (`now` within slot_time ± 15 min) — comparing minute-of-day, with the night/cross-midnight case handled. A second helper `isWithinWindow(slot, nowIST, slotTimes)` answers for a specific slot.

- **`POST /api/utilities/readings`** and **`POST /api/utilities/public`**: for electricity, determine the target slot (as today) and:
  - If the request is within that slot's window → store with `<slot>_status = 'manual'`.
  - If **outside** the window and the caller is **admin** → allow, store `<slot>_status = 'edited'`.
  - If **outside** the window and the caller is **non-admin** (or public) → **reject** (`409`/`422` with a clear message: "The {slot} reading window (HH:MM–HH:MM IST) is closed.").
  - Server time is converted to IST regardless of host timezone.
- **Entry forms** (`utility-reading-form.tsx`, `public-reading-form.tsx`): on mount/tick, compute the currently-open slot from `electricity_slot_config` + current IST; auto-select it and show "Window open: Evening (17:15–17:45 IST)". When no slot window is open, non-admin users see the slot selector disabled with "No reading window open right now" (and submit disabled for electricity); admins still get the full selector (backfill) with a note "Outside window — will be recorded as a late edit."

Water entry is unaffected (no window).

## 3. Auto-Fill Cron (the subtle part)

**Endpoint:** `GET/POST /api/cron/electricity-autofill`, Bearer `CRON_SECRET` (no Supabase auth — added to middleware `isPublicRoute`). Idempotent.

**Trigger:** a **Coolify Scheduled Task** runs it every ~15 minutes (cron `*/15 * * * *`). The handler is timezone-independent of the host: it computes "now" in IST internally and processes only slot windows that **closed earlier today (IST)**. Running every 15 min bounds the post-window detection latency; idempotency (only acts when the slot is still NULL) makes the exact cadence unimportant.

**Per property, per electricity slot whose window closed today with a NULL reading:**

Synthesize the missing cumulative meter reading = **previous slot's reading + 30-day rolling average of the bucket that begins at the previous slot**:

| Missed slot | Synthesized value | Bucket averaged |
|---|---|---|
| morning (05:30) | `yesterday.night + avg(OffPeak)` | Off-Peak (night→next morning) |
| evening (17:30) | `today.morning + avg(Day)` | Day (morning→evening) |
| night (22:30) | `today.evening + avg(Peak)` | Peak (evening→night) |

- Windows close in order (morning → evening → night), so by the time a later slot is processed the predecessor reading exists (manual or already auto-filled). For **morning**, the predecessor is **yesterday's night** reading.
- The **30-day rolling average** for a bucket = mean of that bucket's daily values over the trailing 30 days, computed from the existing `computeElectricityBreakdown`, **excluding any day that had an `autofilled` slot** (don't average synthesized values — prevents drift) and excluding null buckets.
- Set the synthesized slot's value and `<slot>_status = 'autofilled'`.
- **Insufficient history** (no usable bucket samples, or predecessor reading missing): leave the slot value NULL but **still create/mark the day as missed** by writing `<slot>_status = 'autofilled'` with a NULL reading. The day still auto-fails KPI; the breakdown shows "—" for the affected buckets. (Penalty applies even when we can't estimate a number.)
- The fill is recorded via an upsert that sets only the targeted slot column + status (same pattern as `upsertReading`), never overwriting a manual sibling slot.

Edge cases documented: a property with no `electricity_slot_config` uses the org defaults (05:30/17:30/22:30); a property that simply isn't metered on a given day still gets all three slots marked missed once their windows pass (this is the intended penalty — if that's too aggressive for unoccupied properties, a future opt-out flag per property can be added; out of scope for v1).

## 4. KPI Penalty Integration

The pure layer gains a small helper and the consumers honour slot status:

- `dayPenaltyState(statuses: {morning,evening,night})` → `'missed' | 'edited' | 'normal'` (missed if any `autofilled`; else edited if any `edited`; else normal).
- In the **summary route** and **org rollup**, when building each electricity day's `{ total, target }` for `computeKpiAchievement`, a `missed` day is forced to **not-achieved** (e.g. pass `forcedFail: true`, or set `achieved=false` directly and still count it in the denominator). `computeKpiAchievement` is extended to accept a per-day `missed` flag that counts the day as evaluated-and-failed even when total/target would otherwise be indeterminate.
- The enriched `dailyRows` gain `penalty: 'missed' | 'edited' | 'normal'` and per-slot `statuses`, so the table can render badges.

## 5. Occupancy Moved Into the Reading Form (change #2)

- **`utility-reading-form.tsx`** (management "Add Reading"): add optional **Guests** and **Staff** number inputs, prefilled from the selected date's current `daily_occupancy` (fetched/passed in), included in the reading `POST` body (the route already upserts occupancy when present). On submit they upsert that date's occupancy (last-write-wins; prefilled so they aren't re-typed across the 3 daily electricity submits).
- **Remove** the standalone `UtilityOccupancyForm` card and its wiring from `utilities-page-client.tsx` (delete the component or leave it unused — prefer delete). The dedicated `POST /api/utilities/occupancy` route may remain (harmless) or be removed; prefer removing it if nothing else uses it.
- **`public-reading-form.tsx`** already has inline guest/staff fields (from the shipped feature) — no change beyond consistency.

## 6. KPI Visibility — Fully Admin-Only (change #3)

- **`GET /api/utilities/kpi-bands`** and **`GET /api/utilities/kpis`**: change from property-access to **admin-only** (403 for non-admins). (`PUT`s already admin-only.) `slot-config` GET **stays** accessible to all authenticated users (entry forms need the times).
- **`GET /api/utilities/summary`**: when the caller is **not admin**, omit KPI fields from the response — strip `kpi` and, in each `dailyRows` entry, `target`, `achieved`, and `penalty` (or null them). Non-admins still receive readings, breakdown, occupancy, and `pending`. (Compute-then-strip is fine; the point is the numbers never reach a non-admin client.)
- **`utilities-page-client.tsx` / table / summary cards:** gate the **KPI achievement card**, the **Target column**, and the **KPI/penalty badge** behind `isAdmin`. Non-admins see Date / Meter / Day / Peak / Off-Peak / Total / Guests / Staff only. (Already `isAdmin`-gated: the bands/water/slot config cards.)
- Public `/u/[slug]` never showed KPI numbers — unaffected.

## 7. Ops / Middleware

- `src/middleware.ts`: add `/api/cron/electricity-autofill` to the Bearer-`CRON_SECRET` public-route allowance (it must bypass Supabase auth).
- **Coolify Scheduled Task** (documented for the operator, not code): a recurring task (`*/15 * * * *`) that runs `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://tvpl.morpheusds.com/api/cron/electricity-autofill`. Requires `CRON_SECRET` to be set in Coolify env (currently unset per MEMORY) — operator action.
- No `vercel.json` (deploy is Coolify).

## Migration

`drizzle/0015_electricity_slot_status.sql` — hand-written, additive: create the `reading_slot_status` enum (guarded) + three `ADD COLUMN IF NOT EXISTS` status columns. Applied via Supabase SQL editor before the deploy. TS schema kept in sync manually.

## Out of Scope / Deferred

- Configurable window half-width (fixed ±15 min in v1).
- Per-property opt-out of auto-fill/penalty (e.g. for intentionally unoccupied/closed properties).
- Windows/auto-fill for **water** (electricity only).
- Back-filling penalties for historical days before this feature ships (cron only acts on windows that close after deploy).
- Notifications/alerts on a missed entry (visual penalty only).
- A standalone "missed-entry %" report metric (the penalty is folded into the existing KPI achievement %; a separate miss metric was not chosen).
