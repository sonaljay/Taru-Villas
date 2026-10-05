// Server-only: Node crypto and database credentials must never enter a client import.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto'
import { getProfile } from '@/lib/auth/guards'
import { requireLoPropertyAccess } from '@/lib/oracle/access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { findAccessById, findGuestAccess, withGuestBookingLock, type BookingSource, type AccessRow } from './store'
import { GuestInputError, type GuestScope } from './types'
function linkKey() {
  const value = process.env.GUEST_PORTAL_LINK_KEY ?? ''
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32 || key.toString('base64') !== value) throw new GuestInputError('Guest links are not configured', 503)
  return key
}
export function encryptGuestSecret(value: string, context: string): string {
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', linkKey(), iv)
  cipher.setAAD(Buffer.from(context)); const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url')
}
export function decryptGuestSecret(value: string, context: string): string {
  const bytes = Buffer.from(value, 'base64url'); if (bytes.length < 29) throw new GuestInputError('Guest link unavailable', 404)
  const cipher = createDecipheriv('aes-256-gcm', linkKey(), bytes.subarray(0, 12)); cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(bytes.subarray(12, 28))
  try { return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8') } catch { throw new GuestInputError('Guest link unavailable', 404) }
}
export function guestTokenHash(token: string): string { return createHash('sha256').update(token).digest('hex') }
export function departureExpiry(date: string): Date {
  if (!validOracleDate(date)) throw new GuestInputError('Booking unavailable', 404)
  return new Date(`${date}T23:59:59.999+05:30`)
}
export function guestPortalOrigin(): string {
  try {
    const url = new URL(process.env.GUEST_PORTAL_ORIGIN ?? '')
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:' && process.env.NODE_ENV !== 'production'))) throw Error()
    return url.origin
  } catch { throw new GuestInputError('Guest links are not configured', 503) }
}
function unavailable(): never { throw new GuestInputError('Guest link unavailable', 404) }
export function scopeFromSource(access: AccessRow, source: BookingSource, now = new Date()): GuestScope {
  if (access.revokedAt || access.orgId !== source.orgId || access.propertyId !== source.propertyId || access.guestProfileId !== source.id || access.expiresAt <= now || !source.propertyActive || source.oracleHotelId !== 'LO' || source.oracleEnvironment !== 'production' || !source.lastSyncedRunId || source.syncComplete === false || !['reserved', 'in_house'].includes(source.stayState) || !validOracleDate(source.arrivalDate) || !validOracleDate(source.departureDate) || source.departureDate! <= source.arrivalDate! || departureExpiry(source.departureDate!) <= now || source.isPseudoRoom || source.isRoomReservation === false) unavailable()
  return { accessId: access.id, guestProfileId: source.id, orgId: source.orgId, propertyId: source.propertyId, version: access.version, stayState: source.stayState, arrivalDate: source.arrivalDate!, departureDate: source.departureDate!, expiresAt: new Date(Math.min(access.expiresAt.getTime(), departureExpiry(source.departureDate!).getTime())).toISOString(), fresh: !!source.lastPulledAt && now.getTime() - source.lastPulledAt.getTime() <= 86_400_000 }
}
export async function withStaffGuestBooking<T>(id: string, fn: Parameters<typeof withGuestBookingLock<T>>[2]) {
  const profile = await getProfile(); if (!profile) throw new GuestInputError('Unauthorized', 401)
  return withGuestBookingLock(profile.orgId, id, async (source, writer, tx) => {
    const access = await requireLoPropertyAccess(source.propertyId)
    if (access.orgId !== source.orgId) unavailable()
    return fn(source, writer, tx)
  })
}
export async function issueGuestLink(guestProfileId: string): Promise<{ url: string; version: number; expiresAt: string }> {
  linkKey(); const origin = guestPortalOrigin()
  return withStaffGuestBooking(guestProfileId, async (source, writer) => {
    let row = await writer.active()
    if (!row) {
      const actor = await getProfile(); const token = randomBytes(32).toString('base64url'); const id = randomUUID(); const version = (await writer.latestVersion?.() ?? 0) + 1
      // Validate before any persistence. Shared helpers also serve automatic issuance.
      const value = { id, orgId: source.orgId, propertyId: source.propertyId, guestProfileId: source.id, tokenHash: guestTokenHash(token), encryptedToken: encryptGuestSecret(token, `${id}:${version}`), version, expiresAt: departureExpiry(source.departureDate!), revokedAt: null, issuedBy: actor!.id }
      scopeFromSource(value as AccessRow, source); row = await writer.insert(value)
    }
    const scope = scopeFromSource(row, source)
    return { url: `${origin}/stay/${decryptGuestSecret(row.encryptedToken, `${row.id}:${row.version}`)}`, version: row.version, expiresAt: scope.expiresAt }
  })
}
export async function revokeGuestLink(guestProfileId: string): Promise<void> { await withStaffGuestBooking(guestProfileId, async (_source, writer) => writer.revoke()) }
export async function resolveGuestScope(token: string): Promise<GuestScope> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) unavailable()
  const row = await findGuestAccess(guestTokenHash(token)); if (!row) unavailable()
  return scopeFromSource(row.access, row.source)
}
export async function recoverGuestLink(accessId: string): Promise<string> {
  const row = await findAccessById(accessId); if (!row) unavailable()
  scopeFromSource(row.access, row.source)
  return `${guestPortalOrigin()}/stay/${decryptGuestSecret(row.access.encryptedToken, `${row.access.id}:${row.access.version}`)}`
}
export async function withGuestAction<T>(scope: GuestScope, fn: (source: BookingSource, tx: import('./store').GuestTransaction) => Promise<T>): Promise<T> {
  return withGuestBookingLock(scope.orgId, scope.guestProfileId, async (source, writer, tx) => {
    const row = await writer.active(); if (!row || row.id !== scope.accessId || row.version !== scope.version) unavailable()
    const current = scopeFromSource(row, source)
    if (!current.fresh) throw new GuestInputError('Your stay is being refreshed. Please try again shortly.', 409)
    return fn(source, tx)
  })
}
