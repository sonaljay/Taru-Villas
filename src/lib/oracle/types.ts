// src/lib/oracle/types.ts
// Normalized shapes the rest of the app consumes — insulated from raw OPERA JSON.

export type OhipResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }

export interface NormalizedArrival {
  oracleReservationId: string
  confirmationNumber: string | null
  guestName: string | null
  guestEmail: string | null
  arrivalDate: string | null // YYYY-MM-DD
  departureDate: string | null // YYYY-MM-DD
  roomType: string | null
}

export interface NormalizedReservation extends NormalizedArrival {
  reservationStatus: string | null // raw OPERA status, e.g. "InHouse"
  roomNumber: string | null
}

export type StayState = 'reserved' | 'in_house' | 'checked_out' | 'cancelled' | 'no_show' | 'waitlist' | 'unknown'
export interface OracleBooking extends NormalizedReservation {
  arrivalDate: string
  departureDate: string
  guestPhone: string | null
  roomQuantity: number | null
  adultCount: number | null
  childCount: number | null
  stayState: StayState
  channelCode: string | null
  sourceCode: string | null
  marketCode: string | null
  isRoomReservation: boolean
  isPseudoRoom: boolean
  inventoryGroupId: string | null
  inventoryDisposition: 'count' | 'secondary_share' | 'unresolved'
}
export interface OraclePage {
  bookings: OracleBooking[]
  offset: number
  hasMore: boolean
  totalResults: number | null
}
