# LO Oracle Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import complete, normalized production LO reservations through an enforced read-only Oracle connection and expose safe property-scoped reads for reporting and the guest portal.

**Architecture:** Reuse `src/lib/oracle` and `guest_profiles`. Stage resumable synchronization work and publish canonical fields transactionally only when the run is complete. Questionnaire state and public-link state belong to Taru and survive refreshes.

**Tech Stack:** Existing Next.js 16, TypeScript, Drizzle/PostgreSQL, Zod v4, Vitest, Node crypto; no added packages.

**Spec:** `docs/superpowers/specs/2026-10-05-lo-oracle-sales-guest-portal-design.md` (approved 2026-10-05).

## Global Constraints

- Work in `.worktrees/taru-release`, preserve `deployment-profile.json` as `taru-release`, and leave the unrelated dirty primary checkout untouched.
- Oracle property data uses GET only; POST is allowed only at `/oauth/v1/tokens`. Disable `postPreArrival` before any live client test.
- Use `enterpriseId=TVPL`, `x-hotelid=LO`, and `urn:opc:hgbu:ws:__myscopes__`; secrets are server-only and never committed.
- Keep `prepare: false`, `.returning()` on application mutations, organization/property scope, and `force-dynamic` on data pages.
- No production migration, deployment, real guest email, or mutation of Oracle records during implementation/testing. Use isolated DB fixtures for writes.
- Every test cycle below is red, implementation, green, then a focused commit. Review the staged diff before each commit.

## Review Focus

- Invalid calendar dates and impossible stay ranges must be quarantined, not silently turned into room nights (Task 1).
- A successful but malformed envelope must fail safely rather than wipe the last complete snapshot (Tasks 1 and 4).
- Concurrent/resumed sync workers must not publish partial data or preserve an obsolete lease (Task 4).
- Changed credentials/environments and expired tokens must not reuse the wrong authentication cache (Task 2).
- An admin from a different organization must not access an LO property by guessing its UUID (Task 3).

## Execution order and file boundaries

Execute this plan, then `2026-10-05-lo-sales-marketing.md`, then `2026-10-05-lo-guest-portal-email.md`. Native execution in the current chat is recommended because the tasks share a tight data contract. Execution method and plan review remain for the user to confirm.

- `oracle/types.ts`: shared normalized record and search page contracts.
- `oracle/reservations.ts`: pure envelope parsing, status classification, share/inventory interpretation.
- `oracle/client.ts`: read-only transport, token lifecycle, documented GET wrappers.
- `oracle/access.ts`: active staff and organization/property/LO authorization.
- `db/queries/guest-profiles.ts`: canonical imported fields and scoped readers.
- `db/queries/oracle-sync.ts`, `oracle/sync.ts`: persisted work/leases, staging, resumable phases, atomic publication.
- `scripts/verify-lo-oracle.mjs`: bounded GET verification producing field-presence summaries only.

### Task 1: Production payload normalization

**Files:** Modify `src/lib/oracle/types.ts`, `src/lib/oracle/reservations.ts`; create `src/lib/oracle/reservations.test.ts`.

**Interfaces:** Produce the following shared contracts; all subsequent plans import them from `@/lib/oracle/types`.

```ts
type StayState = 'reserved' | 'in_house' | 'checked_out' | 'cancelled' | 'no_show' | 'waitlist' | 'unknown'
interface OracleBooking {
  oracleReservationId: string; confirmationNumber: string | null
  guestName: string | null; guestEmail: string | null; guestPhone: string | null
  arrivalDate: string; departureDate: string
  roomType: string | null; roomNumber: string | null; roomQuantity: number | null
  adultCount: number | null; childCount: number | null
  reservationStatus: string | null; stayState: StayState
  channelCode: string | null; sourceCode: string | null; marketCode: string | null
  isRoomReservation: boolean; isPseudoRoom: boolean
  inventoryGroupId: string | null; inventoryDisposition: 'count' | 'secondary_share' | 'unresolved'
}
interface OraclePage { bookings: OracleBooking[]; offset: number; hasMore: boolean; totalResults: number | null }
```

