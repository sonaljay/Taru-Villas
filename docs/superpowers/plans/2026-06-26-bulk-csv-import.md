# Admin Bulk CSV Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins bulk-load historical electricity readings, water readings, and daily wastage from CSV files via an admin-only card on the property Utilities and Waste pages, with a preview/confirm (upsert) step.

**Architecture:** Pure CSV parse + template helpers live in a new `src/lib/utilities/csv.ts`. A reusable `BulkImportCard` client component parses the file client-side and POSTs parsed rows to one of two new admin-only API routes (`/api/utilities/bulk-import`, `/api/waste/bulk-import`) with a `dryRun` flag — `dryRun: true` returns a validation preview (new/overwrite/error counts), `dryRun: false` commits via new transactional upsert query helpers. The bulk path intentionally bypasses the ±15-min IST entry window and cumulative-order checks the normal manual-entry route enforces (admin backfill).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM (postgres.js), Zod v4, shadcn/ui, Sonner. No new npm dependencies — CSV parsing is hand-rolled.

## Global Constraints

- Database client MUST stay `{ prepare: false }` — never touch `src/lib/db/index.ts`.
- Zod: use plain `z.string()` (no strict `.url()`); import `import { z } from 'zod'` to match the two routes being mirrored (`waste/route.ts`, `utilities/readings/route.ts` both use `'zod'`).
- All Drizzle numeric columns are written as **strings** (e.g. `'12450.50'`), never numbers.
- Slot status for bulk-imported readings = `'manual'`.
- Dates are `YYYY-MM-DD`, stored directly in the Postgres `date` column; "today" for the future-date check = IST via `currentISTDate()` from `src/lib/utilities/slot-windows.ts`.
- API auth: `getProfile()` → 401 if null; `profile.role !== 'admin'` → 403. Then `checkPropertyAccess` (copy the existing helper from the route being mirrored).
- No test framework exists in this project. Per-task verification = `npx tsc --noEmit` passing, plus the manual dry-run check in the final task. Do NOT add a test runner.
- Every page that fetches data already has `export const dynamic = 'force-dynamic'` — no new pages are created, so nothing to add there.
- All mutations use `.returning()` where a row is needed.

---

### Task 1: Pure CSV library (parse + templates)

**Files:**
- Create: `src/lib/utilities/csv.ts`

**Interfaces:**
- Produces:
  - `type ImportType = 'electricity' | 'water' | 'wastage'`
  - `TEMPLATE_HEADERS: Record<ImportType, string[]>`
  - `buildTemplate(type: ImportType): string` — returns CSV text (header row + one example data row)
  - `parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] }` — handles quoted fields containing commas, trims a trailing newline, skips fully-blank lines
  - `isValidIsoDate(s: string): boolean` — true only for a real `YYYY-MM-DD` calendar date

- [ ] **Step 1: Create the file with full contents**

```typescript
// src/lib/utilities/csv.ts
// Pure helpers for bulk CSV import — no DB, no React, no Node-only APIs.

export type ImportType = 'electricity' | 'water' | 'wastage'

export const TEMPLATE_HEADERS: Record<ImportType, string[]> = {
  electricity: ['date', 'morning', 'evening', 'night', 'guest_count', 'staff_count', 'note'],
  water: ['date', 'reading', 'guest_count', 'staff_count', 'note'],
  wastage: ['date', 'paper_kg', 'glass_kg', 'plastic_kg', 'food_kg', 'metal_kg', 'electronic_kg', 'note'],
}

const TEMPLATE_EXAMPLE: Record<ImportType, string[]> = {
  electricity: ['2026-01-15', '12450.50', '12480.00', '12510.25', '8', '4', ''],
  water: ['2026-01-15', '8234.00', '8', '4', ''],
  wastage: ['2026-01-15', '2.5', '1.0', '3.2', '5.5', '0.8', '0', ''],
}

/** Build template CSV text (header + one example row) for a given import type. */
export function buildTemplate(type: ImportType): string {
  const header = TEMPLATE_HEADERS[type].join(',')
  const example = TEMPLATE_EXAMPLE[type].join(',')
  return `${header}\n${example}\n`
}

/** Parse a single CSV line into fields, honoring double-quoted fields with embedded commas/quotes. */
function parseLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields.map((f) => f.trim())
}

/**
 * Parse CSV text into a header list and an array of row objects keyed by header.
 * Strips a UTF-8 BOM, normalizes CRLF, and skips fully-blank lines.
 */
export function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const lines = clean.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length === 0) return { headers: [], rows: [] }

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i])
    const row: Record<string, string> = {}
    headers.forEach((h, idx) => {
      row[h] = fields[idx] ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

/** True only for a real YYYY-MM-DD calendar date (e.g. rejects 2026-02-30). */
export function isValidIsoDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/utilities/csv.ts
git commit -m "feat(utilities): pure CSV parse + template helpers for bulk import"
```

