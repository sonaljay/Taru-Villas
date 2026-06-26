# Oracle Guest Profiles — Backbone (Plan 1 of 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Oracle OHIP connection and the Guest Profile data backbone: pull upcoming reservations per property into `guest_profiles` (manual + cron), refresh their status/room from Oracle, and view them read-only — so the pre-arrival questionnaire (Plan 2) has a populated spine to build on.

**Architecture:** A reusable env-configured Oracle OHIP client (`src/lib/oracle/`) with a cached Bearer token and typed reservation wrappers, isolated from the raw OPERA JSON by pure normalizer helpers. A `guest_profiles` table (+ the questionnaire tables, landed now so the schema lands once) is upserted by a sync service invoked from a manual admin/PM API and a daily cron. A read-only Guest Profiles area lists arrivals by status.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Drizzle ORM (postgres.js), Zod v4, shadcn/ui, Sonner, lucide-react. No new npm dependencies.

## Global Constraints

- DB client stays `{ prepare: false }` — never touch `src/lib/db/index.ts`.
- Zod: `import { z } from 'zod'` (matches sibling routes); plain `z.string()` (no strict `.url()`); coerce nullable arrays to `[]` before Drizzle writes.
- All Drizzle mutations use `.returning()` where a row is needed. Numeric columns (none here) would be strings.
- Every `page.tsx` that fetches data sets `export const dynamic = 'force-dynamic'`.
- Auth: pages use `requireRole(['admin','property_manager'])`; APIs use `getProfile()` → 401, then role/property checks; `getUserProperties(id, role)` returning `null` means admin/all-access.
- `getPropertiesForUser(userId: string)` takes a SINGLE argument (admins → all active org properties; others → assigned).
- Token generation idiom: `randomBytes(16).toString('base64url')` (22-char base64url), like `guest-links.ts`.
- **Migration is hand-written** (drizzle-kit history is broken): `drizzle/0017_oracle_guest_profiles.sql`, idempotent (`IF NOT EXISTS`; enums via guarded `DO $$` block; `--> statement-breakpoint` between statements). It is applied in Supabase (or from the dev box via `postgres` + `POSTGRES_URL`) **before** the PR merges — Server Components reading these tables 500 until it is applied.
- Env vars (sandbox values now): `ORACLE_OHIP_GATEWAY`, `ORACLE_OHIP_CLIENT_ID`, `ORACLE_OHIP_CLIENT_SECRET`, `ORACLE_OHIP_APP_KEY`, `ORACLE_OHIP_USERNAME`, `ORACLE_OHIP_PASSWORD`. Documented in CLAUDE.md.
- **No test framework exists** and `npx tsc --noEmit`/`npm run build`/`npm run lint` DEADLOCK on the dev macOS (Node/Turbopack quirk) — Linux/Coolify is the authoritative compiler. Per-task verification = careful diff inspection; for pure helper functions, a throwaway Node script (`node scratch.mjs` — Node 26 strips TS types, so it can import `.ts` directly) is the gating behavior check. Do NOT run tsc/build/lint.
- **Oracle JSON shapes:** the exact OPERA field paths for arrivals/status/room/comment/ETA are pinned against the sandbox during implementation. Keep all raw-shape access inside the normalizer helpers in `src/lib/oracle/reservations.ts`; the pure classification/format helpers (status → lifecycle, ETA formatting, comment building) are fully specified and unit-tested here.
- Commit message trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File Structure

| File | Responsibility |
|------|----------------|
| `src/lib/db/schema.ts` (modify) | Add 2 enums, `properties.oracleHotelId`, 3 tables + relations + type exports |
| `drizzle/0017_oracle_guest_profiles.sql` (create) | Hand-written idempotent migration |
| `src/lib/oracle/types.ts` (create) | Shared TS types for normalized Oracle data |
| `src/lib/oracle/reservations.ts` (create) | Pure normalizers + classification/format helpers (testable) |
| `src/lib/oracle/client.ts` (create) | Token cache + `ohipRequest()` + `listArrivals`/`getReservation`/`postPreArrival` |
| `src/components/admin/property-form.tsx` (modify) | `oracleHotelId` input + default + PATCH body |
| `src/app/api/properties/[id]/route.ts` (modify) | `oracleHotelId` in update Zod schema |
| `src/lib/db/queries/guest-profiles.ts` (create) | Profile queries: upsert-from-arrival, list, getByToken/Id, status setters |
| `src/lib/oracle/sync.ts` (create) | `syncPropertyArrivals`, `refreshPropertyStatuses` (orchestration) |
| `src/app/api/guest-profiles/sync/route.ts` (create) | Manual sync (admin/PM, property-scoped) |
| `src/app/api/cron/guest-profiles-sync/route.ts` (create) | Daily cron (Bearer CRON_SECRET) |
| `src/app/(portal)/guest-profiles/page.tsx` (create) | Property picker |
| `src/app/(portal)/properties/[propertyId]/guest-profiles/page.tsx` (create) | Management page (read-only list) |
| `src/components/guest-profiles/guest-profiles-page-client.tsx` (create) | Profiles list + Pull button + status badges |
| `src/components/layout/app-sidebar.tsx` (modify) | `propertyNavItems` entry |
| `src/components/layout/header.tsx` (modify) | breadcrumb `segmentLabels` |
| `CLAUDE.md` (modify) | Document Oracle env vars |

---

### Task 1: Schema + migration

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `drizzle/0017_oracle_guest_profiles.sql`

**Interfaces:**
- Produces (Drizzle tables/enums/types consumed by all later tasks and Plan 2):
  - enums `guestProfileStatusEnum` (`guest_profile_status`), `preArrivalQuestionTypeEnum` (`pre_arrival_question_type`)
  - `properties.oracleHotelId` (`oracle_hotel_id` varchar, nullable)
  - tables `guestProfiles`, `preArrivalQuestions`, `preArrivalAnswers`
  - types `GuestProfile`/`NewGuestProfile`, `PreArrivalQuestion`/`NewPreArrivalQuestion`, `PreArrivalAnswer`/`NewPreArrivalAnswer`

