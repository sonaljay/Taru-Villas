import { describe, expect, it, vi } from 'vitest'
import { verifyLoOracle } from '../../../scripts/verify-lo-oracle.mjs'
const config = { environment: 'production', gateway: 'https://mtcs1pr.hospitality-api.ap-singapore-1.ocs.oraclecloud.com', clientId: 'private-client', clientSecret: 'private-secret', appKey: 'private-app', enterpriseId: 'TVPL' }
describe('bounded LO diagnostics', () => {
  it('returns only safe presence summaries and hotel mapping, with GET-only data calls', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ access_token: 'private-token' })).mockResolvedValueOnce(Response.json({ hotelConfigInfo: { hotelId: 'LO', hotelName: 'Hotel Fixture' } })).mockResolvedValueOnce(Response.json({ reservations: { reservationInfo: [{ reservationIdList: [{ type: 'Reservation', id: 'private-id' }], reservationGuest: { givenName: 'Private Guest', email: 'private-email', phoneNumber: 'private-phone' }, roomStay: { arrivalDate: '2026-10-05', departureDate: '2026-10-07', numberOfRooms: 1 } }], offset: 2, totalResults: 1, hasMore: false } })).mockResolvedValueOnce(Response.json({ reservations: { reservation: [{ roomStay: {}, reservationGuests: [] }] } }))
    const summary = await verifyLoOracle(config, fetcher)
    expect(summary).toMatchObject({ hotel: { status: 200, hotelId: 'LO', hotelName: 'Hotel Fixture' }, arrivals: { status: 200, count: 1, normalized: true, pagination: { envelope: { hasMore: false, offset: 2, totalResults: 1 }, root: { hasMore: null, offset: null, totalResults: null } } }, detail: { status: 200 } })
    const serialized = JSON.stringify(summary)
    for (const secret of ['private-client','private-secret','private-app','private-token','private-id','Private Guest','private-email','private-phone']) expect(serialized).not.toContain(secret)
    expect(fetcher.mock.calls.slice(1).every(([, init]) => init.method === 'GET')).toBe(true)
    expect(new URL(fetcher.mock.calls[2][0]).searchParams.get('limit')).toBe('2')
  })
  it('refuses UAT or unknown hosts before any request', async () => {
    const fetcher = vi.fn()
    await expect(verifyLoOracle({ ...config, environment: 'uat' }, fetcher)).rejects.toThrow('Production LO diagnostics only')
    await expect(verifyLoOracle({ ...config, gateway: 'https://example.invalid' }, fetcher)).rejects.toThrow('Production LO diagnostics only')
    expect(fetcher).not.toHaveBeenCalled()
  })
})
