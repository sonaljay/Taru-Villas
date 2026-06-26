# Oracle PMS Integration — Guest Profiles & Pre-Arrival (Phase 1)

**Date:** 2026-06-26
**Status:** Design approved, pending spec review

## Goal

Integrate the Oracle Hospitality Integration Platform (OHIP / OPERA Cloud) to drive a **Guest Profile lifecycle** in the Taru Villas platform. Every reservation pulled from Oracle becomes a Guest Profile that moves from pre-arrival questionnaire → staff approval → posted to Oracle → checked-in (with room number). The pre-arrival questionnaire is admin-configurable per property; guests fill it via a tokenized public link; approved answers are written back to the Oracle reservation as a comment + expected arrival time (ETA).

This is **Phase 1**. It establishes the Guest Profile spine and the pre-arrival round-trip. Guest ordering from excursions/menus (and KOT push) is **Phase 2** and explicitly out of scope here.

## Background — Oracle OHIP (what we verified)

Source studied: `github.com/oracle/hospitality-api-docs` (OAS 2.0 specs). Relevant pieces, all confirmed present:

- **Auth** (`oauth.json`): `POST {gateway}/oauth/v1/tokens` with a **Basic** auth header (base64 `ClientId:ClientSecret`) + **`x-app-key`** header, form body `grant_type=password` (`username`/`password`) — returns a Bearer `access_token`, expires ~3600s. Every API call then sends `Authorization: Bearer <token>` + `x-app-key`.
- **List arrivals** (`rsv.json`, base `/rsv/v1`): `GET /hotels/{hotelId}/reservations?arrivalStartDate=&arrivalEndDate=` (+ `limit`/`offset`, etc.). Returns reservation IDs/confirmation numbers.
- **Get reservation:** `GET /hotels/{hotelId}/reservations/{reservationId}` — includes reservation status and `roomStay` (room number in `roomStay.currentRoomInfo`).
- **Write-back:** `PUT /hotels/{hotelId}/reservations/{reservationId}`. Comments (`commentType`/`commentInfoType`) and expected arrival time (`resExpectedTimesType`/`roomStayType`) are fields **inside** the reservation object → a **fetch-modify-PUT** pattern (GET the reservation, append our comment + set ETA, PUT it back).
- **Check-in detection:** reservation status enum includes `Arrived`, `InHouse`, `RegisteredAndInHouse`, `CheckedIn` (and `CheckedOut`, `NoShow`, `Cancellation`).
- **Attachments:** only `GET`/`DELETE` on reservations — **no POST**. We cannot push guest-uploaded files to Oracle; files stay in our system.

**Access dependency:** OHIP requires Oracle-issued credentials — a customer gateway hostname, `client_id`/`client_secret`, app key, integration user username/password, and a `hotelId` per property. We currently have **sandbox-only** access, so the Oracle client is env-configured (sandbox now, swap for prod later).

## Key Decisions

| Decision | Choice |
|----------|--------|
| Core entity | One **Guest Profile** per Oracle reservation, with a status lifecycle |
| Question definition | Admin-configurable builder, per property (reuses the survey/SOP template-builder grain) |
| Answer types | short_text, long_text, single_choice, multi_choice, date, time (ETA-mapped), yes_no, file |
| Pull model | **Both** a manual "Pull arrivals" button and a daily cron |
| Write-back target | Reservation **comment + ETA** via `PUT` (fetch-modify-PUT) |
| Post timing | **Staff review, then post** — guest submits → "Approve & Post to Oracle" |
| Guest delivery | Reuse tokenized public link (`/pa/[token]`), admin sends manually (no auto-email) |
| File uploads | Stored in Supabase Storage; not pushed to Oracle; referenced in the posted comment |
| Oracle access | Sandbox-only now; client behind env config; per-property `oracleHotelId` |

## Guest Profile Lifecycle

| Status (enum value) | UI label | Entered when |
|---|---|---|
| `pending_questionnaire` | Pending Pre-Arrival Questionnaire | Profile created from a pulled reservation; token minted |
| `pending_approval` | Pending Approval | Guest submits questionnaire + uploads |
| `pending_checkin` | Pending Check-In | Staff approves → comment + ETA posted to Oracle (PUT) succeeds |
| `checked_in` | Checked-In | Oracle status ∈ {Arrived, InHouse, RegisteredAndInHouse, CheckedIn} → we pull it + the room number |
| `cancelled` | Cancelled | Oracle status ∈ {Cancellation, NoShow} on a refresh |

Edge handling:
- A **failed** Oracle post leaves the profile in `pending_approval` with `oracleError` populated and a visible retry action (we do not introduce a separate failed status).
- Statuses only ever advance via their defined triggers; a status refresh that sees a cancellation moves an active profile to `cancelled`. Checked-Out and post-stay states are future work.

