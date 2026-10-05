import type { OracleBooking } from '@/lib/oracle/types'
import { validOracleDate } from '@/lib/oracle/reservations'
export interface MonthlyBookings { month: string; roomNights: number; contributingReservations: number; byChannel: { channel: string; roomNights: number }[] }
export interface BookingReport {
  months: MonthlyBookings[]; totalRoomNights: number; excludedQualityRecords: number
  rows: { reservationId: string; confirmationNumber: string | null; arrivalDate: string; departureDate: string; roomType: string | null; roomQuantity: number | null; stayState: string; channelCode: string | null; monthlyNights: Record<string, number> }[]
}
export class ReportRangeError extends Error {}
export interface ReportRange { fromDate: string; toDateExclusive: string }
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86400000
function nextMonth(month: string): string {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d.toISOString().slice(0,10)
}
export function inclusiveLastDate(exclusiveEnd: string): string {
  if (!validOracleDate(exclusiveEnd)) throw new ReportRangeError('Invalid report range')
  return new Date((day(exclusiveEnd) - 1) * 86400000).toISOString().slice(0,10)
}
function validateBounds(range: ReportRange): void {
  if (!validOracleDate(range.fromDate) || !validOracleDate(range.toDateExclusive) || range.toDateExclusive <= range.fromDate) throw new ReportRangeError('Invalid report range')
  const [sy,sm] = range.fromDate.split('-').map(Number), [ey,em] = inclusiveLastDate(range.toDateExclusive).split('-').map(Number)
  if ((ey - sy) * 12 + em - sm >= 24) throw new ReportRangeError('Select at most 24 calendar months')
}
export function defaultFutureRange(now: Date): ReportRange {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const get = (key: string) => parts.find(p => p.type === key)!.value
  const fromDate = `${get('year')}-${get('month')}-${get('day')}`
  const d = new Date(`${fromDate.slice(0,7)}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + 12)
  return { fromDate, toDateExclusive: d.toISOString().slice(0,10) }
}
export function validateReportRange(range: ReportRange, now = new Date()): void {
  validateBounds(range)
  if (range.fromDate < defaultFutureRange(now).fromDate) throw new ReportRangeError('Select future stay dates')
}
export function aggregateRoomNights(bookings: OracleBooking[], range: ReportRange): BookingReport {
  validateBounds(range)
  const months: MonthlyBookings[] = []
  for (let first = `${range.fromDate.slice(0,7)}-01`; first < range.toDateExclusive; first = nextMonth(first.slice(0,7))) months.push({ month: first.slice(0,7), roomNights: 0, contributingReservations: 0, byChannel: [] })
  const unique = [...new Map(bookings.map(b => [b.oracleReservationId, b])).values()]
  const groups = new Map<string, number>()
  for (const b of unique) if (b.inventoryGroupId && b.inventoryDisposition === 'count' && b.isRoomReservation && !b.isPseudoRoom && (b.stayState === 'reserved' || b.stayState === 'in_house')) groups.set(b.inventoryGroupId, (groups.get(b.inventoryGroupId) ?? 0) + 1)
  const report: BookingReport = { months, totalRoomNights: 0, excludedQualityRecords: 0, rows: [] }
  for (const b of unique) {
    if (!b.isRoomReservation || b.isPseudoRoom || b.inventoryDisposition === 'secondary_share' || ['cancelled','no_show','waitlist','checked_out'].includes(b.stayState)) continue
    if (!validOracleDate(b.arrivalDate) || !validOracleDate(b.departureDate) || b.departureDate <= b.arrivalDate) { report.excludedQualityRecords++; continue }
    if (b.arrivalDate >= range.toDateExclusive || b.departureDate <= range.fromDate) continue
    if (b.stayState === 'unknown' || b.inventoryDisposition === 'unresolved' || (b.inventoryGroupId && (groups.get(b.inventoryGroupId) ?? 0) > 1) || b.roomQuantity === null || !Number.isSafeInteger(b.roomQuantity) || b.roomQuantity <= 0 || !Number.isSafeInteger((day(b.departureDate) - day(b.arrivalDate)) * b.roomQuantity)) { report.excludedQualityRecords++; continue }
    const monthlyNights: Record<string, number> = {}
    for (const bucket of months) {
      const nights = Math.max(0, Math.min(day(b.departureDate), day(nextMonth(bucket.month)), day(range.toDateExclusive)) - Math.max(day(b.arrivalDate), day(`${bucket.month}-01`), day(range.fromDate))) * b.roomQuantity
      if (nights === 0) continue
      monthlyNights[bucket.month] = nights
      bucket.roomNights += nights; bucket.contributingReservations++; report.totalRoomNights += nights
      const channel = b.channelCode ?? 'Unknown'
      const group = bucket.byChannel.find(c => c.channel === channel)
      if (group) group.roomNights += nights
      else bucket.byChannel.push({ channel, roomNights: nights })
    }
    if (Object.keys(monthlyNights).length) report.rows.push({ reservationId: b.oracleReservationId, confirmationNumber: b.confirmationNumber, arrivalDate: b.arrivalDate, departureDate: b.departureDate, roomType: b.roomType, roomQuantity: b.roomQuantity, stayState: b.stayState, channelCode: b.channelCode, monthlyNights })
  }
  for (const bucket of months) bucket.byChannel.sort((a,b) => b.roomNights - a.roomNights || a.channel.localeCompare(b.channel))
  return report
}
