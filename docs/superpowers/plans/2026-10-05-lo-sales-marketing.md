# LO Sales & Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show complete future LO bookings as room nights allocated to the months of the stay, with a separate Sales & Marketing navigation area.

**Architecture:** Use canonical `OracleBooking` records and sync coverage from the completed foundation plan. A pure aggregation function produces monthly totals and safe drill-down rows. Server-side role/org/property checks precede every read.

**Tech Stack:** Existing TypeScript, Next.js, Drizzle, Recharts, shadcn/ui, Vitest; no new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-05-lo-oracle-sales-guest-portal-design.md`.

## Global Constraints

- Execute after `2026-10-05-lo-oracle-foundation.md` in `.worktrees/taru-release`.
- Oracle remains read-only; report renders make no Oracle requests.
- The chosen metric splits room nights by stay month and excludes checkout day.
- Default range: today through the end of the twelfth displayed calendar month in Asia/Colombo; label the first bucket as remaining nights.
- Admins and assigned PMs access only active LO properties in their organization. Guest contact data, private tokens, and internal notes never enter report payloads.
- No revenue or occupancy percentage without validated source inputs; no new production migration/deployment during tests.

## Review Focus

- A December/January boundary and leap February allocate nights correctly without timezone drift (Task 1).
- Shared room inventory, unknown quantities, and non-room/pseudo-room reservations never silently inflate totals (Task 1).
- A failed/incomplete sync shows the last complete snapshot with its covered dates, rather than a misleading zero (Tasks 2 and 3).
- A manager switching properties cannot retrieve foreign-organization rows or guest links (Task 2).
- Narrow-screen users can read month totals, quality warnings, and drill-down dates without horizontal page overflow (Task 3).

## File boundaries

- `src/lib/sales-marketing/room-nights.ts`: pure aggregation and bounded month-range validation.
- `src/lib/db/queries/sales-marketing.ts`: authorized snapshot reads and safe projection.
- `src/app/(portal)/sales-marketing/page.tsx`: guarded dynamic page.
- `src/app/api/sales-marketing/route.ts`: guarded filter/report endpoint.
- `src/components/sales-marketing/bookings-page-client.tsx`: monthly chart/table, filters, and drill-down.

### Task 1: Deterministic room-night aggregation

**Files:** Create `src/lib/sales-marketing/room-nights.ts`, `src/lib/sales-marketing/room-nights.test.ts`.

**Interfaces:** Consume `OracleBooking` from foundation. Produce:

```ts
interface MonthlyBookings {
  month: string; roomNights: number; contributingReservations: number
  byChannel: { channel: string; roomNights: number }[]
}
interface BookingReport {
  months: MonthlyBookings[]; totalRoomNights: number
  excludedQualityRecords: number
  rows: { reservationId: string; confirmationNumber: string | null; arrivalDate: string;
    departureDate: string; roomType: string | null; roomQuantity: number | null;
    stayState: string; channelCode: string | null; monthlyNights: Record<string, number> }[]
}
aggregateRoomNights(bookings: OracleBooking[], range: { fromDate: string; toDateExclusive: string }): BookingReport
defaultFutureRange(now: Date): { fromDate: string; toDateExclusive: string }
```

- [ ] **Step 1: Add failing pure tests with fully synthetic booking records.** Include October/November, year boundary, leap years, two rooms, same-day/invalid stays, checkout exclusion, reserved/in-house states, cancelled/no-show/waitlist exclusion, duplicate IDs, counted/secondary/unresolved shares, missing quantity, and empty months. Keep a fixture builder in this test file that explicitly supplies every `OracleBooking` field.

```ts
it('splits two rooms across October and November', () => {
  const result = aggregateRoomNights([fixture({ arrivalDate: '2026-10-30', departureDate: '2026-11-02', roomQuantity: 2 })],
    { fromDate: '2026-10-01', toDateExclusive: '2026-12-01' })
  expect(result.months.map(m => [m.month, m.roomNights])).toEqual([['2026-10', 4], ['2026-11', 2]])
})
it('starts the default window on the Colombo date', () => {
  expect(defaultFutureRange(new Date('2026-10-04T20:00:00Z')).fromDate).toBe('2026-10-05')
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/sales-marketing/room-nights.test.ts`; expect missing exports/failures.
- [ ] **Step 3: Implement date-only aggregation.** Parse validated ISO dates into UTC calendar-day ordinals, never into local midnight arithmetic. For each unique eligible reservation and month, intersect the stay, month, and selected range. Count each reservation once per contributing month; contributing reservations are not additive across months. Attribute channel from `channelCode ?? 'Unknown'`. Group verified shared inventory before counting; `secondary_share` contributes zero and `unresolved` contributes a visible quality record.

```ts
const nights = Math.max(0, Math.min(departureDay, monthEndDay, rangeEndDay)
  - Math.max(arrivalDay, monthStartDay, rangeStartDay))
bucket.roomNights += nights * booking.roomQuantity
if (nights > 0) contributingIds.add(booking.oracleReservationId)
```

Validate selected ISO ranges: fromDate is no earlier than today's Colombo date, exclusive end follows start, at most 24 calendar months, and all dates round-trip. Use `Intl.DateTimeFormat(..., { timeZone: 'Asia/Colombo' }).formatToParts()` for the current date. Missing quantities never become one room.
- [ ] **Step 4:** Run all aggregation tests and TypeScript.
- [ ] **Step 5:** Commit as `feat(sales): allocate future room nights by stay month`.

### Task 2: Scoped reporting endpoint and freshness contract

**Files:** Create `src/lib/db/queries/sales-marketing.ts`, `src/lib/sales-marketing/report.test.ts`, `src/app/api/sales-marketing/route.ts`.

**Interfaces:** Consume `requireLoPropertyAccess`, `getOracleBookingsForProperty`, `getLoSyncStatus`, and `aggregateRoomNights`. Produce `getLoBookingReport(propertyId: string, range: { fromDate: string; toDateExclusive: string }): Promise<{ report: BookingReport; sync: { lastSuccessAt: string | null; fromDate: string | null; toDate: string | null; state: string; error: string | null }; coverageComplete: boolean }>`. The API accepts `propertyId`, `fromDate`, and `toDateExclusive` query parameters.

- [ ] **Step 1: Write mocked authorization/projection tests.** Cover missing auth, inactive staff, unassigned PMs, org mismatch, date range outside completed coverage, and absence of guest contacts/tokens in serialized results.

```ts
it('does not expose contact fields or tokens', async () => {
  const result = await getLoBookingReport('lo-property', range)
  const serialized = JSON.stringify(result)
  for (const value of ['private-email@example.test', 'private-phone', 'private-token']) expect(serialized).not.toContain(value)
})
```

- [ ] **Step 2:** Run `npx vitest run src/lib/sales-marketing/report.test.ts`; expect failure/missing implementation.
- [ ] **Step 3: Implement the guarded reader and GET route.** Authenticate before queries. Keep canonical inputs server-side and explicitly project only reporting fields into the result; never spread a guest profile row into output. Validate all query parameters with Zod and return 400 for invalid ranges, 401/403/404 as scoped by foundation, 200 with `coverageComplete=false` for a missing/partial snapshot, and safe 500 for persistence failure. Return `Cache-Control: private, no-store`. API responses cannot mark zero bookings as complete without successful coverage.

```ts
const scope = await requireLoPropertyAccess(propertyId)
const [bookings, sync] = await Promise.all([
  getOracleBookingsForProperty(scope.orgId, scope.propertyId),
  getLoSyncStatus(scope.orgId, scope.propertyId),
])
const coverageComplete = !!sync.lastSuccessAt && !!sync.fromDate && !!sync.toDate
  && sync.fromDate <= range.fromDate && sync.toDate >= inclusiveLastDate(range.toDateExclusive)
```

Implement `inclusiveLastDate` in `room-nights.ts` using the same UTC day arithmetic. The last complete snapshot remains available with its timestamp even if the latest run failed.
- [ ] **Step 4:** Run report/aggregation/access tests and TypeScript.
- [ ] **Step 5:** Commit as `feat(sales): expose scoped LO booking reports`.

### Task 3: Sales & Marketing UI and release integration

**Files:** Create `src/app/(portal)/sales-marketing/page.tsx`, `src/components/sales-marketing/bookings-page-client.tsx`; modify `src/lib/portal/navigation.ts`, `src/lib/portal/navigation.test.ts`, `src/components/layout/header.tsx`, all relevant `src/lib/client-release` tests/policy/routes; update `docs/runbooks/lo-oracle.md`, `docs/runbooks/taru-vercel-release.md`.

**Interfaces:** Page consumes authorized LO properties via `getPropertiesForUser`, server-loaded `getLoBookingReport`, and `defaultFutureRange`. Client requests the scoped GET endpoint when changing property/range.

- [ ] **Step 1: Add failing navigation/module tests.** `/sales-marketing` and `/api/sales-marketing` map to the new `sales-marketing` module; the sidebar group appears for admins/PMs with that module and never ordinary staff. Preserve unrelated module blocks.

```ts
expect(moduleForPath('/api/sales-marketing')).toBe('sales-marketing')
expect(getPortalNavigationGroups({ profile: { role: 'staff', isFleetAdmin: false, canBookFleet: false },
  enabledModules: ['sales-marketing'] }).flatMap(g => g.items).some(i => i.href === '/sales-marketing')).toBe(false)
```

- [ ] **Step 2:** Run the navigation/client-release suites; expect the new route policy to fail.
- [ ] **Step 3: Build the guarded page and client display.** Add `export const dynamic = 'force-dynamic'`; show only accessible mapped LO properties and a setup state if none exists. Add a separate Sales & Marketing sidebar group, selected-month controls, total room-night card, contributing-reservation explanation, Recharts bars, an accessible table of identical totals, channel breakdown, and safe per-month booking drill-down. Use responsive cards/table containers matching existing portal components. Label current month as remaining nights. Show incomplete/stale/error coverage separately from an actual empty result, and direct authorized staff to the existing sync action rather than fetching Oracle in the render.

```tsx
<ResponsiveContainer width="100%" height={280}>
  <BarChart data={data.report.months}>
    <XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip />
    <Bar dataKey="roomNights" name="Booked room nights" />
  </BarChart>
</ResponsiveContainer>
```

Pin the release module list to `dashboard,tasks,fleet,daily-records,guest-profiles,sales-marketing` at this milestone; development behavior stays unchanged. Add the breadcrumb label and update the operational runbook.
- [ ] **Step 4:** Run focused tests, changed-file lint, TypeScript and build. Verify 390px/1440px layouts, keyboard filters, empty and partial states, and month drill-down using synthetic data. No chart/endpoint request goes to Oracle.
- [ ] **Step 5:** Commit as `feat(sales): add LO monthly booking dashboard`.

## Milestone acceptance

Record boundary test outcomes and synthetic screenshots in the runbook. One room from 30 October to 2 November must display 2 October nights and 1 November night. Verify the same total in the chart, table, and drill-down, with no private link/contact data in the browser payload. Continue with the guest portal/email plan.