## Architecture — Units

### 1. Oracle OHIP client (`src/lib/oracle/`)
Reusable infrastructure for all future Oracle use cases. No DB; pure API access + typing.

- `client.ts` — `getAccessToken()`: obtains and **caches the Bearer token in module memory**, refreshing ~60s before the `expires_in` deadline. A `request()` helper attaches `Authorization` + `x-app-key`, sets base URL from env, parses JSON, and returns typed `{ ok, data }` / `{ ok: false, status, error }` (never throws raw).
- `reservations.ts` — typed wrappers:
  - `listArrivals(hotelId, fromDate, toDate, { limit, offset })` → `GET /rsv/v1/hotels/{hotelId}/reservations?arrivalStartDate=&arrivalEndDate=`. Returns a normalized list `{ oracleReservationId, confirmationNumber, guestName, guestEmail, arrivalDate, departureDate, roomType }`.
  - `getReservation(hotelId, reservationId)` → `GET .../{reservationId}`. Returns the raw reservation plus normalized `{ reservationStatus, roomNumber }`.
  - `postPreArrival(hotelId, reservationId, { eta, comment })` → fetch-modify-PUT: GET reservation, append a comment and set expected arrival time, `PUT .../{reservationId}`.
- Env vars: `ORACLE_OHIP_GATEWAY`, `ORACLE_OHIP_CLIENT_ID`, `ORACLE_OHIP_CLIENT_SECRET`, `ORACLE_OHIP_APP_KEY`, `ORACLE_OHIP_USERNAME`, `ORACLE_OHIP_PASSWORD`. The exact OPERA field paths for comment/ETA/room are pinned during implementation against the spec/sandbox; the wrappers isolate that so callers stay stable.

### 2. Pre-arrival question builder (admin, per property)
Admins create/edit/reorder pre-arrival questions for a property. Each question: `prompt`, `type`, `options` (for choice types), `required`, `mapsToEta` (only valid on a `time` question; at most one per property — enforced in the API), `sortOrder`, `isActive`. Follows the existing per-property builder pattern (tabs inside the domain page, like surveys/SOPs).

### 3. Sync (manual button + daily cron)
Two read responsibilities, shared by both triggers:
- **Pull arrivals:** for a property (with `oracleHotelId`) and a date window, call `listArrivals`, **upsert** Guest Profiles on `(propertyId, oracleReservationId)`. New profiles start at `pending_questionnaire` with a freshly minted unique `token`. Existing profiles refresh their snapshot fields (name/dates/roomType) without regressing status.
- **Refresh status:** for profiles in `pending_checkin`, call `getReservation`; if status indicates checked-in, set `checked_in` + `roomNumber`; if cancelled/no-show, set `cancelled`. Updates `lastPulledAt`.

Manual: `POST /api/guest-profiles/sync` (admin/PM with property access) with `{ propertyId, fromDate, toDate }` runs the pull and a status refresh.
Cron: `GET /api/cron/guest-profiles-sync` (Bearer `CRON_SECRET`, in `isPublicRoute`) iterates properties with an `oracleHotelId`, pulls the next N days of arrivals, and refreshes statuses.

### 4. Guest public form (`/pa/[token]`, no auth)
Renders the property's active questions for the Guest Profile identified by `token`. Supports all answer types incl. file upload (→ Supabase Storage bucket `pre-arrival`, stored path/URL on the answer). On submit: persists answers, sets the profile to `pending_approval`. Re-visiting after submission shows a read-only "submitted" state. Route added to `isPublicRoute`; API `GET`/`POST /api/guest-profiles/public/[token]` added too.

### 5. Review & post-back (admin/PM)
On the property Guest Profiles page, staff open a `pending_approval` profile, review answers (and view uploaded files), and click **"Approve & Post to Oracle"** → `POST /api/guest-profiles/[id]/post`:
- Builds a comment block from the answers (a `mapsToEta` time answer also becomes the ETA); notes that any uploaded attachments exist in our system.
- Calls `postPreArrival`. On success → `pending_checkin`, set `postedAt`/`postedBy`. On failure → stays `pending_approval`, set `oracleError` (retryable).

## Data Model

New column:
- `properties.oracleHotelId` — `varchar`, nullable. Edited in the property edit form (admin-only, mirrors the `googlePlaceId` pattern). Maps a property to its OPERA `hotelId`.

New enum:
- `guest_profile_status`: `pending_questionnaire | pending_approval | pending_checkin | checked_in | cancelled`
- `pre_arrival_question_type`: `short_text | long_text | single_choice | multi_choice | date | time | yes_no | file`

New tables (Drizzle conventions: uuid PK, `orgId`, `createdAt`/`updatedAt`, relations):