- [ ] **Step 1: Add the two enums** near the other `pgEnum` declarations (after `taskStatusEnum`, ~line 48) in `src/lib/db/schema.ts`:

```typescript
export const guestProfileStatusEnum = pgEnum('guest_profile_status', [
  'pending_questionnaire',
  'pending_approval',
  'pending_checkin',
  'checked_in',
  'cancelled',
])

export const preArrivalQuestionTypeEnum = pgEnum('pre_arrival_question_type', [
  'short_text',
  'long_text',
  'single_choice',
  'multi_choice',
  'date',
  'time',
  'yes_no',
  'file',
])
```

- [ ] **Step 2: Add `oracleHotelId` to the `properties` table.** In the `properties` definition (~line 88), add the column right after `location`:

```typescript
  location: text('location'),
  oracleHotelId: varchar('oracle_hotel_id', { length: 50 }),
```

- [ ] **Step 3: Add the three tables + relations + type exports.** Place after the `guestSurveyLinks` block (or near the end of the table definitions, before the type-export section):

```typescript
// ---------------------------------------------------------------------------
// Oracle Guest Profiles + Pre-Arrival
// ---------------------------------------------------------------------------

export const guestProfiles = pgTable(
  'guest_profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    oracleReservationId: varchar('oracle_reservation_id', { length: 255 }).notNull(),
    confirmationNumber: varchar('confirmation_number', { length: 255 }),
    guestName: text('guest_name'),
    guestEmail: text('guest_email'),
    arrivalDate: date('arrival_date'),
    departureDate: date('departure_date'),
    roomType: varchar('room_type', { length: 100 }),
    roomNumber: varchar('room_number', { length: 50 }),
    status: guestProfileStatusEnum('status').default('pending_questionnaire').notNull(),
    oracleReservationStatus: varchar('oracle_reservation_status', { length: 100 }),
    token: varchar('token', { length: 255 }).notNull().unique(),
    postedAt: timestamp('posted_at', { withTimezone: true }),
    postedBy: uuid('posted_by').references(() => profiles.id, { onDelete: 'set null' }),
    oracleError: text('oracle_error'),
    lastPulledAt: timestamp('last_pulled_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique('guest_profiles_property_reservation_unique').on(
      table.propertyId,
      table.oracleReservationId
    ),
  ]
)

export const preArrivalQuestions = pgTable('pre_arrival_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  propertyId: uuid('property_id')
    .notNull()
    .references(() => properties.id, { onDelete: 'cascade' }),
  prompt: varchar('prompt', { length: 500 }).notNull(),
  type: preArrivalQuestionTypeEnum('type').notNull(),
  options: text('options').array().default(sql`'{}'::text[]`).notNull(),
  required: boolean('required').default(false).notNull(),
  mapsToEta: boolean('maps_to_eta').default(false).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const preArrivalAnswers = pgTable('pre_arrival_answers', {
  id: uuid('id').defaultRandom().primaryKey(),
  guestProfileId: uuid('guest_profile_id')
    .notNull()
    .references(() => guestProfiles.id, { onDelete: 'cascade' }),
  questionId: uuid('question_id').references(() => preArrivalQuestions.id, {
    onDelete: 'set null',
  }),
  promptSnapshot: varchar('prompt_snapshot', { length: 500 }).notNull(),
  valueText: text('value_text'),
  valueOptions: text('value_options').array().default(sql`'{}'::text[]`).notNull(),
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const guestProfilesRelations = relations(guestProfiles, ({ one, many }) => ({
  property: one(properties, {
    fields: [guestProfiles.propertyId],
    references: [properties.id],
  }),
  answers: many(preArrivalAnswers),
}))

export const preArrivalQuestionsRelations = relations(preArrivalQuestions, ({ one }) => ({
  property: one(properties, {
    fields: [preArrivalQuestions.propertyId],
    references: [properties.id],
  }),
}))

export const preArrivalAnswersRelations = relations(preArrivalAnswers, ({ one }) => ({
  guestProfile: one(guestProfiles, {
    fields: [preArrivalAnswers.guestProfileId],
    references: [guestProfiles.id],
  }),
  question: one(preArrivalQuestions, {
    fields: [preArrivalAnswers.questionId],
    references: [preArrivalQuestions.id],
  }),
}))
```

- [ ] **Step 4: Add type exports** in the type-export section (near the other `$inferSelect` exports):

```typescript
export type GuestProfile = typeof guestProfiles.$inferSelect
export type NewGuestProfile = typeof guestProfiles.$inferInsert
export type PreArrivalQuestion = typeof preArrivalQuestions.$inferSelect
export type NewPreArrivalQuestion = typeof preArrivalQuestions.$inferInsert
export type PreArrivalAnswer = typeof preArrivalAnswers.$inferSelect
export type NewPreArrivalAnswer = typeof preArrivalAnswers.$inferInsert
```

- [ ] **Step 5: Write the migration** `drizzle/0017_oracle_guest_profiles.sql` (confirm 0017 is the next free number — `ls drizzle/*.sql`; 0016 is the highest):

