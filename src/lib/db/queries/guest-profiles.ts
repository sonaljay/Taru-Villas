import { randomBytes } from 'crypto'
import { eq, desc } from 'drizzle-orm'
import { db } from '..'
import { guestProfiles } from '../schema'
import type { GuestProfile } from '../schema'
import { classifyOracleStatus } from '@/lib/oracle/reservations'
import type { NormalizedArrival, NormalizedReservation } from '@/lib/oracle/types'

function generateToken(): string {
  return randomBytes(16).toString('base64url')
}

/** All guest profiles for a property, newest arrival first. */
export async function getGuestProfilesForProperty(propertyId: string): Promise<GuestProfile[]> {
  return db
    .select()
    .from(guestProfiles)
    .where(eq(guestProfiles.propertyId, propertyId))
    .orderBy(desc(guestProfiles.arrivalDate), desc(guestProfiles.createdAt))
}

export async function getGuestProfileById(id: string): Promise<GuestProfile | undefined> {
  const rows = await db.select().from(guestProfiles).where(eq(guestProfiles.id, id)).limit(1)
  return rows[0]
}

export async function getGuestProfileByToken(token: string): Promise<GuestProfile | undefined> {
  const rows = await db.select().from(guestProfiles).where(eq(guestProfiles.token, token)).limit(1)
  return rows[0]
}

/**
 * Upsert a profile from a pulled arrival. New rows start pending_questionnaire
 * with a minted token; existing rows refresh snapshot fields only (status never
 * regresses — onConflict updates the descriptive fields, not status/token).
 */
export async function upsertGuestProfileFromArrival(
  orgId: string,
  propertyId: string,
  arrival: NormalizedArrival
): Promise<GuestProfile> {
  const [row] = await db
    .insert(guestProfiles)
    .values({
      orgId,
      propertyId,
      oracleReservationId: arrival.oracleReservationId,
      confirmationNumber: arrival.confirmationNumber,
      guestName: arrival.guestName,
      guestEmail: arrival.guestEmail,
      arrivalDate: arrival.arrivalDate,
      departureDate: arrival.departureDate,
      roomType: arrival.roomType,
      token: generateToken(),
      lastPulledAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [guestProfiles.propertyId, guestProfiles.oracleReservationId],
      set: {
        confirmationNumber: arrival.confirmationNumber,
        guestName: arrival.guestName,
        guestEmail: arrival.guestEmail,
        arrivalDate: arrival.arrivalDate,
        departureDate: arrival.departureDate,
        roomType: arrival.roomType,
        lastPulledAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning()
  return row
}

/**
 * Apply a freshly-fetched reservation status to a profile in pending_checkin:
 * checked_in → set status + room; cancelled → set status; otherwise just stamp.
 */
export async function applyReservationStatus(
  id: string,
  normalized: NormalizedReservation
): Promise<GuestProfile> {
  const cls = classifyOracleStatus(normalized.reservationStatus)
  const set: Record<string, unknown> = {
    oracleReservationStatus: normalized.reservationStatus,
    lastPulledAt: new Date(),
    updatedAt: new Date(),
  }
  if (cls === 'checked_in') {
    set.status = 'checked_in'
    if (normalized.roomNumber) set.roomNumber = normalized.roomNumber
  } else if (cls === 'cancelled') {
    set.status = 'cancelled'
  }
  const [row] = await db
    .update(guestProfiles)
    .set(set)
    .where(eq(guestProfiles.id, id))
    .returning()
  return row
}