Produce `parseReservationPage(raw: unknown): OraclePage`, `parseReservationDetail(raw: unknown): OracleBooking`, and `classifyStayState(raw: unknown): StayState`. Add a typed parse error whose message never contains guest values. Strict date validation uses a UTC round trip; departure must follow arrival. An unrecognized status remains `unknown`. Keep compatibility adapters for old call sites until Task 4 replaces them.

Define `OracleParseError extends Error` in `reservations.ts`; define `OracleAccessError extends Error` with a numeric `status` in `access.ts` in Task 3. Named fixture/mock helpers in test snippets are test-local builders of the listed contracts, not production exports.

- [ ] **Step 1: Add synthetic list/detail fixtures and failing tests.** Include typed identifiers in reversed order, plural detail guests, empty responses, bad envelopes, actual leap dates, missing quantities, share groups, and null contact data.

```ts
it('rejects an impossible date', () => {
  expect(() => parseReservationPage({ reservations: { reservationInfo: [{
    reservationIdList: [{ type: 'Reservation', id: 'synthetic-1' }],
    roomStay: { arrivalDate: '2026-02-30', departureDate: '2026-03-02' },
  }] } })).toThrow()
})
it('accepts an explicitly empty list', () => {
  expect(parseReservationPage({ reservations: { totalResults: 0, hasMore: false } }).bookings).toEqual([])
})
it('rejects a nonempty result without its array', () => {
  expect(() => parseReservationPage({ reservations: { totalResults: 12 } })).toThrow()
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/oracle/reservations.test.ts`; expect missing exports/failed assertions.
- [ ] **Step 3: Implement typed readers.** List IDs use `type === 'Reservation'` and `type === 'Confirmation'`; full detail uses `reservations.reservation[0]`, primary `reservationGuests`, nested `profileInfo.profile.customer.personName`, `emails.emailInfo`, and `telephones.telephoneInfo`. Prefer primary contact entries. Use the list's `roomStay.roomType/roomId`; detail uses `currentRoomInfo` and daily room rates. Read number-of-rooms directly when present, otherwise validate detail quantities; do not default unknown quantity to one. Follow Oracle's published share/primary-share fields; secondary shares do not count and unresolved shares enter the quality bucket.

```ts
const ids = Array.isArray(record.reservationIdList) ? record.reservationIdList : []
const reservationId = ids.find(id => id.type === 'Reservation')?.id
const confirmationNumber = ids.find(id => id.type === 'Confirmation')?.id ?? null
const rows = envelope.reservationInfo
if (rows === undefined && envelope.totalResults === 0) return { bookings: [], offset: 0, hasMore: false, totalResults: 0 }
if (!Array.isArray(rows)) throw new OracleParseError('Unexpected reservation list envelope')
```

- [ ] **Step 4:** Run the focused tests and `npx tsc --noEmit`; fix errors without real guest fixtures.
- [ ] **Step 5:** Commit as `feat(oracle): normalize verified LO reservation payloads`.

### Task 2: Read-only client-credentials transport

**Files:** Modify `src/lib/oracle/client.ts`; create `src/lib/oracle/client.test.ts`, `.env.oracle.example`; update Oracle configuration in `CLAUDE.md`.

**Interfaces:** Produce `listReservationPage(hotelId: string, search: { fromDate?: string; toDate?: string; searchType?: 'InHouse'; offset: number; limit: number }): Promise<OhipResult<OraclePage>>`, `readReservation(hotelId: string, reservationId: string): Promise<OhipResult<OracleBooking>>`, `readHotel(hotelId: string): Promise<OhipResult<{ hotelId: string; hotelName: string }>>`, and the existing safe `testConnection()`. Do not expose a generic method/path request to consumers.