```sql
DO $$ BEGIN
  CREATE TYPE "guest_profile_status" AS ENUM ('pending_questionnaire', 'pending_approval', 'pending_checkin', 'checked_in', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "pre_arrival_question_type" AS ENUM ('short_text', 'long_text', 'single_choice', 'multi_choice', 'date', 'time', 'yes_no', 'file');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "oracle_hotel_id" varchar(50);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "guest_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "oracle_reservation_id" varchar(255) NOT NULL,
  "confirmation_number" varchar(255),
  "guest_name" text,
  "guest_email" text,
  "arrival_date" date,
  "departure_date" date,
  "room_type" varchar(100),
  "room_number" varchar(50),
  "status" "guest_profile_status" DEFAULT 'pending_questionnaire' NOT NULL,
  "oracle_reservation_status" varchar(100),
  "token" varchar(255) NOT NULL UNIQUE,
  "posted_at" timestamptz,
  "posted_by" uuid REFERENCES "profiles"("id") ON DELETE SET NULL,
  "oracle_error" text,
  "last_pulled_at" timestamptz,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "guest_profiles_property_reservation_unique" UNIQUE ("property_id", "oracle_reservation_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_arrival_questions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id"),
  "property_id" uuid NOT NULL REFERENCES "properties"("id") ON DELETE CASCADE,
  "prompt" varchar(500) NOT NULL,
  "type" "pre_arrival_question_type" NOT NULL,
  "options" text[] DEFAULT '{}'::text[] NOT NULL,
  "required" boolean DEFAULT false NOT NULL,
  "maps_to_eta" boolean DEFAULT false NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "pre_arrival_answers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "guest_profile_id" uuid NOT NULL REFERENCES "guest_profiles"("id") ON DELETE CASCADE,
  "question_id" uuid REFERENCES "pre_arrival_questions"("id") ON DELETE SET NULL,
  "prompt_snapshot" varchar(500) NOT NULL,
  "value_text" text,
  "value_options" text[] DEFAULT '{}'::text[] NOT NULL,
  "file_url" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL
);
```

- [ ] **Step 6: Verify by inspection.** Re-read the schema diff: enums present; `oracleHotelId` placed in `properties`; three tables with correct FKs/cascades/unique; relations + type exports added. Confirm the migration column/constraint names exactly match the Drizzle column names (snake_case). Do NOT run tsc/build.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0017_oracle_guest_profiles.sql
git commit -m "feat(schema): guest_profiles + pre-arrival tables, oracleHotelId, migration 0017"
```

---

### Task 2: Oracle OHIP client + pure normalizers

**Files:**
- Create: `src/lib/oracle/types.ts`
- Create: `src/lib/oracle/reservations.ts`
- Create: `src/lib/oracle/client.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `NormalizedArrival`, `NormalizedReservation`, `OhipResult<T>` (= `{ ok: true; data: T } | { ok: false; status: number; error: string }`)
  - `reservations.ts` pure helpers: `classifyOracleStatus(raw: string | null | undefined): 'checked_in' | 'cancelled' | 'other'`, `formatEtaComment(answers, etaLabel): { comment: string; eta: string | null }` (Plan 2 uses the comment builder; here we export the classifier + a `normalizeArrival(raw)` + `normalizeReservation(raw)`)
  - `client.ts`: `listArrivals(hotelId, fromDate, toDate, opts?)`, `getReservation(hotelId, reservationId)`, `postPreArrival(hotelId, reservationId, { eta, comment })`, each returning `Promise<OhipResult<...>>`

- [ ] **Step 1: Create `src/lib/oracle/types.ts`**

```typescript
// src/lib/oracle/types.ts
// Normalized shapes the rest of the app consumes — insulated from raw OPERA JSON.

export type OhipResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface NormalizedArrival {
  oracleReservationId: string
  confirmationNumber: string | null
  guestName: string | null
  guestEmail: string | null
  arrivalDate: string | null // YYYY-MM-DD
  departureDate: string | null // YYYY-MM-DD
  roomType: string | null
}

export interface NormalizedReservation extends NormalizedArrival {
  reservationStatus: string | null // raw OPERA status, e.g. "InHouse"
  roomNumber: string | null
}
```

- [ ] **Step 2: Write the failing pure-helper check.** Create a throwaway `scratch-oracle.mjs` (scratchpad) that imports from `reservations.ts` and asserts the classifier — run it to confirm the function is missing (import error), then implement.

```javascript
// scratchpad/scratch-oracle.mjs
import { classifyOracleStatus } from '/Users/sonaljayawickrama/Desktop/GitHub Repos/Taru-Villas/src/lib/oracle/reservations.ts'
let ok = 0, fail = 0
const eq = (a, b, m) => { if (a === b) ok++; else { fail++; console.log('FAIL', m, 'got', a, 'want', b) } }
eq(classifyOracleStatus('InHouse'), 'checked_in', 'InHouse')
eq(classifyOracleStatus('Arrived'), 'checked_in', 'Arrived')
eq(classifyOracleStatus('RegisteredAndInHouse'), 'checked_in', 'RegisteredAndInHouse')
eq(classifyOracleStatus('CheckedIn'), 'checked_in', 'CheckedIn')
eq(classifyOracleStatus('Cancellation'), 'cancelled', 'Cancellation')
eq(classifyOracleStatus('NoShow'), 'cancelled', 'NoShow')
eq(classifyOracleStatus('Reserved'), 'other', 'Reserved')
eq(classifyOracleStatus(null), 'other', 'null')
eq(classifyOracleStatus(undefined), 'other', 'undefined')
console.log(`${ok} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
```

Run: `node scratchpad/scratch-oracle.mjs`
Expected: FAIL — cannot import `classifyOracleStatus` (not defined yet).

- [ ] **Step 3: Create `src/lib/oracle/reservations.ts`** with the pure helpers + normalizers. The normalizers use defensive optional chaining over best-effort OPERA paths (PINNED against the sandbox during integration — keep all raw access here).

```typescript
// src/lib/oracle/reservations.ts
import type { NormalizedArrival, NormalizedReservation } from './types'

const CHECKED_IN = new Set(['arrived', 'inhouse', 'registeredandinhouse', 'checkedin', 'checked in'])
const CANCELLED = new Set(['cancellation', 'cancelled', 'noshow', 'no show'])