---

### Task 2: Utilities bulk-upsert query helpers

**Files:**
- Modify: `src/lib/db/queries/utilities.ts` (add imports for `inArray`; add two functions after `upsertOccupancy`, around line 250)

**Interfaces:**
- Consumes: existing `db`, `utilityMeterReadings`, `dailyOccupancy` (already imported in this file)
- Produces:
  - `getExistingReadingDates(propertyId: string, utilityType: 'water' | 'electricity', dates: string[]): Promise<Set<string>>`
  - `interface BulkReadingRow { readingDate: string; morning: string | null; evening: string | null; night: string | null; guestCount: number | null; staffCount: number | null; note: string | null }`
  - `bulkUpsertReadings(propertyId: string, utilityType: 'water' | 'electricity', rows: BulkReadingRow[], recordedBy: string | null): Promise<void>` — upserts each reading (only non-null slots) and, when guest/staff present, the matching `daily_occupancy` row, all inside ONE transaction.

- [ ] **Step 1: Add `inArray` to the drizzle-orm import**

Change the first line of `src/lib/db/queries/utilities.ts` from:

```typescript
import { eq, and, asc, desc, gte, lte, lt, sql } from 'drizzle-orm'
```

to:

```typescript
import { eq, and, asc, desc, gte, lte, lt, sql, inArray } from 'drizzle-orm'
```

- [ ] **Step 2: Add the two helpers**

Insert immediately after the `upsertOccupancy` function (just before the `// Rate Tiers` divider comment, ~line 250):

```typescript
// ---------------------------------------------------------------------------
// Bulk import (admin backfill — bypasses entry-window & cumulative checks)
// ---------------------------------------------------------------------------

/** Which of the given dates already have a reading row for this property/utility. */
export async function getExistingReadingDates(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  dates: string[]
): Promise<Set<string>> {
  if (dates.length === 0) return new Set()
  const rows = await db
    .select({ readingDate: utilityMeterReadings.readingDate })
    .from(utilityMeterReadings)
    .where(
      and(
        eq(utilityMeterReadings.propertyId, propertyId),
        eq(utilityMeterReadings.utilityType, utilityType),
        inArray(utilityMeterReadings.readingDate, dates)
      )
    )
  return new Set(rows.map((r) => r.readingDate))
}

export interface BulkReadingRow {
  readingDate: string
  morning: string | null
  evening: string | null
  night: string | null
  guestCount: number | null
  staffCount: number | null
  note: string | null
}

/**
 * Bulk upsert meter readings (and optional occupancy) for one property/utility.
 * Only non-null slots are written; existing slots are preserved on conflict.
 * Occupancy is upserted only when at least one of guest/staff is provided
 * (a blank counterpart defaults to 0). All writes run in a single transaction.
 */
export async function bulkUpsertReadings(
  propertyId: string,
  utilityType: 'water' | 'electricity',
  rows: BulkReadingRow[],
  recordedBy: string | null
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      const insertValues = {
        propertyId,
        utilityType,
        readingDate: r.readingDate,
        readingValue: r.morning,
        eveningReading: r.evening,
        nightReading: r.night,
        morningStatus: (r.morning !== null ? 'manual' : null) as 'manual' | null,
        eveningStatus: (r.evening !== null ? 'manual' : null) as 'manual' | null,
        nightStatus: (r.night !== null ? 'manual' : null) as 'manual' | null,
        note: r.note,
        recordedBy,
      }

      const set: Record<string, unknown> = { updatedAt: new Date() }
      if (r.morning !== null) {
        set.readingValue = r.morning
        set.morningStatus = 'manual'
      }
      if (r.evening !== null) {
        set.eveningReading = r.evening
        set.eveningStatus = 'manual'
      }
      if (r.night !== null) {
        set.nightReading = r.night
        set.nightStatus = 'manual'
      }
      if (r.note !== null) set.note = r.note

      await tx
        .insert(utilityMeterReadings)
        .values(insertValues)
        .onConflictDoUpdate({
          target: [
            utilityMeterReadings.propertyId,
            utilityMeterReadings.utilityType,
            utilityMeterReadings.readingDate,
          ],
          set,
        })

      if (r.guestCount !== null || r.staffCount !== null) {
        await tx
          .insert(dailyOccupancy)
          .values({
            propertyId,
            logDate: r.readingDate,
            guestCount: r.guestCount ?? 0,
            staffCount: r.staffCount ?? 0,
            recordedBy,
          })
          .onConflictDoUpdate({
            target: [dailyOccupancy.propertyId, dailyOccupancy.logDate],
            set: {
              guestCount: r.guestCount ?? 0,
              staffCount: r.staffCount ?? 0,
              updatedAt: new Date(),
            },
          })
      }
    }
  })
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (If the enum-cast on `morningStatus` complains, the `as 'manual' | null` annotations resolve it.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/utilities.ts
git commit -m "feat(utilities): bulkUpsertReadings + getExistingReadingDates for admin import"
```

