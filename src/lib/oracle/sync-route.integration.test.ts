import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import postgres from 'postgres'
vi.mock('@/lib/auth/guards', () => ({ getProfile: vi.fn(), getUserProperties: vi.fn() }))
vi.mock('./client', () => ({ listReservationPage: vi.fn(), readReservation: vi.fn() }))
import { getProfile } from '@/lib/auth/guards'
import { listReservationPage } from './client'
import { POST } from '@/app/api/guest-profiles/sync/route'
import { parseReservationPage } from './reservations'
const url = process.env.LO_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('isolated staff refresh endpoint', () => {
  let sql: ReturnType<typeof postgres>
  const orgId = '00000000-0000-4000-8000-000000000011', propertyId = '00000000-0000-4000-8000-000000000014'
  beforeAll(async () => {
    if (!url || !/^postgresql:\/\/[^/]+@(localhost|127\.0\.0\.1):55447\/taru_lo$/.test(url)) throw Error('Disposable LO database only')
    sql = postgres(url, { prepare: false, onnotice: () => {} })
    await sql`insert into properties(id,org_id,name,slug,code,oracle_hotel_id) values(${propertyId},${orgId},'Route Fixture','route-fixture','ROUTE-LO','LO')`
    vi.mocked(getProfile).mockResolvedValue({ id: '00000000-0000-4000-8000-000000000015', orgId, role: 'admin', isActive: true } as never)
    const page = parseReservationPage({ reservations: { reservationInfo: [{ reservationIdList: [{ type: 'Reservation', id: 'route-synthetic' }], roomStay: { arrivalDate: '2026-10-05', departureDate: '2026-10-07', numberOfRooms: 2 }, reservationStatus: 'Reserved' }], hasMore: false, offset: 0, totalResults: 1 } })
    vi.mocked(listReservationPage).mockImplementation(async (_hotel, search) => ({ ok: true, data: search.searchType ? { bookings: [], offset: 0, hasMore: false, totalResults: 0 } : page }))
  })
  afterAll(async () => { if (sql) { await sql`delete from properties where id=${propertyId}`; await sql.end() } })
  it('imports synthetic bookings through the authenticated endpoint without Oracle writes', async () => {
    const response = await POST(new NextRequest('http://localhost/api/guest-profiles/sync', { method: 'POST', body: JSON.stringify({ propertyId, fromDate: '2026-10-05', toDate: '2026-10-31' }) }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ state: 'complete', processed: 1 })
    const [profile] = await sql`select room_quantity,stay_state from guest_profiles where property_id=${propertyId}`
    expect(profile).toEqual({ room_quantity: 2, stay_state: 'reserved' })
  })
})
