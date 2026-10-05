import { describe, expect, it } from 'vitest'
import { parseReservationPage, parseReservationDetail, classifyStayState } from './reservations'
const row = (overrides: Record<string, unknown> = {}) => ({
  reservationIdList: [{ type: 'Confirmation', id: 'CONF-1' }, { type: 'Reservation', id: 'synthetic-1' }],
  roomStay: { arrivalDate: '2028-02-28', departureDate: '2028-03-02', numberOfRooms: 2, roomType: 'DLX', roomId: '101', adultCount: 2, childCount: 0 },
  reservationGuest: { givenName: 'Test', surname: 'Guest', email: 'test@example.invalid', phoneNumber: 'synthetic' },
  reservationStatus: 'Reserved', ...overrides,
})
const page = (r: unknown) => ({ reservations: { reservationInfo: [r], totalResults: 1, offset: 0, hasMore: false } })
describe('Oracle reservation normalization', () => {
  it('selects typed IDs and normalizes list contacts and inventory', () => {
    expect(parseReservationPage(page(row())).bookings[0]).toMatchObject({ oracleReservationId: 'synthetic-1', confirmationNumber: 'CONF-1', guestName: 'Test Guest', guestEmail: 'test@example.invalid', guestPhone: 'synthetic', roomQuantity: 2, stayState: 'reserved', adultCount: 2, childCount: 0 })
  })
  it('reads primary detail guests and nested primary contacts', () => {
    const r = row({ reservationGuest: undefined, reservationGuests: [
      { primary: false, profileInfo: { profile: { customer: { personName: [{ givenName: 'Wrong' }] } } } },
      { primary: true, profileInfo: { profile: { customer: { personName: [{ givenName: 'Right', surname: 'Guest' }] }, emails: { emailInfo: [{ email: { emailAddress: 'other@example.invalid' } }, { email: { primaryInd: true, emailAddress: 'right@example.invalid' } }] }, telephones: { telephoneInfo: [{ telephone: { phoneNumber: 'fake' } }] } } } },
    ] })
    expect(parseReservationDetail({ reservations: { reservation: [r] } })).toMatchObject({ guestName: 'Right Guest', guestEmail: 'right@example.invalid', guestPhone: 'fake' })
  })
  it.each(['2026-02-30', '2026-13-01', 'not-date', '2026-2-01'])('rejects invalid date %s without exposing input', (date) => {
    expect(() => parseReservationPage(page(row({ roomStay: { arrivalDate: date, departureDate: '2029-01-01' } })))).toThrow('Invalid reservation dates')
  })
  it('rejects reverse and zero-night ranges', () => {
    for (const departureDate of ['2028-02-27', '2028-02-28']) expect(() => parseReservationPage(page(row({ roomStay: { arrivalDate: '2028-02-28', departureDate } })))).toThrow()
  })
  it('accepts explicitly empty results but rejects malformed successful envelopes', () => {
    for (const totalResults of [0, '0']) expect(parseReservationPage({ reservations: { totalResults, hasMore: false } }).bookings).toEqual([])
    for (const raw of [{}, { reservations: { totalResults: 12 } }, { reservations: { reservationInfo: {} } }]) expect(() => parseReservationPage(raw)).toThrow()
  })
  it('does not invent missing contact or room quantity', () => {
    expect(parseReservationPage(page(row({ reservationGuest: {}, roomStay: { arrivalDate: '2028-02-28', departureDate: '2028-03-02' } }))).bookings[0]).toMatchObject({ guestName: null, guestEmail: null, guestPhone: null, roomQuantity: null })
  })
  it('does not infer a fixed room quantity from inconsistent daily rates', () => {
    expect(parseReservationDetail({ reservations: { reservation: [row({ roomStay: { arrivalDate: '2028-02-28', departureDate: '2028-03-02', roomRates: [{ numberOfUnits: 2 }, { numberOfUnits: 1 }] } })] } }).roomQuantity).toBeNull()
  })
  it('rejects missing reservation IDs rather than substituting confirmation IDs', () => {
    expect(() => parseReservationPage(page(row({ reservationIdList: [{ type: 'Confirmation', id: 'secret-confirmation' }] })))).toThrow('Missing reservation identifier')
  })
  it('quarantines shared inventory pending a reliable primary indicator', () => {
    expect(parseReservationPage(page(row({ sharedGuests: [{ reservationId: { type: 'Reservation', id: 'synthetic-2' } }] }))).bookings[0].inventoryDisposition).toBe('unresolved')
  })
  it.each([['Primary', 'count'], ['NonPrimary', 'secondary_share']])('uses documented %s share flag', (primaryShareType, want) => {
    expect(parseReservationPage(page(row({ roomStay: { arrivalDate: '2028-02-28', departureDate: '2028-03-02', primaryShareType }, sharedGuests: [{ reservationId: { id: 'synthetic-2' } }] }))).bookings[0].inventoryDisposition).toBe(want)
  })
  it.each([['InHouse','in_house'], ['CheckedOut','checked_out'], ['Cancelled','cancelled'], ['NoShow','no_show'], ['Waitlist','waitlist'], ['Reserved','reserved'], ['future-unknown','unknown']])('classifies %s', (raw,want) => expect(classifyStayState(raw)).toBe(want))
})