/** Map a raw OPERA reservation status to our lifecycle transition class. */
export function classifyOracleStatus(
  raw: string | null | undefined
): 'checked_in' | 'cancelled' | 'other' {
  if (!raw) return 'other'
  const k = raw.toLowerCase().replace(/[\s_-]/g, '')
  if (CHECKED_IN.has(k) || CHECKED_IN.has(raw.toLowerCase())) return 'checked_in'
  if (CANCELLED.has(k) || CANCELLED.has(raw.toLowerCase())) return 'cancelled'
  return 'other'
}

// ---- Raw-shape access (PIN against sandbox responses) -----------------------
// OPERA wraps a reservation in nested objects; these readers defensively walk
// the documented shape and must be confirmed against a real sandbox payload.

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

/** Normalize one reservation object from getHotelReservations / getReservation. */
export function normalizeArrival(raw: any): NormalizedArrival {
  const r = raw?.reservation ?? raw ?? {}
  const ids = r?.reservationIdList ?? r?.resvNameId ?? []
  const oracleReservationId =
    asString(Array.isArray(ids) ? ids?.[0]?.id : ids?.id) ??
    asString(r?.reservationId) ??
    asString(r?.id) ??
    ''
  const profile = r?.reservationGuest ?? r?.guestProfile ?? r?.profile ?? {}
  const name = profile?.givenName || profile?.surname
    ? `${asString(profile?.givenName) ?? ''} ${asString(profile?.surname) ?? ''}`.trim()
    : asString(profile?.fullName)
  const roomStay = r?.roomStay ?? {}
  return {
    oracleReservationId,
    confirmationNumber: asString(r?.confirmationNumber) ?? asString(r?.confirmationNo),
    guestName: name || null,
    guestEmail: asString(profile?.email) ?? asString(profile?.emailAddress),
    arrivalDate: asString(roomStay?.arrivalDate) ?? asString(r?.arrivalDate),
    departureDate: asString(roomStay?.departureDate) ?? asString(r?.departureDate),
    roomType: asString(roomStay?.roomType) ?? asString(roomStay?.roomTypeCharged),
  }
}

/** Normalize a full reservation, adding status + assigned room. */
export function normalizeReservation(raw: any): NormalizedReservation {
  const base = normalizeArrival(raw)
  const r = raw?.reservation ?? raw ?? {}
  const roomStay = r?.roomStay ?? {}
  const status =
    asString(r?.reservationStatus) ??
    asString(r?.computedReservationStatus) ??
    asString(roomStay?.reservationStatus)
  const roomNumber =
    asString(roomStay?.currentRoomInfo?.roomId) ??
    asString(roomStay?.roomId) ??
    asString(roomStay?.currentRoomInfo?.roomNumber)
  return { ...base, reservationStatus: status, roomNumber }
}
```

- [ ] **Step 4: Run the pure-helper check to confirm it passes**

Run: `node scratchpad/scratch-oracle.mjs`
Expected: `9 passed, 0 failed`.

- [ ] **Step 5: Create `src/lib/oracle/client.ts`** (token cache + request + wrappers; mirrors the `extract-reading` env-read/fetch/error shape):

```typescript
// src/lib/oracle/client.ts
import type { OhipResult, NormalizedArrival, NormalizedReservation } from './types'
import { normalizeArrival, normalizeReservation } from './reservations'

interface Cached { token: string; expiresAt: number }
let cached: Cached | null = null

function env() {
  const gateway = process.env.ORACLE_OHIP_GATEWAY
  const clientId = process.env.ORACLE_OHIP_CLIENT_ID
  const clientSecret = process.env.ORACLE_OHIP_CLIENT_SECRET
  const appKey = process.env.ORACLE_OHIP_APP_KEY
  const username = process.env.ORACLE_OHIP_USERNAME
  const password = process.env.ORACLE_OHIP_PASSWORD
  if (!gateway || !clientId || !clientSecret || !appKey || !username || !password) return null
  return { gateway, clientId, clientSecret, appKey, username, password }
}

async function getAccessToken(): Promise<OhipResult<string>> {
  const cfg = env()
  if (!cfg) return { ok: false, status: 500, error: 'Oracle OHIP not configured' }
  if (cached && cached.expiresAt > Date.now() + 60_000) return { ok: true, data: cached.token }

  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')
  const body = new URLSearchParams({
    grant_type: 'password',
    username: cfg.username,
    password: cfg.password,
  })
  const res = await fetch(`${cfg.gateway}/oauth/v1/tokens`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'x-app-key': cfg.appKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('OHIP token error', res.status, t)
    return { ok: false, status: 502, error: 'OHIP authentication failed' }
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) return { ok: false, status: 502, error: 'OHIP returned no token' }
  cached = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 }
  return { ok: true, data: cached.token }
}

async function ohipRequest<T>(
  path: string,
  init: RequestInit & { method: string }
): Promise<OhipResult<T>> {
  const cfg = env()
  if (!cfg) return { ok: false, status: 500, error: 'Oracle OHIP not configured' }
  const tok = await getAccessToken()
  if (!tok.ok) return tok
  const res = await fetch(`${cfg.gateway}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tok.data}`,
      'x-app-key': cfg.appKey,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  })
  if (!res.ok) {
    const t = await res.text().catch(() => '')
    console.error('OHIP request error', init.method, path, res.status, t)
    return { ok: false, status: res.status === 404 ? 404 : 502, error: `OHIP ${res.status}` }
  }
  const data = (res.status === 204 ? null : await res.json()) as T
  return { ok: true, data }
}

