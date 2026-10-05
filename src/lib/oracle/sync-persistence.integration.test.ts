import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { acquireLoRun, advanceLoPhase, getLoDetailIds, getLoSyncStatus, publishLoSync, saveLoCursor, stageLoPage } from '@/lib/db/queries/oracle-sync'
import { getOracleBookingsForProperty } from '@/lib/db/queries/guest-profiles'
import type { OracleBooking } from './types'
const url = process.env.LO_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('isolated LO sync transactions', () => {
  let sql: ReturnType<typeof postgres>
  const scope = { orgId: '00000000-0000-4000-8000-000000000011', propertyId: '00000000-0000-4000-8000-000000000013' }
  const options = { fromDate: '2026-10-05', toDate: '2027-09-30' }
  const booking: OracleBooking = { oracleReservationId: 'db-synthetic', confirmationNumber: null, guestName: 'Fixture', guestEmail: 'fixture@example.invalid', guestPhone: null, arrivalDate: '2026-10-05', departureDate: '2026-10-07', roomType: 'DLX', roomNumber: null, roomQuantity: 1, adultCount: 1, childCount: 0, reservationStatus: 'Reserved', stayState: 'reserved', channelCode: null, sourceCode: null, marketCode: null, isRoomReservation: true, isPseudoRoom: false, inventoryGroupId: null, inventoryDisposition: 'count' }
  beforeAll(async () => {
    if (!url || !/^postgresql:\/\/[^/]+@(localhost|127\.0\.0\.1):55447\/taru_lo$/.test(url)) throw Error('Disposable LO database only')
    sql = postgres(url, { prepare: false, max: 5, onnotice: () => {} })
    await sql`insert into properties(id,org_id,name,slug,code,oracle_hotel_id) values(${scope.propertyId},${scope.orgId},'Sync Fixture','sync-fixture','SYNC-LO','LO')`
  })
  beforeEach(async () => { await sql`delete from guest_profiles where property_id=${scope.propertyId}`; await sql`delete from oracle_sync_runs where property_id=${scope.propertyId}` })
  afterAll(async () => { if (sql) { await sql`delete from properties where id=${scope.propertyId}`; await sql.end() } })
  it('only grants one worker a lease under concurrent acquisition', async () => {
    const results = await Promise.all([acquireLoRun(scope, options), acquireLoRun(scope, options)])
    expect(results.filter(r => r.acquired)).toHaveLength(1)
    expect(results[0].id).toBe(results[1].id)
  })
  it('rejects an expired owner after resumption and retains the persisted cursor', async () => {
    const first = await acquireLoRun(scope, options)
    await saveLoCursor(first.id, { phase: first.phase, offset: 100 }, first.leaseOwner!)
    await sql`update oracle_sync_runs set lease_until=now()-interval '1 second' where id=${first.id}`
    const second = await acquireLoRun(scope, options)
    expect(second.id).toBe(first.id)
    expect(second.offset).toBe(100)
    expect(second.leaseOwner).not.toBe(first.leaseOwner)
    await expect(stageLoPage(first.id, [booking], first.leaseOwner!)).rejects.toThrow('lease unavailable')
    await expect(saveLoCursor(first.id, { phase: first.phase, offset: 200 }, first.leaseOwner!)).rejects.toThrow('lease unavailable')
  })
  it('stages duplicate IDs idempotently and publishes only the complete phase', async () => {
    const run = await acquireLoRun(scope, options)
    expect(await stageLoPage(run.id, [booking, booking], run.leaseOwner!)).toBe(1)
    expect(await stageLoPage(run.id, [booking], run.leaseOwner!)).toBe(1)
    await expect(publishLoSync(run.id, run.leaseOwner!)).rejects.toThrow('incomplete')
    expect(await getOracleBookingsForProperty(scope.orgId, scope.propertyId)).toEqual([])
    await advanceLoPhase(run.id, 'publish', run.leaseOwner!)
    await publishLoSync(run.id, run.leaseOwner!)
    expect((await getOracleBookingsForProperty(scope.orgId, scope.propertyId))[0]).toMatchObject({ oracleReservationId: 'db-synthetic', roomQuantity: 1 })
    expect(await getLoSyncStatus(scope.orgId, scope.propertyId)).toMatchObject({ state: 'complete', fromDate: '2026-10-05', toDate: '2027-09-30' })
  })
  it('rolls publication back completely on a bad staged row and preserves local state', async () => {
    const first = await acquireLoRun(scope, options)
    await stageLoPage(first.id, [booking], first.leaseOwner!)
    await advanceLoPhase(first.id, 'publish', first.leaseOwner!)
    await publishLoSync(first.id, first.leaseOwner!)
    await sql`update guest_profiles set status='pending_approval',token='preserved-token' where property_id=${scope.propertyId}`
    const second = await acquireLoRun(scope, options)
    expect(await getLoDetailIds(second.id, 'reconcile')).toEqual(['db-synthetic'])
    await stageLoPage(second.id, [{ ...booking, guestName: 'Changed' }, { ...booking, oracleReservationId: 'db-invalid', roomQuantity: 0 }], second.leaseOwner!)
    await advanceLoPhase(second.id, 'publish', second.leaseOwner!)
    await expect(publishLoSync(second.id, second.leaseOwner!)).rejects.toBeDefined()
    const [profile] = await sql`select guest_name,status,token,last_synced_run_id from guest_profiles where property_id=${scope.propertyId}`
    expect(profile).toMatchObject({ guest_name: 'Fixture', status: 'pending_approval', token: 'preserved-token', last_synced_run_id: first.id })
    const [state] = await sql`select state from oracle_sync_runs where id=${second.id}`
    expect(state.state).toBe('running')
  })
})