---

### Task 3: Waste bulk-upsert query helpers

**Files:**
- Modify: `src/lib/db/queries/waste.ts` (add `inArray` to import; add two functions after `deleteWasteLog`, ~line 106)

**Interfaces:**
- Consumes: existing `db`, `wasteLogs` (already imported)
- Produces:
  - `getExistingWasteDates(propertyId: string, dates: string[]): Promise<Set<string>>`
  - `interface BulkWasteRow { logDate: string; paperKg: string; glassKg: string; plasticKg: string; foodKg: string; metalKg: string; electronicKg: string; note: string | null }`
  - `bulkUpsertWasteLogs(propertyId: string, rows: BulkWasteRow[], recordedBy: string | null): Promise<void>` — upserts each row on `(propertyId, logDate)` in one transaction.

- [ ] **Step 1: Add `inArray` to the drizzle-orm import**

Change the first line of `src/lib/db/queries/waste.ts` from:

```typescript
import { eq, and, asc, gte, lte, sql } from 'drizzle-orm'
```

to:

```typescript
import { eq, and, asc, gte, lte, sql, inArray } from 'drizzle-orm'
```

- [ ] **Step 2: Add the two helpers**

Insert immediately after `deleteWasteLog` (~line 106, before `getWasteSummaryForMonth`):

```typescript
/** Which of the given dates already have a waste log for this property. */
export async function getExistingWasteDates(
  propertyId: string,
  dates: string[]
): Promise<Set<string>> {
  if (dates.length === 0) return new Set()
  const rows = await db
    .select({ logDate: wasteLogs.logDate })
    .from(wasteLogs)
    .where(and(eq(wasteLogs.propertyId, propertyId), inArray(wasteLogs.logDate, dates)))
  return new Set(rows.map((r) => r.logDate))
}

export interface BulkWasteRow {
  logDate: string
  paperKg: string
  glassKg: string
  plasticKg: string
  foodKg: string
  metalKg: string
  electronicKg: string
  note: string | null
}

/** Bulk upsert daily waste logs on (propertyId, logDate) in one transaction. */
export async function bulkUpsertWasteLogs(
  propertyId: string,
  rows: BulkWasteRow[],
  recordedBy: string | null
): Promise<void> {
  await db.transaction(async (tx) => {
    for (const r of rows) {
      await tx
        .insert(wasteLogs)
        .values({
          propertyId,
          logDate: r.logDate,
          paperKg: r.paperKg,
          glassKg: r.glassKg,
          plasticKg: r.plasticKg,
          foodKg: r.foodKg,
          metalKg: r.metalKg,
          electronicKg: r.electronicKg,
          note: r.note,
          recordedBy,
        })
        .onConflictDoUpdate({
          target: [wasteLogs.propertyId, wasteLogs.logDate],
          set: {
            paperKg: r.paperKg,
            glassKg: r.glassKg,
            plasticKg: r.plasticKg,
            foodKg: r.foodKg,
            metalKg: r.metalKg,
            electronicKg: r.electronicKg,
            note: r.note,
            updatedAt: new Date(),
          },
        })
    }
  })
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/waste.ts
git commit -m "feat(waste): bulkUpsertWasteLogs + getExistingWasteDates for admin import"
```

