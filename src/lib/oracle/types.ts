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