- [ ] **Step 1: Write failing mocked-fetch tests.** Assert correct scope, Basic authentication, enterprise and hotel headers, `recentlyAccessed=false`, aborted/invalid JSON handling, one 401 refresh, config isolation, and rejection of write-back without a request.

```ts
it('disables Oracle write-back before networking', async () => {
  const spy = vi.spyOn(globalThis, 'fetch')
  const result = await postPreArrival('LO', 'synthetic-1', { eta: null, comment: 'test' })
  expect(result.ok).toBe(false)
  expect(spy).not.toHaveBeenCalled()
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/oracle/client.test.ts`; expect failure against the old password-grant/stub behavior.
- [ ] **Step 3: Implement OAuth/GET wrappers.** Production mode allows the supplied production gateway; UAT is explicit and never used by release persistence. Build a configuration-keyed token cache plus a single-flight token promise. Token expiry has a 60-second margin, data requests a 20-second timeout, redirects are rejected, and errors contain status/category only. Remove response-body logging. Keep `postPreArrival` as a disabled compatibility function until no callers remain.

```ts
const tokenBody = new URLSearchParams({
  grant_type: 'client_credentials', scope: 'urn:opc:hgbu:ws:__myscopes__',
})
const dataHeaders = { Authorization: `Bearer ${token}`, 'x-app-key': cfg.appKey, 'x-hotelid': hotelId }
const disabled = { ok: false as const, status: 405, error: 'Oracle write-back is disabled' }
```

Document `ORACLE_OHIP_ENVIRONMENT`, `ORACLE_OHIP_GATEWAY`, `ORACLE_OHIP_ENTERPRISE_ID`, `ORACLE_OHIP_CLIENT_ID`, `ORACLE_OHIP_CLIENT_SECRET`, `ORACLE_OHIP_APP_KEY`, `ORACLE_OHIP_SCOPE` with placeholders only. Old username/password variables are unnecessary for this connection.
- [ ] **Step 4:** Run both Oracle test files and TypeScript; assert no test uses real network.
- [ ] **Step 5:** Commit as `feat(oracle): enforce read-only client credentials access`.

### Task 3: Scoped reservation schema and access

**Files:** Modify `src/lib/db/schema.ts`, `src/lib/db/queries/guest-profiles.ts`; create `drizzle/0037_lo_oracle_reservations.sql`, `src/lib/oracle/access.ts`, `src/lib/oracle/access.test.ts`, `src/lib/db/queries/guest-profiles.test.ts`. Recheck migration filenames at execution; 0036 is the current highest prefix.

**Interfaces:** Produce `requireLoPropertyAccess(propertyId: string): Promise<{ actorId: string; orgId: string; propertyId: string; oracleHotelId: 'LO' }>` and `getOracleBookingsForProperty(orgId: string, propertyId: string): Promise<OracleBooking[]>`. Existing guest queries gain explicit `orgId` arguments and all call sites are updated. Canonical records carry source environment and sync run identity; UI consumers use `OracleBooking`, not unrestricted Drizzle rows.

- [ ] **Step 1: Add authorization and projection tests using DB/guard mocks.** Cover inactive accounts, ordinary staff, unassigned PMs, foreign-organization admins, non-LO properties, and absence of tokens/internal notes in booking projections.

```ts
it('rejects an admin accessing another organization', async () => {
  vi.mocked(getProfile).mockResolvedValue({ id: 'actor', role: 'admin', orgId: 'org-a', isActive: true } as never)
  vi.mocked(getPropertyByIdForOrganization).mockResolvedValue(undefined)
  await expect(requireLoPropertyAccess('foreign-property')).rejects.toMatchObject({ status: 404 })
})
```