---

### Task 4: Utilities bulk-import API route

**Files:**
- Create: `src/app/api/utilities/bulk-import/route.ts`

**Interfaces:**
- Consumes: `getProfile`, `getUserProperties` (`@/lib/auth/guards`); `getExistingReadingDates`, `bulkUpsertReadings`, `BulkReadingRow` (`@/lib/db/queries/utilities`); `isValidIsoDate` (`@/lib/utilities/csv`); `currentISTDate` (`@/lib/utilities/slot-windows`)
- Produces: `POST` handler. Request body `{ propertyId: string; utilityType: 'water'|'electricity'; dryRun: boolean; rows: Record<string,string>[] }`. Response `{ total: number; newCount: number; overwriteCount: number; errorCount: number; errors: { row: number; message: string }[]; committed: boolean; imported: number }`.

- [ ] **Step 1: Create the route with full contents**

```typescript
// src/app/api/utilities/bulk-import/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getExistingReadingDates,
  bulkUpsertReadings,
  type BulkReadingRow,
} from '@/lib/db/queries/utilities'
import { isValidIsoDate } from '@/lib/utilities/csv'
import { currentISTDate } from '@/lib/utilities/slot-windows'

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

const bodySchema = z.object({
  propertyId: z.string().uuid(),
  utilityType: z.enum(['water', 'electricity']),
  dryRun: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
})

/** Parse an optional non-negative numeric cell. Returns { value } or { error }. */
function parseValue(raw: string): { value: string | null; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: null }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: null, error: `"${s}" is not a number` }
  if (n < 0) return { value: null, error: `"${s}" must be ≥ 0` }
  return { value: s }
}

/** Parse an optional non-negative integer count. Returns { value } or { error }. */
function parseCount(raw: string): { value: number | null; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: null }
  const n = Number(s)
  if (!Number.isInteger(n) || n < 0) return { value: null, error: `"${s}" must be a whole number ≥ 0` }
  return { value: n }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { propertyId, utilityType, dryRun, rows } = parsed.data

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const today = currentISTDate()
    const errors: { row: number; message: string }[] = []
    const valid: BulkReadingRow[] = []
    const seen = new Set<string>()

    rows.forEach((row, i) => {
      const lineNo = i + 2 // +1 for header, +1 for 1-based
      const date = (row['date'] ?? '').trim()

      if (!isValidIsoDate(date)) {
        errors.push({ row: lineNo, message: `Invalid date "${date}" (expected YYYY-MM-DD)` })
        return
      }
      if (date > today) {
        errors.push({ row: lineNo, message: `Date ${date} is in the future` })
        return
      }
      if (seen.has(date)) {
        errors.push({ row: lineNo, message: `Duplicate date ${date} in file` })
        return
      }

      const morning = parseValue(row['morning'] ?? row['reading'] ?? '')
      const evening = utilityType === 'electricity' ? parseValue(row['evening'] ?? '') : { value: null }
      const night = utilityType === 'electricity' ? parseValue(row['night'] ?? '') : { value: null }
      const guest = parseCount(row['guest_count'] ?? '')
      const staff = parseCount(row['staff_count'] ?? '')

      const cellError = morning.error || evening.error || night.error || guest.error || staff.error
      if (cellError) {
        errors.push({ row: lineNo, message: cellError })
        return
      }
      if (morning.value === null && evening.value === null && night.value === null) {
        errors.push({ row: lineNo, message: 'Row has no reading value' })
        return
      }

      const note = (row['note'] ?? '').trim()
      if (note.length > 500) {
        errors.push({ row: lineNo, message: 'Note exceeds 500 characters' })
        return
      }

      seen.add(date)
      valid.push({
        readingDate: date,
        morning: morning.value,
        evening: evening.value,
        night: night.value,
        guestCount: guest.value,
        staffCount: staff.value,
        note: note === '' ? null : note,
      })
    })

    const existing = await getExistingReadingDates(
      propertyId,
      utilityType,
      valid.map((v) => v.readingDate)
    )
    const overwriteCount = valid.filter((v) => existing.has(v.readingDate)).length
    const newCount = valid.length - overwriteCount

    const preview = {
      total: rows.length,
      newCount,
      overwriteCount,
      errorCount: errors.length,
      errors,
      committed: false,
      imported: 0,
    }

    if (dryRun) return NextResponse.json(preview)

    if (errors.length > 0) {
      return NextResponse.json(
        { ...preview, error: 'Fix all errors before importing' },
        { status: 400 }
      )
    }

    await bulkUpsertReadings(propertyId, utilityType, valid, profile.id)
    return NextResponse.json({ ...preview, committed: true, imported: valid.length })
  } catch (error) {
    console.error('POST /api/utilities/bulk-import error:', error)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/utilities/bulk-import/route.ts
git commit -m "feat(utilities): admin bulk-import API route (dry-run preview + commit)"
```