/** List reservations arriving in [fromDate, toDate] for a hotel. */
export async function listArrivals(
  hotelId: string,
  fromDate: string,
  toDate: string,
  opts: { limit?: number; offset?: number } = {}
): Promise<OhipResult<NormalizedArrival[]>> {
  const qs = new URLSearchParams({
    arrivalStartDate: fromDate,
    arrivalEndDate: toDate,
    limit: String(opts.limit ?? 200),
    offset: String(opts.offset ?? 0),
  })
  const res = await ohipRequest<any>(`/rsv/v1/hotels/${hotelId}/reservations?${qs}`, {
    method: 'GET',
  })
  if (!res.ok) return res
  // PIN: the array key under the envelope is confirmed against the sandbox.
  const list: any[] =
    res.data?.reservations?.reservation ??
    res.data?.reservations ??
    res.data?.hotelReservations ??
    []
  return { ok: true, data: list.map(normalizeArrival).filter((a) => a.oracleReservationId) }
}

/** Fetch one reservation (status + assigned room). */
export async function getReservation(
  hotelId: string,
  reservationId: string
): Promise<OhipResult<NormalizedReservation>> {
  const res = await ohipRequest<any>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'GET' }
  )
  if (!res.ok) return res
  return { ok: true, data: normalizeReservation(res.data) }
}

/**
 * Post pre-arrival info: fetch the reservation, append a comment + set ETA, PUT it back.
 * Plan 2 builds {eta, comment}; the exact PUT body merge is PINNED against the sandbox.
 */
export async function postPreArrival(
  hotelId: string,
  reservationId: string,
  payload: { eta: string | null; comment: string }
): Promise<OhipResult<true>> {
  const current = await ohipRequest<any>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'GET' }
  )
  if (!current.ok) return current
  const body = current.data
  // PIN: merge comment + ETA into the reservation body per the sandbox shape.
  const put = await ohipRequest<any>(
    `/rsv/v1/hotels/${hotelId}/reservations/${reservationId}`,
    { method: 'PUT', body: JSON.stringify(body) }
  )
  if (!put.ok) return put
  return { ok: true, data: true }
}
```

> Implementer note: the `// PIN` lines mark where the live sandbox payload determines the exact key/merge. Wire the structure now; confirm the paths against a sandbox response during the manual round-trip (Plan 2 / final verification). The `postPreArrival` body-merge is finalized in Plan 2 when the comment/ETA builder exists — here it is a structural stub that compiles and round-trips the unchanged reservation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oracle/
git commit -m "feat(oracle): OHIP client (token cache + reservation wrappers) + normalizers"
```

---

### Task 3: Property `oracleHotelId` wiring

**Files:**
- Modify: `src/components/admin/property-form.tsx`
- Modify: `src/app/api/properties/[id]/route.ts`

**Interfaces:**
- Consumes: `properties.oracleHotelId` (Task 1).
- Produces: admins can set a property's Oracle hotel ID via the edit form.

- [ ] **Step 1: Extend the form Zod schema** in `property-form.tsx` (the `propertySchema`, ~line 26): add after `imageUrl`:

```typescript
  oracleHotelId: z.string().max(50).optional().or(z.literal('')),
```

- [ ] **Step 2: Add the default value.** In `defaultValues` (~line 95), add:

```typescript
    oracleHotelId: property?.oracleHotelId ?? '',
```

- [ ] **Step 3: Add the input field.** After the `location` field block (~line 240), add:

```tsx
{/* Oracle Hotel ID */}
<div className="space-y-2">
  <Label htmlFor="oracleHotelId">Oracle Hotel ID</Label>
  <Input
    id="oracleHotelId"
    placeholder="OPERA hotelId for this property (e.g. SAND01)"
    {...register('oracleHotelId')}
  />
</div>
```

- [ ] **Step 4: Include it in the PATCH body.** In `onSubmit`'s `body: JSON.stringify({ ... })` (~line 150), add alongside the other nullable text fields:

```typescript
    oracleHotelId: data.oracleHotelId || null,
```

- [ ] **Step 5: Accept it in the API schema.** In `src/app/api/properties/[id]/route.ts`, add to `updatePropertySchema` (~line 17):

```typescript
  oracleHotelId: z.string().max(50).nullable().optional(),
```

(The handler already spreads `propertyData` into `updateProperty`, so no further change is needed.)

- [ ] **Step 6: Verify by inspection** — field renders, default wired, body includes `oracleHotelId`, API schema accepts it. Do NOT run tsc/build.

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/property-form.tsx src/app/api/properties/[id]/route.ts
git commit -m "feat(properties): admin-editable oracleHotelId field"
```

---

### Task 4: Guest profile queries

**Files:**
- Create: `src/lib/db/queries/guest-profiles.ts`

**Interfaces:**
- Consumes: `guestProfiles` table + `NormalizedArrival`/`NormalizedReservation` (Task 2), `classifyOracleStatus`.
- Produces:
  - `getGuestProfilesForProperty(propertyId): Promise<GuestProfile[]>`
  - `getGuestProfileById(id): Promise<GuestProfile | undefined>`
  - `getGuestProfileByToken(token): Promise<GuestProfile | undefined>`
  - `upsertGuestProfileFromArrival(orgId, propertyId, arrival): Promise<GuestProfile>` (mints token on insert; refreshes snapshot fields without regressing status on conflict)
  - `applyReservationStatus(id, normalized): Promise<GuestProfile>` (checked_in → set room + status; cancelled → status; else just lastPulledAt)

- [ ] **Step 1: Create the file**