- [ ] **Step 2:** Run the two test files; expect missing/new contracts to fail.
- [ ] **Step 3: Add the migration, Drizzle fields, and guards.** Guest profile additions: `guest_phone`, `room_quantity`, `adult_count`, `child_count`, `stay_state`, `channel_code`, `source_code`, `market_code`, `is_room_reservation`, `is_pseudo_room`, `inventory_group_id`, `inventory_disposition`, `oracle_environment`, `last_synced_run_id`. Quantities are nullable with positive/nonnegative checks as applicable. Source environment is production for this release. Preserve the existing unique property/reservation identity. Restrict all readers by organization and property; verify active property and `oracleHotelId === 'LO'` before using the client.

Add `oracle_sync_runs` (org/property, production environment, range, phase/cursor, state, lease expiry, error category, started/completed times) and `oracle_sync_staging` (run ID, reservation ID, normalized JSON only, unique run/reservation). Only server-side persistence can query staging; clean failed/stale runs after seven days.

```ts
const property = await getPropertyByIdForOrganization(propertyId, profile.orgId)
if (!property || !property.isActive || property.oracleHotelId !== 'LO') throw new OracleAccessError('Property not found', 404)
if (profile.role !== 'admin' && !(await getUserProperties(profile.id, profile.role))?.includes(propertyId)) {
  throw new OracleAccessError('Forbidden', 403)
}
```

- [ ] **Step 4:** Test migration twice on an isolated database, introspect constraints/columns, and run focused tests/TypeScript. Do not use the shared production DB for migration tests.
- [ ] **Step 5:** Commit as `feat(oracle): add scoped LO reservation snapshots`.

### Task 4: Resumable complete synchronization

**Files:** Modify `src/lib/oracle/sync.ts`; create `src/lib/db/queries/oracle-sync.ts`, `src/lib/oracle/sync.test.ts`; modify the two guest-profile sync routes and `src/app/api/oracle/test-connection/route.ts`.

**Interfaces:** Produce `advanceLoSync(scope: { orgId: string; propertyId: string }, options: { fromDate: string; toDate: string; budgetMs: number }): Promise<{ runId: string; state: 'running' | 'complete' | 'failed'; processed: number; error?: string }>` and `getLoSyncStatus(orgId: string, propertyId: string): Promise<{ lastSuccessAt: string | null; fromDate: string | null; toDate: string | null; state: string; error: string | null }>`.

Persistence exports in `db/queries/oracle-sync.ts`: `stageLoPage(runId: string, bookings: OracleBooking[]): Promise<void>`, `saveLoCursor(runId: string, cursor: { phase: string; offset: number }): Promise<void>`, `advanceLoPhase(runId: string): Promise<void>`, and `publishLoSync(runId: string, leaseOwner: string): Promise<void>`. Run acquisition returns its persisted phase/cursor/lease owner. Define `OracleProtocolError extends Error` locally in `sync.ts` with safe category-only messages.

- [ ] **Step 1: Write failing orchestration tests with synthetic mocked pages and persistence.** Cover multiple pages, repeated/resumed pages, zero-length page with hasMore, duplicate IDs, one failed detail, cancellations/date moves, preceding-month in-house arrivals, expired leases, and no canonical publication on partial/failing runs.

```ts
it('does not publish a partial snapshot', async () => {
  vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: true, data: { bookings: [booking], offset: 0, hasMore: true, totalResults: 2 } })
  vi.mocked(listReservationPage).mockResolvedValueOnce({ ok: false, status: 502, error: 'Oracle unavailable' })
  await advanceLoSync(scope, { fromDate: '2026-10-05', toDate: '2027-09-30', budgetMs: 45000 })
  expect(publishLoSync).not.toHaveBeenCalled()
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/oracle/sync.test.ts`; expect old one-page behavior to fail.
- [ ] **Step 3: Implement persisted phases.** Use monthly arrival windows with pages of 100; cap 20,000 distinct reservations per run. Next phases are in-house pages, reconciliation of previously active IDs missing from arrivals, and detail enrichment for missing quantity/unresolved shares. Stage with idempotent run/ID upserts. Acquire a two-minute database lease and stop with `running` before the request budget expires. Persist every cursor only after its staged page succeeds. No progress on a hasMore page is a protocol error.

