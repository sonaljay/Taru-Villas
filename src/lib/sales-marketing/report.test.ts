import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/oracle/access', () => ({ requireLoPropertyAccess: vi.fn(), OracleAccessError: class extends Error { constructor(message: string, public status: number) { super(message) } } }))
vi.mock('@/lib/db/queries/guest-profiles', () => ({ getOracleBookingsForProperty: vi.fn() }))
vi.mock('@/lib/db/queries/oracle-sync', () => ({ getLoSyncStatus: vi.fn() }))
import { requireLoPropertyAccess, OracleAccessError } from '@/lib/oracle/access'
import { getOracleBookingsForProperty } from '@/lib/db/queries/guest-profiles'
import { getLoSyncStatus } from '@/lib/db/queries/oracle-sync'
import { getLoBookingReport } from '@/lib/db/queries/sales-marketing'
import { GET } from '@/app/api/sales-marketing/route'
import { NextRequest } from 'next/server'
const property = '00000000-0000-4000-8000-000000000012'
const range = { fromDate: '2026-10-05', toDateExclusive: '2026-12-01' }
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-05T08:00:00Z'))
  vi.mocked(requireLoPropertyAccess).mockResolvedValue({ orgId: 'org-a', propertyId: property, actorId: 'actor', oracleHotelId: 'LO' })
  vi.mocked(getOracleBookingsForProperty).mockResolvedValue([])
  vi.mocked(getLoSyncStatus).mockResolvedValue({ lastSuccessAt: '2026-10-05T07:00:00Z', fromDate: '2026-10-05', toDate: '2026-11-30', state: 'complete', error: null })
})
afterEach(() => vi.useRealTimers())
describe('scoped LO sales reports', () => {
  it.each([401,403,404])('propagates access status %s before reading bookings', async status => {
    vi.mocked(requireLoPropertyAccess).mockRejectedValue(new OracleAccessError('Denied', status))
    const res = await GET(new NextRequest(`http://localhost/api/sales-marketing?propertyId=${property}&fromDate=2026-10-05&toDateExclusive=2026-12-01`))
    expect(res.status).toBe(status)
    expect(getOracleBookingsForProperty).not.toHaveBeenCalled()
  })
  it('projects reporting fields without contacts or private links', async () => {
    vi.mocked(getOracleBookingsForProperty).mockResolvedValue([{ oracleReservationId: 'synthetic', confirmationNumber: null, guestName: 'private-name', guestEmail: 'private-email', guestPhone: 'private-phone', token: 'private-token', arrivalDate: '2026-10-30', departureDate: '2026-11-02', roomType: 'DLX', roomQuantity: 1, stayState: 'reserved', channelCode: null, isRoomReservation: true, isPseudoRoom: false, inventoryDisposition: 'count', inventoryGroupId: null }] as never)
    const result = await getLoBookingReport(property,range)
    expect(result.coverageComplete).toBe(true)
    expect(result.report.totalRoomNights).toBe(3)
    for (const privateValue of ['private-name','private-email','private-phone','private-token']) expect(JSON.stringify(result)).not.toContain(privateValue)
    expect(getOracleBookingsForProperty).toHaveBeenCalledWith('org-a',property)
  })
  it('marks incomplete coverage and missing snapshots instead of calling zero bookings complete', async () => {
    vi.mocked(getLoSyncStatus).mockResolvedValue({ lastSuccessAt: null, fromDate: null, toDate: null, state: 'never', error: null })
    expect((await getLoBookingReport(property,range)).coverageComplete).toBe(false)
    vi.mocked(getLoSyncStatus).mockResolvedValue({ lastSuccessAt: '2026-10-05T07:00:00Z', fromDate: '2026-10-05', toDate: '2026-10-31', state: 'failed', error: 'OHIP HTTP 502' })
    expect((await getLoBookingReport(property,range)).coverageComplete).toBe(false)
  })
  it('keeps complete snapshot coverage after a later failed run and disables caching', async () => {
    vi.mocked(getLoSyncStatus).mockResolvedValue({ lastSuccessAt: '2026-10-05T07:00:00Z', fromDate: '2026-10-05', toDate: '2026-11-30', state: 'failed', error: 'OHIP HTTP 502' })
    const res = await GET(new NextRequest(`http://localhost/api/sales-marketing?propertyId=${property}&fromDate=2026-10-05&toDateExclusive=2026-12-01`))
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(await res.json()).toMatchObject({ coverageComplete: true, sync: { state: 'failed' } })
  })
  it('rejects invalid dates/ranges before canonical reads', async () => {
    const res = await GET(new NextRequest(`http://localhost/api/sales-marketing?propertyId=${property}&fromDate=2026-02-30&toDateExclusive=2026-12-01`))
    expect(res.status).toBe(400)
    expect(getOracleBookingsForProperty).not.toHaveBeenCalled()
  })
})
