import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import postgres from 'postgres'
const orgId = '00000000-0000-4000-8000-000000000011', propertyId = '00000000-0000-4000-8000-000000000031', actorId = '00000000-0000-4000-8000-000000000032'
vi.mock('@/lib/auth/guards', () => ({ getProfile: async () => ({ orgId: '00000000-0000-4000-8000-000000000011', id: '00000000-0000-4000-8000-000000000032', role: 'admin', isActive: true }), getUserProperties: async () => null }))
import { issueGuestLink, revokeGuestLink, resolveGuestScope, recoverGuestLink } from './access'
import { acquireLoRun, advanceLoPhase, publishLoSync, stageLoPage } from '@/lib/db/queries/oracle-sync'
import type { OracleBooking } from '@/lib/oracle/types'
const url = process.env.LO_TEST_DATABASE_URL
const suite = url && process.env.LO_TEST_PORTAL === 'true' ? describe : describe.skip
suite('isolated portal link lifecycle', () => {
  let sql: ReturnType<typeof postgres>, profileId: string
  const booking: OracleBooking = { oracleReservationId: 'access-fixture', confirmationNumber: null, guestName: 'Fixture', guestEmail: 'fixture@example.invalid', guestPhone: null, arrivalDate: '2026-10-08', departureDate: '2026-10-12', roomType: 'DLX', roomNumber: null, roomQuantity: 1, adultCount: 1, childCount: 0, reservationStatus: 'Reserved', stayState: 'reserved', channelCode: null, sourceCode: null, marketCode: null, isRoomReservation: true, isPseudoRoom: false, inventoryGroupId: null, inventoryDisposition: 'count' }
  async function publish(value = booking) { const run = await acquireLoRun({ orgId, propertyId }, { fromDate: '2026-10-05', toDate: '2027-09-30' }); await stageLoPage(run.id, [value], run.leaseOwner!); await advanceLoPhase(run.id, 'publish', run.leaseOwner!); await publishLoSync(run.id, run.leaseOwner!); return run }
  beforeAll(async () => {
    if (!url || !/^postgresql:\/\/[^/]+@(localhost|127\.0\.0\.1):55447\/taru_lo$/.test(url)) throw Error('Disposable database only')
    sql = postgres(url, { prepare: false, max: 5, onnotice: () => {} }); vi.stubEnv('GUEST_PORTAL_LINK_KEY', Buffer.alloc(32, 8).toString('base64')); vi.stubEnv('GUEST_PORTAL_ORIGIN', 'https://fixture.example.invalid')
    await sql`insert into auth.users(id) values(${actorId}) on conflict do nothing`
    await sql`insert into profiles(id,org_id,email,full_name,role) values(${actorId},${orgId},'portal-fixture@example.invalid','Portal Fixture','admin')`
    await sql`insert into properties(id,org_id,name,slug,code,oracle_hotel_id) values(${propertyId},${orgId},'Portal Fixture','portal-fixture','PORTAL-LO','LO')`
  })
  beforeEach(async () => { await sql`delete from guest_profiles where property_id=${propertyId}`; await sql`delete from oracle_sync_runs where property_id=${propertyId}`; await publish(); const [row] = await sql`select id from guest_profiles where property_id=${propertyId}`; profileId = row.id })
  afterAll(async () => { if (sql) { await sql`delete from properties where id=${propertyId}`; await sql`delete from profiles where id=${actorId}`; await sql.end() } })
  it('concurrent issuers receive one active private link', async () => {
    const [a, b] = await Promise.all([issueGuestLink(profileId), issueGuestLink(profileId)]); expect(a.url).toBe(b.url)
    const [row] = await sql`select * from guest_portal_access where guest_profile_id=${profileId}`; expect(await recoverGuestLink(row.id)).toBe(a.url)
    expect(row.encrypted_token).not.toContain(a.url.split('/').at(-1)); expect((await resolveGuestScope(a.url.split('/').at(-1)!)).version).toBe(1)
  })
  it('regeneration rejects old token and preserves questionnaire state on resync', async () => {
    const old = await issueGuestLink(profileId); await revokeGuestLink(profileId); const fresh = await issueGuestLink(profileId)
    await expect(resolveGuestScope(old.url.split('/').at(-1)!)).rejects.toMatchObject({ status: 404 }); expect(fresh.version).toBe(2)
    await sql`update guest_profiles set questionnaire_status='reviewed' where id=${profileId}`
    await publish({ ...booking, departureDate: '2026-10-15' })
    expect((await resolveGuestScope(fresh.url.split('/').at(-1)!)).expiresAt).toBe('2026-10-15T18:29:59.999Z')
    const [row] = await sql`select questionnaire_status from guest_profiles where id=${profileId}`; expect(row.questionnaire_status).toBe('reviewed')
  })
  it('cancellation takes effect on the same credential immediately', async () => {
    const link = await issueGuestLink(profileId); await publish({ ...booking, stayState: 'cancelled' }); await expect(resolveGuestScope(link.url.split('/').at(-1)!)).rejects.toMatchObject({ status: 404 })
  })
  it('database rejects a cross-property booking scope', async () => {
    const link = await issueGuestLink(profileId); expect(link.version).toBe(1)
    await expect(sql`update guest_portal_access set property_id='00000000-0000-4000-8000-000000000012' where guest_profile_id=${profileId}`).rejects.toMatchObject({ code: '23503' })
  })
})
