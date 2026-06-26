import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestProfiles } from '@/lib/db/schema'
import { listArrivals, getReservation } from './client'
import {
  upsertGuestProfileFromArrival,
  applyReservationStatus,
} from '@/lib/db/queries/guest-profiles'

/** Pull arrivals in [fromDate,toDate] for a property and upsert guest profiles. */
export async function syncPropertyArrivals(
  orgId: string,
  propertyId: string,
  hotelId: string,
  fromDate: string,
  toDate: string
): Promise<{ pulled: number; error?: string }> {
  const res = await listArrivals(hotelId, fromDate, toDate)
  if (!res.ok) return { pulled: 0, error: res.error }
  let pulled = 0
  for (const arrival of res.data) {
    await upsertGuestProfileFromArrival(orgId, propertyId, arrival)
    pulled++
  }
  return { pulled }
}

/** Refresh Oracle status for profiles still awaiting check-in. */
export async function refreshPropertyStatuses(
  propertyId: string,
  hotelId: string
): Promise<{ refreshed: number; checkedIn: number }> {
  const pending = await db
    .select()
    .from(guestProfiles)
    .where(
      and(
        eq(guestProfiles.propertyId, propertyId),
        eq(guestProfiles.status, 'pending_checkin')
      )
    )
  let refreshed = 0
  let checkedIn = 0
  for (const p of pending) {
    const res = await getReservation(hotelId, p.oracleReservationId)
    if (!res.ok) continue
    const updated = await applyReservationStatus(p.id, res.data)
    refreshed++
    if (updated.status === 'checked_in') checkedIn++
  }
  return { refreshed, checkedIn }
}