---

### Task 5: Waste bulk-import API route

**Files:**
- Create: `src/app/api/waste/bulk-import/route.ts`

**Interfaces:**
- Consumes: `getProfile`, `getUserProperties`; `getExistingWasteDates`, `bulkUpsertWasteLogs`, `BulkWasteRow` (`@/lib/db/queries/waste`); `isValidIsoDate` (`@/lib/utilities/csv`); `currentISTDate` (`@/lib/utilities/slot-windows`)
- Produces: `POST` handler. Body `{ propertyId: string; dryRun: boolean; rows: Record<string,string>[] }`. Response shape identical to Task 4.

- [ ] **Step 1: Create the route with full contents**

```typescript
// src/app/api/waste/bulk-import/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import {
  getExistingWasteDates,
  bulkUpsertWasteLogs,
  type BulkWasteRow,
} from '@/lib/db/queries/waste'
import { isValidIsoDate } from '@/lib/utilities/csv'
import { currentISTDate } from '@/lib/utilities/slot-windows'

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

const bodySchema = z.object({
  propertyId: z.string().uuid(),
  dryRun: z.boolean(),
  rows: z.array(z.record(z.string(), z.string())).max(2000),
})

const KG_COLUMNS = ['paper_kg', 'glass_kg', 'plastic_kg', 'food_kg', 'metal_kg', 'electronic_kg'] as const

/** Parse an optional non-negative kg cell; blank defaults to '0'. */
function parseKg(raw: string): { value: string; error?: string } {
  const s = (raw ?? '').trim()
  if (s === '') return { value: '0' }
  const n = Number(s)
  if (!Number.isFinite(n)) return { value: '0', error: `"${s}" is not a number` }
  if (n < 0) return { value: '0', error: `"${s}" must be ≥ 0` }
  return { value: s }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { propertyId, dryRun, rows } = parsed.data

    const hasAccess = await checkPropertyAccess(profile, propertyId)
    if (!hasAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const today = currentISTDate()
    const errors: { row: number; message: string }[] = []
    const valid: BulkWasteRow[] = []
    const seen = new Set<string>()

    rows.forEach((row, i) => {
      const lineNo = i + 2
      const date = (row['date'] ?? '').trim()

      if (!isValidIsoDate(date)) {
        errors.push({ row: lineNo, message: `Invalid date "${date}" (expected YYYY-MM-DD)` })
        return
      }
      if (date > today) {
        errors.push({ row: lineNo, message: `Date ${date} is in the future` })
        return
      }
      if (seen.has(date)) {
        errors.push({ row: lineNo, message: `Duplicate date ${date} in file` })
        return
      }

      const parsedKg = KG_COLUMNS.map((c) => parseKg(row[c] ?? ''))
      const kgError = parsedKg.find((p) => p.error)?.error
      if (kgError) {
        errors.push({ row: lineNo, message: kgError })
        return
      }

      const note = (row['note'] ?? '').trim()
      if (note.length > 500) {
        errors.push({ row: lineNo, message: 'Note exceeds 500 characters' })
        return
      }

      seen.add(date)
      valid.push({
        logDate: date,
        paperKg: parsedKg[0].value,
        glassKg: parsedKg[1].value,
        plasticKg: parsedKg[2].value,
        foodKg: parsedKg[3].value,
        metalKg: parsedKg[4].value,
        electronicKg: parsedKg[5].value,
        note: note === '' ? null : note,
      })
    })

    const existing = await getExistingWasteDates(propertyId, valid.map((v) => v.logDate))
    const overwriteCount = valid.filter((v) => existing.has(v.logDate)).length
    const newCount = valid.length - overwriteCount

    const preview = {
      total: rows.length,
      newCount,
      overwriteCount,
      errorCount: errors.length,
      errors,
      committed: false,
      imported: 0,
    }

    if (dryRun) return NextResponse.json(preview)

    if (errors.length > 0) {
      return NextResponse.json(
        { ...preview, error: 'Fix all errors before importing' },
        { status: 400 }
      )
    }

    await bulkUpsertWasteLogs(propertyId, valid, profile.id)
    return NextResponse.json({ ...preview, committed: true, imported: valid.length })
  } catch (error) {
    console.error('POST /api/waste/bulk-import error:', error)
    return NextResponse.json({ error: 'Failed to import' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/waste/bulk-import/route.ts
git commit -m "feat(waste): admin bulk-import API route (dry-run preview + commit)"
```

