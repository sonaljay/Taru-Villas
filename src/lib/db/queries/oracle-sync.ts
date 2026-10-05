import { randomBytes, randomUUID } from 'node:crypto'
import { and, asc, desc, eq, inArray, isNotNull, lt, notExists, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestProfiles, oracleSyncRuns, oracleSyncStaging, properties } from '@/lib/db/schema'
import type { OracleBooking } from '@/lib/oracle/types'
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Run = typeof oracleSyncRuns.$inferSelect
export class OracleLeaseError extends Error { constructor() { super('Oracle sync lease unavailable') } }
async function lockedRun(tx: Transaction, runId: string, owner: string): Promise<Run> {
  const [run] = await tx.select().from(oracleSyncRuns).where(and(eq(oracleSyncRuns.id, runId), eq(oracleSyncRuns.state, 'running'), eq(oracleSyncRuns.leaseOwner, owner), sql`${oracleSyncRuns.leaseUntil} > now()`)).for('update')
  if (!run) throw new OracleLeaseError()
  return run
}
export async function acquireLoRun(scope: { orgId: string; propertyId: string }, options: { fromDate: string; toDate: string }): Promise<Run & { acquired: boolean }> {
  return db.transaction(async tx => {
    const [property] = await tx.select().from(properties).where(and(eq(properties.id, scope.propertyId), eq(properties.orgId, scope.orgId), eq(properties.oracleHotelId, 'LO'), eq(properties.isActive, true))).for('update')
    if (!property) throw Error('LO property unavailable')
    const [existing] = await tx.select().from(oracleSyncRuns).where(and(eq(oracleSyncRuns.propertyId, property.id), eq(oracleSyncRuns.orgId, scope.orgId), eq(oracleSyncRuns.state, 'running'))).for('update')
    if (existing?.leaseUntil && existing.leaseUntil > new Date()) return { ...existing, acquired: false }
    const owner = randomUUID()
    if (existing) {
      const [run] = await tx.update(oracleSyncRuns).set({ leaseOwner: owner, leaseUntil: sql`now() + interval '2 minutes'`, updatedAt: new Date() }).where(eq(oracleSyncRuns.id, existing.id)).returning()
      return { ...run, acquired: true }
    }
    const [run] = await tx.insert(oracleSyncRuns).values({ ...scope, ...options, leaseOwner: owner, leaseUntil: sql`now() + interval '2 minutes'` }).returning()
    return { ...run, acquired: true }
  })
}
export async function stageLoPage(runId: string, bookings: OracleBooking[], owner: string): Promise<number> {
  return db.transaction(async tx => {
    await lockedRun(tx, runId, owner)
    const distinct = [...new Map(bookings.map(b => [b.oracleReservationId, b])).values()]
    if (distinct.length) await tx.insert(oracleSyncStaging).values(distinct.map(booking => ({ runId, oracleReservationId: booking.oracleReservationId, booking }))).onConflictDoUpdate({ target: [oracleSyncStaging.runId, oracleSyncStaging.oracleReservationId], set: { booking: sql`excluded.booking`, updatedAt: new Date() } }).returning()
    const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(oracleSyncStaging).where(eq(oracleSyncStaging.runId, runId))
    if (count.count > 20_000) throw Error('Oracle sync record limit exceeded')
    return count.count
  })
}
export async function saveLoCursor(runId: string, cursor: { phase: string; offset: number; lastPageFingerprint?: string | null }, owner: string): Promise<void> {
  await db.transaction(async tx => {
    const run = await lockedRun(tx, runId, owner)
    if (run.phase !== cursor.phase || cursor.offset < run.offset) throw Error('Oracle sync cursor conflict')
    await tx.update(oracleSyncRuns).set({ offset: cursor.offset, lastPageFingerprint: cursor.lastPageFingerprint ?? run.lastPageFingerprint, updatedAt: new Date() }).where(eq(oracleSyncRuns.id, runId)).returning()
  })
}
export async function getLoDetailIds(runId: string, phase: 'reconcile' | 'enrich'): Promise<string[]> {
  const [run] = await db.select().from(oracleSyncRuns).where(eq(oracleSyncRuns.id, runId)).limit(1)
  if (!run) throw Error('Oracle sync not found')
  if (phase === 'reconcile') {
    const rows = await db.select({ id: guestProfiles.oracleReservationId }).from(guestProfiles).where(and(
      eq(guestProfiles.orgId, run.orgId), eq(guestProfiles.propertyId, run.propertyId), isNotNull(guestProfiles.lastSyncedRunId),
      inArray(guestProfiles.stayState, ['reserved', 'in_house', 'unknown']),
      sql`${guestProfiles.departureDate} >= ${run.fromDate}::date`,
      notExists(db.select({ id: oracleSyncStaging.id }).from(oracleSyncStaging).where(and(eq(oracleSyncStaging.runId, runId), eq(oracleSyncStaging.oracleReservationId, guestProfiles.oracleReservationId)))),
    )).orderBy(asc(guestProfiles.oracleReservationId))
    return rows.map(r => r.id)
  }
  const rows = await db.select({ id: oracleSyncStaging.oracleReservationId }).from(oracleSyncStaging).where(and(eq(oracleSyncStaging.runId, runId), sql`(${oracleSyncStaging.booking}->>'roomQuantity' IS NULL OR ${oracleSyncStaging.booking}->>'inventoryDisposition' = 'unresolved')`)).orderBy(asc(oracleSyncStaging.oracleReservationId))
  return rows.map(r => r.id)
}
export async function advanceLoPhase(runId: string, phase: string, owner: string, detailIds: string[] = []): Promise<void> {
  if (detailIds.length > 20_000) throw Error('Oracle sync record limit exceeded')
  await db.transaction(async tx => {
    await lockedRun(tx, runId, owner)
    await tx.update(oracleSyncRuns).set({ phase, offset: 0, detailIds, lastPageFingerprint: null, updatedAt: new Date() }).where(eq(oracleSyncRuns.id, runId)).returning()
  })
}
export async function publishLoSync(runId: string, owner: string): Promise<void> {
  await db.transaction(async tx => {
    const [initial] = await tx.select().from(oracleSyncRuns).where(eq(oracleSyncRuns.id, runId)).limit(1)
    if (!initial) throw new OracleLeaseError()
    const [property] = await tx.select().from(properties).where(and(eq(properties.id, initial.propertyId), eq(properties.orgId, initial.orgId), eq(properties.isActive, true), eq(properties.oracleHotelId, 'LO'))).for('update')
    if (!property) throw Error('LO property unavailable')
    const run = await lockedRun(tx, runId, owner)
    if (run.phase !== 'publish') throw Error('Oracle sync incomplete')
    const staged = await tx.select().from(oracleSyncStaging).where(eq(oracleSyncStaging.runId, runId))
    if (staged.length > 20_000) throw Error('Oracle sync record limit exceeded')
    const now = new Date()
    for (let i = 0; i < staged.length; i += 200) {
      const rows = staged.slice(i, i + 200).map(({ booking: b }) => ({
        orgId: run.orgId, propertyId: run.propertyId, oracleReservationId: b.oracleReservationId,
        confirmationNumber: b.confirmationNumber, guestName: b.guestName, guestEmail: b.guestEmail, guestPhone: b.guestPhone,
        arrivalDate: b.arrivalDate, departureDate: b.departureDate, roomType: b.roomType, roomNumber: b.roomNumber,
        roomQuantity: b.roomQuantity, adultCount: b.adultCount, childCount: b.childCount,
        oracleReservationStatus: b.reservationStatus, stayState: b.stayState, channelCode: b.channelCode, sourceCode: b.sourceCode, marketCode: b.marketCode,
        isRoomReservation: b.isRoomReservation, isPseudoRoom: b.isPseudoRoom, inventoryGroupId: b.inventoryGroupId, inventoryDisposition: b.inventoryDisposition,
        oracleEnvironment: 'production', lastSyncedRunId: run.id, lastPulledAt: now, updatedAt: now,
        token: randomBytes(32).toString('base64url'),
      }))
      await tx.insert(guestProfiles).values(rows).onConflictDoUpdate({ target: [guestProfiles.propertyId, guestProfiles.oracleReservationId], set: {
        confirmationNumber: sql`excluded.confirmation_number`, guestName: sql`excluded.guest_name`, guestEmail: sql`excluded.guest_email`, guestPhone: sql`excluded.guest_phone`,
        arrivalDate: sql`excluded.arrival_date`, departureDate: sql`excluded.departure_date`, roomType: sql`excluded.room_type`, roomNumber: sql`excluded.room_number`,
        roomQuantity: sql`excluded.room_quantity`, adultCount: sql`excluded.adult_count`, childCount: sql`excluded.child_count`,
        oracleReservationStatus: sql`excluded.oracle_reservation_status`, stayState: sql`excluded.stay_state`,
        channelCode: sql`excluded.channel_code`, sourceCode: sql`excluded.source_code`, marketCode: sql`excluded.market_code`,
        isRoomReservation: sql`excluded.is_room_reservation`, isPseudoRoom: sql`excluded.is_pseudo_room`, inventoryGroupId: sql`excluded.inventory_group_id`, inventoryDisposition: sql`excluded.inventory_disposition`,
        oracleEnvironment: 'production', lastSyncedRunId: run.id, lastPulledAt: now, updatedAt: now,
      }, setWhere: eq(guestProfiles.orgId, run.orgId) }).returning()
    }
    await tx.update(oracleSyncRuns).set({ state: 'complete', completedAt: now, leaseOwner: null, leaseUntil: null, error: null, updatedAt: now }).where(eq(oracleSyncRuns.id, runId)).returning()
  })
}
export async function failLoSync(runId: string, owner: string, error: string): Promise<void> {
  await db.update(oracleSyncRuns).set({ state: 'failed', error, leaseOwner: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(oracleSyncRuns.id, runId), eq(oracleSyncRuns.state, 'running'), eq(oracleSyncRuns.leaseOwner, owner))).returning()
}
export async function releaseLoLease(runId: string, owner: string): Promise<void> {
  await db.update(oracleSyncRuns).set({ leaseOwner: null, leaseUntil: null, updatedAt: new Date() }).where(and(eq(oracleSyncRuns.id, runId), eq(oracleSyncRuns.leaseOwner, owner))).returning()
}
export async function getLoSyncStatus(orgId: string, propertyId: string): Promise<{ lastSuccessAt: string | null; fromDate: string | null; toDate: string | null; state: string; error: string | null }> {
  const scope = and(eq(oracleSyncRuns.orgId, orgId), eq(oracleSyncRuns.propertyId, propertyId))
  const [[latest], [complete]] = await Promise.all([
    db.select().from(oracleSyncRuns).where(scope).orderBy(desc(oracleSyncRuns.createdAt)).limit(1),
    db.select().from(oracleSyncRuns).where(and(scope, eq(oracleSyncRuns.state, 'complete'))).orderBy(desc(oracleSyncRuns.completedAt)).limit(1),
  ])
  return { lastSuccessAt: complete?.completedAt?.toISOString() ?? null, fromDate: complete?.fromDate ?? null, toDate: complete?.toDate ?? null, state: latest?.state ?? 'never', error: latest?.error ?? null }
}
export async function cleanLoStaging(): Promise<void> {
  await db.delete(oracleSyncStaging).where(inArray(oracleSyncStaging.runId, db.select({ id: oracleSyncRuns.id }).from(oracleSyncRuns).where(and(lt(oracleSyncRuns.updatedAt, sql`now() - interval '7 days'`), sql`${oracleSyncRuns.state} <> 'running'`)))).returning()
  await db.delete(oracleSyncRuns).where(and(eq(oracleSyncRuns.state, 'failed'), lt(oracleSyncRuns.updatedAt, sql`now() - interval '7 days'`))).returning()
}