```typescript
// src/lib/db/queries/guest-profiles.ts
import { randomBytes } from 'crypto'
import { eq, and, desc } from 'drizzle-orm'
import { db } from '..'
import { guestProfiles } from '../schema'
import type { GuestProfile } from '../schema'
import { classifyOracleStatus } from '@/lib/oracle/reservations'
import type { NormalizedArrival, NormalizedReservation } from '@/lib/oracle/types'

function generateToken(): string {
  return randomBytes(16).toString('base64url')
}

/** All guest profiles for a property, newest arrival first. */
export async function getGuestProfilesForProperty(propertyId: string): Promise<GuestProfile[]> {
  return db
    .select()
    .from(guestProfiles)
    .where(eq(guestProfiles.propertyId, propertyId))
    .orderBy(desc(guestProfiles.arrivalDate), desc(guestProfiles.createdAt))
}

export async function getGuestProfileById(id: string): Promise<GuestProfile | undefined> {
  const rows = await db.select().from(guestProfiles).where(eq(guestProfiles.id, id)).limit(1)
  return rows[0]
}

export async function getGuestProfileByToken(token: string): Promise<GuestProfile | undefined> {
  const rows = await db.select().from(guestProfiles).where(eq(guestProfiles.token, token)).limit(1)
  return rows[0]
}

/**
 * Upsert a profile from a pulled arrival. New rows start pending_questionnaire
 * with a minted token; existing rows refresh snapshot fields only (status never
 * regresses — onConflict updates the descriptive fields, not status/token).
 */
export async function upsertGuestProfileFromArrival(
  orgId: string,
  propertyId: string,
  arrival: NormalizedArrival
): Promise<GuestProfile> {
  const [row] = await db
    .insert(guestProfiles)
    .values({
      orgId,
      propertyId,
      oracleReservationId: arrival.oracleReservationId,
      confirmationNumber: arrival.confirmationNumber,
      guestName: arrival.guestName,
      guestEmail: arrival.guestEmail,
      arrivalDate: arrival.arrivalDate,
      departureDate: arrival.departureDate,
      roomType: arrival.roomType,
      token: generateToken(),
      lastPulledAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [guestProfiles.propertyId, guestProfiles.oracleReservationId],
      set: {
        confirmationNumber: arrival.confirmationNumber,
        guestName: arrival.guestName,
        guestEmail: arrival.guestEmail,
        arrivalDate: arrival.arrivalDate,
        departureDate: arrival.departureDate,
        roomType: arrival.roomType,
        lastPulledAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

/**
 * Apply a freshly-fetched reservation status to a profile in pending_checkin:
 * checked_in → set status + room; cancelled → set status; otherwise just stamp.
 */
export async function applyReservationStatus(
  id: string,
  normalized: NormalizedReservation
): Promise<GuestProfile> {
  const cls = classifyOracleStatus(normalized.reservationStatus)
  const set: Record<string, unknown> = {
    oracleReservationStatus: normalized.reservationStatus,
    lastPulledAt: new Date(),
    updatedAt: new Date(),
  }
  if (cls === 'checked_in') {
    set.status = 'checked_in'
    if (normalized.roomNumber) set.roomNumber = normalized.roomNumber
  } else if (cls === 'cancelled') {
    set.status = 'cancelled'
  }
  const [row] = await db
    .update(guestProfiles)
    .set(set)
    .where(eq(guestProfiles.id, id))
    .returning()
  return row
}
```

- [ ] **Step 2: Verify by inspection** — imports resolve (Task 1 + Task 2 exports), onConflict target matches the unique constraint, status never set backward. Do NOT run tsc/build.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/queries/guest-profiles.ts
git commit -m "feat(guest-profiles): profile queries (upsert-from-arrival, status apply, lookups)"
```

---

### Task 5: Sync service + manual API + cron

**Files:**
- Create: `src/lib/oracle/sync.ts`
- Create: `src/app/api/guest-profiles/sync/route.ts`
- Create: `src/app/api/cron/guest-profiles-sync/route.ts`

**Interfaces:**
- Consumes: Task 2 client (`listArrivals`/`getReservation`), Task 4 queries, `getPropertyById`/`getPropertiesForUser` (`@/lib/db/queries/properties`), `getProfile`/`getUserProperties` (`@/lib/auth/guards`).
- Produces:
  - `syncPropertyArrivals(orgId, propertyId, hotelId, fromDate, toDate): Promise<{ pulled: number; error?: string }>`
  - `refreshPropertyStatuses(propertyId, hotelId): Promise<{ refreshed: number; checkedIn: number }>`

- [ ] **Step 1: Create `src/lib/oracle/sync.ts`**

```typescript
// src/lib/oracle/sync.ts
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestProfiles } from '@/lib/db/schema'
import { listArrivals, getReservation } from './client'
import {
  upsertGuestProfileFromArrival,
  applyReservationStatus,
} from '@/lib/db/queries/guest-profiles'

/** Pull arrivals in [fromDate,toDate] for a property and upsert guest profiles. */
export async function syncPropertyArrivals(
  orgId: string,
  propertyId: string,
  hotelId: string,
  fromDate: string,
  toDate: string
): Promise<{ pulled: number; error?: string }> {
  const res = await listArrivals(hotelId, fromDate, toDate)
  if (!res.ok) return { pulled: 0, error: res.error }
  let pulled = 0
  for (const arrival of res.data) {
    await upsertGuestProfileFromArrival(orgId, propertyId, arrival)
    pulled++
  }
  return { pulled }
}

/** Refresh Oracle status for profiles still awaiting check-in. */
export async function refreshPropertyStatuses(
  propertyId: string,
  hotelId: string
): Promise<{ refreshed: number; checkedIn: number }> {
  const pending = await db
    .select()
    .from(guestProfiles)
    .where(
      and(
        eq(guestProfiles.propertyId, propertyId),
        eq(guestProfiles.status, 'pending_checkin')
      )
    )
  let refreshed = 0
  let checkedIn = 0
  for (const p of pending) {
    const res = await getReservation(hotelId, p.oracleReservationId)
    if (!res.ok) continue
    const updated = await applyReservationStatus(p.id, res.data)
    refreshed++
    if (updated.status === 'checked_in') checkedIn++
  }
  return { refreshed, checkedIn }
}
```

- [ ] **Step 2: Create the manual sync API** `src/app/api/guest-profiles/sync/route.ts`

```typescript
// src/app/api/guest-profiles/sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { syncPropertyArrivals, refreshPropertyStatuses } from '@/lib/oracle/sync'