`guest_profiles`
- `id`, `orgId`, `propertyId` (FK properties, cascade)
- `oracleReservationId` (varchar, not null), `confirmationNumber` (varchar, nullable)
- `guestName`, `guestEmail` (nullable), `arrivalDate` (date), `departureDate` (date, nullable), `roomType` (varchar, nullable), `roomNumber` (varchar, nullable)
- `status` (`guest_profile_status`, default `pending_questionnaire`), `oracleReservationStatus` (varchar, nullable, raw value)
- `token` (varchar, unique, not null)
- `postedAt` (timestamptz, nullable), `postedBy` (FK profiles, set null, nullable), `oracleError` (text, nullable), `lastPulledAt` (timestamptz, nullable)
- timestamps; **unique (`propertyId`, `oracleReservationId`)**

`pre_arrival_questions`
- `id`, `orgId`, `propertyId` (FK properties, cascade)
- `prompt` (varchar), `type` (`pre_arrival_question_type`), `options` (`text[]` default `{}`), `required` (bool default false), `mapsToEta` (bool default false), `sortOrder` (int default 0), `isActive` (bool default true)
- timestamps

`pre_arrival_answers`
- `id`, `guestProfileId` (FK guest_profiles, cascade), `questionId` (FK pre_arrival_questions, set null)
- `promptSnapshot` (varchar — preserves the question text at submit time)
- `valueText` (text, nullable), `valueOptions` (`text[]` default `{}`), `fileUrl` (text, nullable)
- timestamps

## Access & Routes

- **Guest Profiles** domain: picker page `/guest-profiles` (properties the user can access) → management `/properties/[propertyId]/guest-profiles` with two tabs: **Profiles** (list by status, detail/review) and **Questions** (the builder). Access: admin + assigned PM (like tasks). Sidebar entry in `propertyNavItems` (gated by `showPropertySection`).
- **Public** guest form `/pa/[token]` (no auth) → add `/pa/` to `isPublicRoute`.
- Breadcrumb label for `guest-profiles`.
- APIs:
  - `POST /api/guest-profiles/sync` — pull + refresh (admin/PM, property-scoped)
  - `POST /api/guest-profiles/[id]/post` — approve & write-back (admin/PM)
  - `GET/POST/PATCH/DELETE /api/guest-profiles/questions` (+ `[id]`) — builder CRUD (admin)
  - `GET/POST /api/guest-profiles/public/[token]` — guest fetch + submit (public)
  - `GET /api/cron/guest-profiles-sync` — daily cron (Bearer `CRON_SECRET`)

## Phase 2 Boundary (out of scope now)

Checked-In guests ordering from excursions/menus (currently browse-only public links) and pushing orders to a KOT system. Phase 1 only brings a Guest Profile to **Checked-In with a room number**. The guest `token` is designed to double as the guest-portal identity so Phase 2 can surface "Order" on excursions/menu pages for checked-in guests without rework.

## Constraints & Conventions

- DB client stays `{ prepare: false }`.
- Zod: plain `z.string()` (no strict `.url()`); coerce nullable arrays to `[]` before Drizzle writes.
- Numeric/array columns written per existing conventions; all mutations use `.returning()`.
- Pages that fetch data set `export const dynamic = 'force-dynamic'`.
- Auth: pages use `requireAuth()`/`requireRole()`; APIs use `getProfile()`; property-scoped checks via `getUserProperties()`.
- **Migration is hand-written** (per the project's broken drizzle-kit history): `drizzle/NNNN_oracle_guest_profiles.sql` with `IF NOT EXISTS` guards + `--> statement-breakpoint`, applied in Supabase (or from the dev box via `postgres` + `POSTGRES_URL`) **before** the PR merges — to avoid the migration↔merge crash window.
- New env vars documented in CLAUDE.md; Supabase Storage bucket `pre-arrival` created (private) with the service-role client used for signed access.

## Out of Scope (v1)
- Pushing uploaded files to Oracle (API has no attachment POST).
- Automatic emailing/SMS of the pre-arrival link.
- Multiple/versioned question sets per property (one active set).
- Checked-Out / post-stay lifecycle states.
- Phase 2 ordering + KOT.

## Verification
- `npx tsc --noEmit` is the gating type check (note: local macOS build/tsc may hang — Linux/Coolify is authoritative).
- Sandbox round-trip: configure sandbox env → Pull arrivals for a property with `oracleHotelId` → a Guest Profile appears as Pending Questionnaire → open `/pa/[token]`, submit answers + a file → Pending Approval → Approve & Post → verify comment + ETA on the reservation in the sandbox → Pending Check-In → mark Arrived/InHouse in the sandbox → refresh → Checked-In with room number.
- Non-admin/non-PM cannot access management routes; public token route works without auth.