---

### Task 6: BulkImportCard component

**Files:**
- Create: `src/components/admin/bulk-import-card.tsx`

**Interfaces:**
- Consumes: `buildTemplate`, `parseCsv`, `ImportType` (`@/lib/utilities/csv`); the two routes from Tasks 4 & 5
- Produces: `export function BulkImportCard({ type, propertyId, onSuccess }: { type: ImportType; propertyId: string; onSuccess?: () => void })`

- [ ] **Step 1: Create the component with full contents**

```tsx
// src/components/admin/bulk-import-card.tsx
'use client'

import { useRef, useState } from 'react'
import { Upload, Download, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { buildTemplate, parseCsv, type ImportType } from '@/lib/utilities/csv'

interface PreviewResult {
  total: number
  newCount: number
  overwriteCount: number
  errorCount: number
  errors: { row: number; message: string }[]
  committed: boolean
  imported: number
}

const TYPE_LABEL: Record<ImportType, string> = {
  electricity: 'Electricity readings',
  water: 'Water readings',
  wastage: 'Daily wastage',
}

export function BulkImportCard({
  type,
  propertyId,
  onSuccess,
}: {
  type: ImportType
  propertyId: string
  onSuccess?: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [busy, setBusy] = useState(false)

  const endpoint = type === 'wastage' ? '/api/waste/bulk-import' : '/api/utilities/bulk-import'

  function buildBody(parsedRows: Record<string, string>[], dryRun: boolean) {
    return type === 'wastage'
      ? { propertyId, dryRun, rows: parsedRows }
      : { propertyId, utilityType: type, dryRun, rows: parsedRows }
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplate(type)], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${type}-import-template.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setPreview(null)
    try {
      const text = await file.text()
      const { rows: parsedRows } = parseCsv(text)
      if (parsedRows.length === 0) {
        toast.error('That file has no data rows')
        setRows([])
        return
      }
      setRows(parsedRows)
      setBusy(true)
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(parsedRows, true)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Preview failed')
      setPreview(data as PreviewResult)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file')
    } finally {
      setBusy(false)
    }
  }

  async function confirmImport() {
    setBusy(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody(rows, false)),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Import failed')
      toast.success(`Imported ${data.imported} rows (${data.newCount} new, ${data.overwriteCount} updated)`)
      reset()
      onSuccess?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to import')
    } finally {
      setBusy(false)
    }
  }

  function reset() {
    setRows([])
    setFileName(null)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  const canConfirm = !!preview && preview.errorCount === 0 && rows.length > 0 && !busy

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="size-4" />
          Bulk Import — {TYPE_LABEL[type]}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV to backfill historical data. Download the template for the exact columns.
          Existing dates are overwritten. Review the preview before confirming.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="size-4" />
            Download template
          </Button>
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload className="size-4" />
            {fileName ?? 'Choose CSV'}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {preview && (
          <div className="space-y-3 rounded-md border p-4">
            <div className="flex flex-wrap gap-4 text-sm">
              <span><strong>{preview.total}</strong> rows</span>
              <span className="text-emerald-600"><strong>{preview.newCount}</strong> new</span>
              <span className="text-amber-600"><strong>{preview.overwriteCount}</strong> overwrite</span>
              <span className={preview.errorCount > 0 ? 'text-red-600' : 'text-muted-foreground'}>
                <strong>{preview.errorCount}</strong> errors
              </span>
            </div>

            {preview.errorCount > 0 && (
              <div className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Row</TableHead>
                      <TableHead>Error</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.errors.map((e, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{e.row}</TableCell>
                        <TableCell className="text-red-600">{e.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button size="sm" onClick={confirmImport} disabled={!canConfirm}>
                {busy ? 'Importing…' : 'Confirm import'}
              </Button>
              <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>
                Cancel
              </Button>
              {preview.errorCount > 0 && (
                <span className="text-xs text-muted-foreground">
                  Fix the errors and re-select the file to enable import.
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Confirm the shadcn `table` primitive exists**

Run: `ls src/components/ui/table.tsx`
Expected: the file exists (it is used by `utility-readings-table.tsx`). If missing, replace the `<Table>` error list in Step 1 with a simple `<ul className="space-y-1 text-sm text-red-600">` of `Row {e.row}: {e.message}` list items — but it does exist, so no change needed.

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/bulk-import-card.tsx
git commit -m "feat(admin): reusable BulkImportCard (template, preview, confirm)"
```