```ts
if (page.hasMore && page.bookings.length === 0) throw new OracleProtocolError('Pagination made no progress')
await stageLoPage(run.id, page.bookings)
await saveLoCursor(run.id, { phase: run.phase, offset: page.offset + page.bookings.length })
if (!page.hasMore) await advanceLoPhase(run.id)
```

The publishing transaction locks the run/property, verifies ownership of the lease and that all phases finished, upserts canonical fields, sets the latest complete status, and completes the run. Upserts preserve tokens/questionnaire state; source state drives guest availability. Network calls are outside the publishing transaction. Cron authenticates with constant-time Bearer comparison, processes only active mapped production LO properties, and resumes rather than restarting. Manual API authenticates active admin/assigned PM and uses the same job. Do not schedule external jobs yet.
- [ ] **Step 4:** Run sync tests and an isolated persistence integration covering lease contention and atomic rollback. Run Oracle and authorization suites together.
- [ ] **Step 5:** Commit as `feat(oracle): publish complete resumable LO syncs`.

### Task 5: Staff refresh, release gating, and operational verification

**Files:** Modify guest-profile pages/component, `src/lib/client-release/build-policy.ts`, `src/lib/client-release/taru-release.test.ts`, `src/lib/client-release/build-policy.test.ts`; create `scripts/verify-lo-oracle.mjs`, `docs/runbooks/lo-oracle.md`. Update the existing release runbook.

**Interfaces:** Staff UI consumes `getLoSyncStatus` and the bounded refresh response; poll the run status while `running`, with a visible stop/error state. Existing guest-profile routes remain organization/property-scoped. Enable only `guest-profiles` in addition to existing release modules at this milestone.

- [ ] **Step 1: Pin release behavior and safe verification output.** Test enabled guest-profile routes while unrelated routes remain blocked, including near-prefix paths. Add a mocked script test that rejects UAT persistence mode and never prints token, guest name, email, phone, or reservation identifiers.

```ts
expect(getClientModuleRequestStatus('/guest-profiles', 'dashboard,tasks,fleet,daily-records,guest-profiles')).toBeNull()
expect(getClientModuleRequestStatus('/surveys', 'dashboard,tasks,fleet,daily-records,guest-profiles')).toBe(404)
```

- [ ] **Step 2:** Run client-release tests; expect the new release policy assertion to fail.
- [ ] **Step 3: Update the UI/policy and runbook.** Show raw stay-state labels separately from questionnaire labels, last complete sync time/range, progress, and errors. The test-connection API confirms property access and reports safe diagnostics only. The verification script accepts configuration through an ignored environment file or hidden stdin, requests hotel metadata plus at most two arrivals and one detail, and prints HTTP results/field-presence counts. Use hotel metadata to validate the local mapping before an authorized staff update; do not guess the property from `LO`.

```ts
return { CLIENT_ENABLED_MODULES: 'dashboard,tasks,fleet,daily-records,guest-profiles' }
```

Runbook order: provision server-only credentials, review/apply additive migration to the approved target, validate LO mapping, import without emails, inspect coverage, then configure the protected scheduler. Preserve both development and release policy behavior; no deployment is implied.
- [ ] **Step 4:** Run all focused tests, changed-file lint, `npx tsc --noEmit`, and `npm run build`. Run bounded production GET verification with masked output only. Test manual import/refresh writes only in an isolated dataset.
- [ ] **Step 5:** Commit as `feat(guest-profiles): enable verified LO refresh on Taru release`.

## Completion evidence for this milestone

Record test/build outcomes, exact migration files, safe live HTTP/field-presence results, and outstanding deployment inputs in the runbook. A correct foundation must resume interrupted imports and retain the prior complete snapshot during an Oracle outage. Continue with the sales plan only after its shared interfaces pass.