const bodySchema = z.object({
  propertyId: z.string().uuid(),
  fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (profile.role !== 'admin' && profile.role !== 'property_manager') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const parsed = bodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }
    const { propertyId, fromDate, toDate } = parsed.data

    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const property = await getPropertyById(propertyId)
    if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })
    if (!property.oracleHotelId) {
      return NextResponse.json(
        { error: 'This property has no Oracle Hotel ID set' },
        { status: 400 }
      )
    }

    const pull = await syncPropertyArrivals(
      property.orgId,
      propertyId,
      property.oracleHotelId,
      fromDate,
      toDate
    )
    if (pull.error) return NextResponse.json({ error: pull.error }, { status: 502 })
    const refresh = await refreshPropertyStatuses(propertyId, property.oracleHotelId)

    return NextResponse.json({ pulled: pull.pulled, ...refresh })
  } catch (error) {
    console.error('POST /api/guest-profiles/sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Create the cron** `src/app/api/cron/guest-profiles-sync/route.ts` (pulls the next 30 days for every property with an `oracleHotelId`):

```typescript
// src/app/api/cron/guest-profiles-sync/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { properties } from '@/lib/db/schema'
import { isNotNull, eq, and } from 'drizzle-orm'
import { syncPropertyArrivals, refreshPropertyStatuses } from '@/lib/oracle/sync'

export const dynamic = 'force-dynamic'

function bearerOk(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

async function run() {
  const rows = await db
    .select()
    .from(properties)
    .where(and(isNotNull(properties.oracleHotelId), eq(properties.isActive, true)))

  const today = new Date()
  const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
  const from = isoDate(today)
  const to = isoDate(in30)

  const details: Array<Record<string, unknown>> = []
  for (const p of rows) {
    if (!p.oracleHotelId) continue
    const pull = await syncPropertyArrivals(p.orgId, p.id, p.oracleHotelId, from, to)
    const refresh = await refreshPropertyStatuses(p.id, p.oracleHotelId)
    details.push({ propertyId: p.id, ...pull, ...refresh })
  }
  return { properties: rows.length, details }
}

export async function POST(request: NextRequest) {
  if (!bearerOk(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const result = await run()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('POST /api/cron/guest-profiles-sync error:', error)
    return NextResponse.json({ error: 'Sync failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
```

- [ ] **Step 4: Verify by inspection** — sync service uses the client + queries correctly; manual API enforces admin/PM + property access + hotelId presence; cron gated by CRON_SECRET (already in middleware `isPublicRoute` for `/api/cron/`). Do NOT run tsc/build.

- [ ] **Step 5: Commit**

```bash
git add src/lib/oracle/sync.ts src/app/api/guest-profiles/sync/route.ts src/app/api/cron/guest-profiles-sync/route.ts
git commit -m "feat(guest-profiles): Oracle sync service + manual API + daily cron"
```

---

### Task 6: Guest Profiles area (read-only) + nav + env docs

**Files:**
- Create: `src/app/(portal)/guest-profiles/page.tsx`
- Create: `src/app/(portal)/properties/[propertyId]/guest-profiles/page.tsx`
- Create: `src/components/guest-profiles/guest-profiles-page-client.tsx`
- Modify: `src/components/layout/app-sidebar.tsx`
- Modify: `src/components/layout/header.tsx`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: `requireRole`, `getUserProperties` (`@/lib/auth/guards`); `getPropertiesForUser`, `getPropertyById` (`@/lib/db/queries/properties`); `getGuestProfilesForProperty` (Task 4); the sync API (Task 5).

- [ ] **Step 1: Picker page** `src/app/(portal)/guest-profiles/page.tsx` (mirror the excursions picker):

```tsx
import Link from 'next/link'
import { requireRole } from '@/lib/auth/guards'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { UserCheck } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function GuestProfilesPickerPage() {
  const profile = await requireRole(['admin', 'property_manager'])
  const properties = await getPropertiesForUser(profile.id)

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Guest Profiles</h1>
        <p className="text-sm text-muted-foreground">
          Select a property to view arrivals and pre-arrival status.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {properties.map((property) => (
          <Link key={property.id} href={`/properties/${property.id}/guest-profiles`}>
            <Card className="transition-colors hover:border-primary">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <UserCheck className="size-4" />
                  {property.name}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Management page** `src/app/(portal)/properties/[propertyId]/guest-profiles/page.tsx` (mirror the excursions management page):

```tsx
import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getGuestProfilesForProperty } from '@/lib/db/queries/guest-profiles'
import { GuestProfilesPageClient } from '@/components/guest-profiles/guest-profiles-page-client'

export const dynamic = 'force-dynamic'

export default async function GuestProfilesPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireRole(['admin', 'property_manager'])

  if (profile.role === 'property_manager') {
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) notFound()
  }

  const property = await getPropertyById(propertyId)
  if (!property) notFound()

  const profiles = await getGuestProfilesForProperty(propertyId)

  return (
    <GuestProfilesPageClient
      property={{ id: property.id, name: property.name, oracleHotelId: property.oracleHotelId }}
      profiles={profiles}
    />
  )
}
```

- [ ] **Step 3: Client component** `src/components/guest-profiles/guest-profiles-page-client.tsx` (read-only list + Pull button calling the sync API; status badges):

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { GuestProfile } from '@/lib/db/schema'

const STATUS_LABEL: Record<GuestProfile['status'], string> = {
  pending_questionnaire: 'Pending Pre-Arrival Questionnaire',
  pending_approval: 'Pending Approval',
  pending_checkin: 'Pending Check-In',
  checked_in: 'Checked-In',
  cancelled: 'Cancelled',
}

const STATUS_CLASS: Record<GuestProfile['status'], string> = {
  pending_questionnaire: 'bg-yellow-100 text-yellow-800',
  pending_approval: 'bg-blue-100 text-blue-800',
  pending_checkin: 'bg-purple-100 text-purple-800',
  checked_in: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-700',
}

interface Props {
  property: { id: string; name: string; oracleHotelId: string | null }
  profiles: GuestProfile[]
}

export function GuestProfilesPageClient({ property, profiles }: Props) {
  const router = useRouter()
  const [pulling, setPulling] = useState(false)

  async function pull() {
    setPulling(true)
    try {
      const today = new Date()
      const in30 = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)
      const res = await fetch('/api/guest-profiles/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          propertyId: property.id,
          fromDate: today.toISOString().slice(0, 10),
          toDate: in30.toISOString().slice(0, 10),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Sync failed')
      toast.success(`Pulled ${data.pulled} arrivals (${data.checkedIn ?? 0} now checked-in)`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Sync failed')
    } finally {
      setPulling(false)
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/guest-profiles')}>
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Guest Profiles — {property.name}</h1>
            <p className="text-sm text-muted-foreground">Upcoming arrivals and pre-arrival status</p>
          </div>
        </div>
        <Button onClick={pull} disabled={pulling || !property.oracleHotelId}>
          <RefreshCw className={cn('size-4', pulling && 'animate-spin')} />
          {pulling ? 'Pulling…' : 'Pull arrivals'}
        </Button>
      </div>

      {!property.oracleHotelId && (
        <Card><CardContent className="py-4 text-sm text-amber-700">
          Set this property&apos;s Oracle Hotel ID (in Property Settings) before pulling arrivals.
        </CardContent></Card>
      )}

      {profiles.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">
          No guest profiles yet. Click &ldquo;Pull arrivals&rdquo; to fetch upcoming reservations.
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Confirmation</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Room</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.guestName ?? '—'}</TableCell>
                  <TableCell>{p.confirmationNumber ?? '—'}</TableCell>
                  <TableCell>{p.arrivalDate ?? '—'}</TableCell>
                  <TableCell>{p.roomNumber ?? p.roomType ?? '—'}</TableCell>
                  <TableCell>
                    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', STATUS_CLASS[p.status])}>
                      {STATUS_LABEL[p.status]}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Sidebar nav.** In `src/components/layout/app-sidebar.tsx`, add to `propertyNavItems` (import an icon, e.g. `UserCheck`, from `lucide-react` in the existing import):

```typescript
const propertyNavItems: NavItem[] = [
  { title: 'Excursions', href: '/excursions', icon: Compass },
  { title: 'Menus', href: '/menus', icon: UtensilsCrossed },
  { title: 'Guest Profiles', href: '/guest-profiles', icon: UserCheck },
]
```

- [ ] **Step 5: Breadcrumb label.** In `src/components/layout/header.tsx`, add to `segmentLabels`:

```typescript
  'guest-profiles': 'Guest Profiles',
