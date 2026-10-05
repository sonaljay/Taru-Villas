import type { OracleBooking, OraclePage, StayState } from './types'

export class OracleParseError extends Error {}
const record = (v: unknown): Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : {}
const array = (v: unknown): Record<string, unknown>[] => Array.isArray(v) ? v.map(record) : []
const string = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null
const integer = (v: unknown, minimum = 0): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN
  return Number.isSafeInteger(n) && n >= minimum ? n : null
}

export function validOracleDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v
}
export function classifyStayState(raw: unknown): StayState {
  const key = string(raw)?.toLowerCase().replace(/[\s_-]/g, '')
  switch (key) {
    case 'reserved': case 'reservation': case 'duein': case 'confirmed': return 'reserved'
    case 'inhouse': case 'arrived': case 'registeredandinhouse': case 'checkedin': case 'dueout': return 'in_house'
    case 'checkedout': case 'departed': return 'checked_out'
    case 'cancelled': case 'canceled': case 'cancellation': return 'cancelled'
    case 'noshow': return 'no_show'
    case 'waitlist': case 'waitlisted': return 'waitlist'
    default: return 'unknown'
  }
}
export function classifyOracleStatus(raw: string | null | undefined): 'checked_in' | 'cancelled' | 'other' {
  const state = classifyStayState(raw)
  return state === 'in_house' ? 'checked_in' : state === 'cancelled' || state === 'no_show' ? 'cancelled' : 'other'
}
function primaryContact(profile: Record<string, unknown>, container: string, list: string, value: string, key: string): string | null {
  const entries = array(record(profile[container])[list]).map(e => record(e[value]))
  const first = entries.find(e => e.primaryInd === true) ?? entries[0]
  return string(first?.[key])
}
function normalize(raw: unknown): OracleBooking {
  const r = record(raw)
  const ids = array(r.reservationIdList)
  const oracleReservationId = string(ids.find(id => id.type === 'Reservation')?.id)
  if (!oracleReservationId) throw new OracleParseError('Missing reservation identifier')
  const room = record(r.roomStay)
  const arrivalDate = room.arrivalDate
  const departureDate = room.departureDate
  if (!validOracleDate(arrivalDate) || !validOracleDate(departureDate) || departureDate <= arrivalDate) throw new OracleParseError('Invalid reservation dates')
  const guests = array(r.reservationGuests)
  const guest = guests.find(g => g.primary === true) ?? guests[0]
  const profile = record(record(guest?.profileInfo).profile)
  const names = array(record(profile.customer).personName)
  const person = names.find(n => n.nameType === 'Primary') ?? names[0] ?? record(r.reservationGuest)
  const listGuest = record(r.reservationGuest)
  const rates = array(room.roomRates)
  const quantities = rates.map(rate => integer(rate.numberOfUnits, 1))
  const rateQuantity = quantities.length > 0 && quantities.every(q => q !== null && q === quantities[0]) ? quantities[0] : null
  const currentRoom = record(room.currentRoomInfo)
  const shared = array(r.sharedGuests)
  const primaryShareType = room.primaryShareType
  // Shares without a primary flag cannot be counted safely; retain them for staff review.
  const inventoryDisposition = primaryShareType === 'NonPrimary' ? 'secondary_share' : primaryShareType === 'Primary' || shared.length === 0 ? 'count' : 'unresolved'
  const sharedIds = shared.map(s => string(record(s.reservationId).id)).filter((id): id is string => !!id)
  const counts = record(room.guestCounts)
  const firstRate = rates[0] ?? {}
  const isPseudoRoom = room.pseudoRoom === true || rates.some(rate => rate.pseudoRoom === true)
  const reservationStatus = string(r.reservationStatus) ?? string(r.computedReservationStatus)
  return {
    oracleReservationId,
    confirmationNumber: string(ids.find(id => id.type === 'Confirmation')?.id),
    guestName: [string(person.givenName), string(person.surname)].filter(Boolean).join(' ') || string(person.fullName),
    guestEmail: primaryContact(profile, 'emails', 'emailInfo', 'email', 'emailAddress') ?? string(listGuest.email),
    guestPhone: primaryContact(profile, 'telephones', 'telephoneInfo', 'telephone', 'phoneNumber') ?? string(listGuest.phoneNumber),
    arrivalDate, departureDate,
    roomType: string(room.roomType) ?? string(currentRoom.roomType) ?? string(firstRate.roomType),
    roomNumber: string(room.roomId) ?? string(currentRoom.roomId),
    roomQuantity: integer(room.numberOfRooms, 1) ?? rateQuantity,
    adultCount: integer(room.adultCount) ?? integer(counts.adults),
    childCount: integer(room.childCount) ?? integer(counts.children),
    reservationStatus, stayState: classifyStayState(reservationStatus),
    channelCode: string(r.bookingChannelCode) ?? string(room.bookingChannelCode) ?? string(room.bookingMedium),
    sourceCode: string(room.sourceCode) ?? string(room.sourceOfBusiness) ?? string(firstRate.sourceCode),
    marketCode: string(room.marketCode) ?? string(firstRate.marketCode),
    isRoomReservation: !isPseudoRoom, isPseudoRoom,
    inventoryGroupId: sharedIds.length ? [oracleReservationId, ...sharedIds].sort()[0] : null,
    inventoryDisposition,
  }
}
export function parseReservationPage(raw: unknown): OraclePage {
  const envelope = record(record(raw).reservations)
  let rows = envelope.reservationInfo
  if (rows === undefined && integer(envelope.totalResults) === 0 && envelope.hasMore !== true) rows = []
  if (!Array.isArray(rows)) throw new OracleParseError('Unexpected reservation list envelope')
  if (envelope.hasMore !== undefined && typeof envelope.hasMore !== 'boolean') throw new OracleParseError('Unexpected pagination')
  const offset = integer(envelope.offset) ?? 0
  const totalResults = integer(envelope.totalResults)
  return { bookings: rows.map(normalize), offset, hasMore: envelope.hasMore === true, totalResults }
}
export function parseReservationDetail(raw: unknown): OracleBooking {
  const rows = record(record(raw).reservations).reservation
  if (!Array.isArray(rows) || rows.length !== 1) throw new OracleParseError('Unexpected reservation detail envelope')
  return normalize(rows[0])
}
// Compatibility adapters for the pre-existing import path.
export const normalizeArrival = normalize
export const normalizeReservation = (raw: unknown): OracleBooking => {
  const root = record(raw)
  return root.reservations ? parseReservationDetail(raw) : normalize(root.reservation ?? raw)
}
