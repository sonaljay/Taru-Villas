import { describe, expect, it } from 'vitest'
import { aggregateRoomNights, defaultFutureRange, validateReportRange } from './room-nights'
import type { OracleBooking } from '@/lib/oracle/types'
const fixture = (overrides: Partial<OracleBooking> = {}): OracleBooking => ({ oracleReservationId: 'synthetic', confirmationNumber: 'fixture-confirmation', guestName: 'Private', guestEmail: 'private@example.invalid', guestPhone: 'private', arrivalDate: '2026-10-30', departureDate: '2026-11-02', roomType: 'DLX', roomNumber: null, roomQuantity: 2, adultCount: 2, childCount: 0, reservationStatus: 'Reserved', stayState: 'reserved', channelCode: 'Direct', sourceCode: null, marketCode: null, isRoomReservation: true, isPseudoRoom: false, inventoryGroupId: null, inventoryDisposition: 'count', ...overrides })
const range = { fromDate: '2026-10-01', toDateExclusive: '2026-12-01' }
describe('stay-month room nights', () => {
  it('splits two rooms across October and November and matches channel and drill-down totals', () => {
    const r = aggregateRoomNights([fixture()], range)
    expect(r.months.map(m => [m.month, m.roomNights])).toEqual([['2026-10',4],['2026-11',2]])
    expect(r.totalRoomNights).toBe(6)
    expect(r.months[0].byChannel).toEqual([{ channel: 'Direct', roomNights: 4 }])
    expect(r.rows[0].monthlyNights).toEqual({ '2026-10': 4, '2026-11': 2 })
    expect(JSON.stringify(r)).not.toContain('private@example.invalid')
  })
  it('excludes checkout day and clips already-in-house stays to remaining nights', () => {
    const r = aggregateRoomNights([fixture({ arrivalDate: '2026-09-30', departureDate: '2026-10-07', stayState: 'in_house', roomQuantity: 1 })], { fromDate: '2026-10-05', toDateExclusive: '2026-11-01' })
    expect(r.totalRoomNights).toBe(2)
  })
  it.each([['2026-12-30','2027-01-02',[2,1]], ['2028-02-28','2028-03-02',[2,1]]])('handles %s calendar boundaries', (arrivalDate, departureDate, want) => {
    const fromDate = arrivalDate.slice(0,7)+'-01'
    const toDateExclusive = departureDate.slice(0,7)==='2027-01' ? '2027-02-01' : '2028-04-01'
    expect(aggregateRoomNights([fixture({ arrivalDate, departureDate, roomQuantity: 1 })], { fromDate, toDateExclusive }).months.map(m => m.roomNights)).toEqual(want)
  })
  it.each(['cancelled','no_show','waitlist','checked_out'] as const)('excludes %s', stayState => expect(aggregateRoomNights([fixture({ stayState })],range).totalRoomNights).toBe(0))
  it('deduplicates reservation IDs, skips secondary shares and quarantines unknown inventory', () => {
    const r = aggregateRoomNights([fixture(), fixture(), fixture({ oracleReservationId: 'secondary', inventoryDisposition: 'secondary_share' }), fixture({ oracleReservationId: 'unresolved', inventoryDisposition: 'unresolved' }), fixture({ oracleReservationId: 'quantity', roomQuantity: null })],range)
    expect(r.totalRoomNights).toBe(6)
    expect(r.excludedQualityRecords).toBe(2)
    expect(r.months.map(m => m.contributingReservations)).toEqual([1,1])
  })
  it('quarantines conflicting primary-share groups rather than double counting', () => {
    const r = aggregateRoomNights([fixture({ inventoryGroupId: 'group' }),fixture({ oracleReservationId: 'other', inventoryGroupId: 'group' })],range)
    expect(r.totalRoomNights).toBe(0)
    expect(r.excludedQualityRecords).toBe(2)
  })
  it('excludes pseudo/non-room bookings and flags unknown states or invalid dates', () => {
    const r = aggregateRoomNights([fixture({ isPseudoRoom: true }),fixture({ oracleReservationId: 'non-room', isRoomReservation: false }),fixture({ oracleReservationId: 'unknown', stayState: 'unknown' }),fixture({ oracleReservationId: 'invalid', arrivalDate: '2026-02-30' }),fixture({ oracleReservationId: 'zero', departureDate: '2026-10-30' })],range)
    expect(r.totalRoomNights).toBe(0)
    expect(r.excludedQualityRecords).toBe(3)
  })
  it('keeps empty months and handles unknown channels', () => {
    expect(aggregateRoomNights([],range).months.map(m => m.roomNights)).toEqual([0,0])
    expect(aggregateRoomNights([fixture({ channelCode: null })],range).months[0].byChannel).toEqual([{ channel: 'Unknown', roomNights: 4 }])
  })
  it('uses Colombo date and twelve calendar buckets for its default window', () => {
    expect(defaultFutureRange(new Date('2026-10-04T20:00:00Z'))).toEqual({ fromDate: '2026-10-05', toDateExclusive: '2027-10-01' })
  })
  it('rejects past, impossible, reverse and oversized report ranges', () => {
    const now = new Date('2026-10-05T08:00:00Z')
    for (const r of [range, { fromDate: '2026-02-30', toDateExclusive: '2027-01-01' }, { fromDate: '2026-10-05', toDateExclusive: '2026-10-05' }, { fromDate: '2026-10-05', toDateExclusive: '2029-01-01' }]) expect(() => validateReportRange(r, now)).toThrow()
    expect(() => validateReportRange(defaultFutureRange(now),now)).not.toThrow()
  })
})