---

### Task 7: Mount the card on the Utilities and Waste pages (admin-only)

**Files:**
- Modify: `src/components/admin/utilities-page-client.tsx` (import + render inside the `{isAdmin && (...)}` config block, ~line 180-193)
- Modify: `src/components/waste/waste-page-client.tsx` (use the existing `isAdmin` prop; import + render below the table/form grid)

**Interfaces:**
- Consumes: `BulkImportCard` from Task 6.

- [ ] **Step 1: Add the import to `utilities-page-client.tsx`**

After the existing import on line 16 (`import { UtilityRangeSelector } ...`), add:

```typescript
import { BulkImportCard } from '@/components/admin/bulk-import-card'
```

- [ ] **Step 2: Render it in the admin config block**

In `utilities-page-client.tsx`, inside the `{isAdmin && (...)}` block, add `BulkImportCard` as the last item in the `space-y-6` div (after the `UtilitySlotConfigForm` conditional). The block becomes:

```tsx
      {/* Config (admin only) */}
      {isAdmin && (
        <div className="space-y-6">
          <UtilityTierForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          <UtilityKpiBandsForm propertyId={property.id} utilityType={utilityType} onRefresh={fetchData} />
          {utilityType === 'electricity' && (
            <UtilitySlotConfigForm onRefresh={() => {
              fetch('/api/utilities/slot-config')
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => d && setSlotTimes(d))
                .catch(() => {})
            }} />
          )}
          <BulkImportCard type={utilityType} propertyId={property.id} onSuccess={fetchData} />
        </div>
      )}
```

(`utilityType` is `'water' | 'electricity'`, both valid `ImportType` values, so it passes straight through.)

- [ ] **Step 3: Add the import to `waste-page-client.tsx`**

After line 18 (`import { WasteLogForm } ...`), add:

```typescript
import { BulkImportCard } from '@/components/admin/bulk-import-card'
```

- [ ] **Step 4: Use the `isAdmin` prop and render the card**

In `waste-page-client.tsx`, change the component signature on line 58 from:

```tsx
export function WastePageClient({ property }: WastePageClientProps) {
```

to:

```tsx
export function WastePageClient({ property, isAdmin }: WastePageClientProps) {
```

Then, inside the outer `<div className="space-y-6 p-6">`, add the card after the closing `</div>` of the "Log table + entry form" grid (just before the final `</div>` that closes the page wrapper):

```tsx
      {/* Bulk import (admin only) */}
      {isAdmin && (
        <BulkImportCard type="wastage" propertyId={property.id} onSuccess={fetchData} />
      )}
```

- [ ] **Step 5: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (The previously-unused `isAdmin` prop is now consumed, so no "declared but never read" concerns.)

- [ ] **Step 6: Commit**

```bash
git add src/components/admin/utilities-page-client.tsx src/components/waste/waste-page-client.tsx
git commit -m "feat: mount BulkImportCard on utilities + waste pages (admin only)"
```

---

### Task 8: Build + manual end-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `npm run build`
Expected: build succeeds with no type or lint errors. (Note: per MEMORY, the local macOS Turbopack build may hang at the type-check phase — this is a known macOS/Turbopack quirk, not a code defect. If it hangs after `npx tsc --noEmit` has already passed cleanly, the types are sound; the authoritative build runs on Coolify/Linux. Record the `tsc` result as the gating check if the full build hangs locally.)

- [ ] **Step 2: Manual dry-run via the running dev server**

Start the dev server (`npm run dev`), log in as an admin, open a property's **Utilities** page → Electricity tab → scroll to the admin "Bulk Import — Electricity readings" card. Then:
1. Click **Download template** → confirm `electricity-import-template.csv` downloads with header `date,morning,evening,night,guest_count,staff_count,note`.
2. Fill 2-3 rows with valid historical dates, plus one row with a bad value (e.g. `abc` in `morning`) and one duplicate date.
3. Choose the file → confirm the preview shows correct new/overwrite counts and lists the bad-value and duplicate-date rows as errors, with **Confirm import** disabled.
4. Fix the file, re-select → preview shows 0 errors, **Confirm import** enabled.
5. Click **Confirm import** → toast reports imported counts; the readings table/charts refresh and show the new dates.
6. Repeat the same file once more → preview shows all rows as "overwrite", confirm succeeds, no duplicate rows appear.
7. Repeat the Water tab (template header `date,reading,guest_count,staff_count,note`) and the **Waste** page (template header `date,paper_kg,glass_kg,plastic_kg,food_kg,metal_kg,electronic_kg,note`).

Expected: all three import types preview and commit correctly; occupancy guest/staff counts appear on the electricity/water KPI after import.

- [ ] **Step 3: Confirm non-admin cannot access**

Log in as a property_manager (or temporarily verify via the network tab): the Bulk Import card is not rendered (it is inside the `isAdmin` block), and a direct `POST /api/utilities/bulk-import` returns 403.

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git status   # if clean, nothing to do
```

---

## Notes for the Implementer

- **No migration / no schema change.** All target tables (`utility_meter_readings`, `daily_occupancy`, `waste_logs`) and their unique constraints already exist in production.
- **Why bulk bypasses the entry window:** the normal `POST /api/utilities/readings` route enforces a ±15-min IST slot window and cumulative-order checks. Bulk import is an admin backfill path (mirrors the prior `_tmp_seed.mjs`), so it deliberately skips those — it writes directly via the new query helpers with `status='manual'`.
- **Occupancy clobber rule:** for electricity/water rows, occupancy is upserted only when at least one of `guest_count`/`staff_count` is present; a blank counterpart is stored as `0`. Leave both blank to avoid touching occupancy for that date.
- **`zod` import:** use `import { z } from 'zod'` (no `/v4` suffix) to match the two routes being mirrored; `z.record(z.string(), z.string())` is the v4 two-arg signature already supported by the installed `^4.3.6`.