```

- [ ] **Step 6: Document env vars in CLAUDE.md.** Under the Environment Variables section, add:

```bash
# Oracle OHIP (Guest Profiles / pre-arrival) — sandbox values for now
ORACLE_OHIP_GATEWAY="https://<customer-gateway-host>"
ORACLE_OHIP_CLIENT_ID="..."
ORACLE_OHIP_CLIENT_SECRET="..."
ORACLE_OHIP_APP_KEY="..."
ORACLE_OHIP_USERNAME="..."
ORACLE_OHIP_PASSWORD="..."
```

- [ ] **Step 7: Verify by inspection** — picker + management pages have `force-dynamic`; PM access check present; client status maps cover all 5 enum values; nav + breadcrumb added; env documented. Do NOT run tsc/build.

- [ ] **Step 8: Commit**

```bash
git add src/app/(portal)/guest-profiles src/app/(portal)/properties/[propertyId]/guest-profiles src/components/guest-profiles src/components/layout/app-sidebar.tsx src/components/layout/header.tsx CLAUDE.md
git commit -m "feat(guest-profiles): read-only arrivals view + Pull button + nav"
```

---

## Operational Step (before merge)

Apply migration `0017` in Supabase (or from the dev box via `postgres` + `POSTGRES_URL` per the established method) **before** merging — the new Server Components read these tables and will 500 until the migration runs. No data backfill needed.

## Verification (end of plan)

- Inspect all diffs; confirm `force-dynamic` on the two new pages and the cron route.
- Pure helper: `node scratchpad/scratch-oracle.mjs` → `9 passed, 0 failed`.
- Manual (needs sandbox env + a property with `oracleHotelId`): set the six `ORACLE_OHIP_*` env vars, set a property's Oracle Hotel ID, open `/properties/[id]/guest-profiles`, click **Pull arrivals** → arrivals appear as **Pending Pre-Arrival Questionnaire**; a reservation marked InHouse in the sandbox shows **Checked-In** with a room number after a pull (note: status refresh only advances profiles already in `pending_checkin`, which Plan 2 produces — for a pure backbone test, temporarily seed a profile to `pending_checkin` or accept that check-in transitions are exercised in Plan 2's round-trip).
- Confirm a non-admin/non-PM gets 403 from `/api/guest-profiles/sync`, and the cron route 401s without the Bearer secret.

## Self-Review (done)
- Spec coverage: Oracle client (auth + list + get + post stub) ✓; per-property hotelId ✓; sync manual + cron ✓; guest_profiles + questionnaire tables (schema landed) ✓; lifecycle statuses present ✓; read-only view ✓. Deferred to Plan 2 (intentional): question builder UI, guest public form + Storage, review & Approve-&-Post (finalizes `postPreArrival` body merge + comment/ETA builder), status transitions on submit/approve.
- The `postPreArrival` body-merge and the comment/ETA builder are explicitly finalized in Plan 2 (flagged at the function); Plan 1 ships a compiling structural stub.
- Type consistency: `NormalizedArrival`/`NormalizedReservation`, `classifyOracleStatus`, `OhipResult<T>`, query signatures, and status enum values are used identically across tasks.
