// Server-only durable guest mail. Never invoked by a page render.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestEmailDeliveries, guestEmailSettings, guestProfiles, properties } from '@/lib/db/schema'
import { requireLoPropertyAccess } from '@/lib/oracle/access'
import { validOracleDate } from '@/lib/oracle/reservations'
import { decryptGuestSecret, departureExpiry, encryptGuestSecret, guestPortalOrigin, guestTokenHash, scopeFromSource } from './access'
import { withGuestBookingLock, type BookingSource } from './store'
import { renderGuestEmail, sendGuestEmail, validGuestEmail, guestMailEnabled, type GuestEmailMessage } from './email'
import { GuestInputError } from './types'
export { guestMailEnabled } from './email'
function configured() {
  guestPortalOrigin()
  if (!process.env.RESEND_API_KEY?.trim() || !process.env.GUEST_EMAIL_FROM?.trim() || /[\r\n]/.test((process.env.RESEND_API_KEY ?? '') + (process.env.GUEST_EMAIL_FROM ?? ''))) throw new GuestInputError('Guest email sender is not configured', 503)
}
function localDate(now: Date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Colombo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now) }
export function guestEmailDueDate(arrivalDate: string) {
  if (!validOracleDate(arrivalDate)) throw new GuestInputError('Invalid arrival date', 400)
  return new Date(Date.parse(`${arrivalDate}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10)
}
function dueAt(arrival: string) { return new Date(`${guestEmailDueDate(arrival)}T00:00:00+05:30`) }
type EligibilitySource = Pick<BookingSource, 'oracleEnvironment' | 'oracleHotelId' | 'propertyActive' | 'syncComplete' | 'lastPulledAt' | 'stayState' | 'arrivalDate' | 'departureDate' | 'guestEmail' | 'isPseudoRoom' | 'isRoomReservation' | 'firstImportedAt'>
export function emailEligibility(source: EligibilitySource, now: Date, enabledAt: Date | null): string | null {
  if (!source.propertyActive || source.oracleHotelId !== 'LO' || source.oracleEnvironment !== 'production' || !source.syncComplete || source.isPseudoRoom || source.isRoomReservation === false || source.stayState !== 'reserved') return 'Booking is not eligible'
  if (!source.lastPulledAt || now.getTime() - source.lastPulledAt.getTime() > 86400000) return 'Booking refresh required'
  if (!validOracleDate(source.arrivalDate) || !validOracleDate(source.departureDate) || source.departureDate! <= source.arrivalDate! || source.arrivalDate! < localDate(now)) return 'Arrival has passed or dates are invalid'
  if (!validGuestEmail(source.guestEmail)) return 'Primary email is missing or invalid'
  if (enabledAt && source.firstImportedAt < enabledAt) return 'Imported before activation'
  return null
}
export function retryRequiresReconciliation(startedAt: Date | null, now: Date) { return !!startedAt && now.getTime() - startedAt.getTime() >= 23 * 3600000 }
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type Delivery = typeof guestEmailDeliveries.$inferSelect
type Frozen = { message: GuestEmailMessage; from: string; configHash: string; sourceHash: string }
function configHash() { return hash(`${process.env.RESEND_API_KEY?.trim()}\n${process.env.GUEST_EMAIL_FROM?.trim()}\n${guestPortalOrigin()}`) }
function sourceHash(source: BookingSource, accessId: string, version: number) { return hash(JSON.stringify([source.guestEmail?.trim(), source.arrivalDate, source.departureDate, accessId, version])) }
async function candidates(propertyId?: string) {
  return db.select({ id: guestProfiles.id, orgId: guestProfiles.orgId, propertyId: guestProfiles.propertyId }).from(guestProfiles)
    .innerJoin(properties, and(eq(properties.id, guestProfiles.propertyId), eq(properties.orgId, guestProfiles.orgId)))
    .where(and(eq(properties.oracleHotelId, 'LO'), eq(properties.isActive, true), eq(guestProfiles.oracleEnvironment, 'production'), ...(propertyId ? [eq(guestProfiles.propertyId, propertyId)] : [])))
}
async function queueBooking(candidate: { id: string; orgId: string }, kind: 'welcome' | 'catch_up' | 'resend', now: Date, enabledAt: Date | null, actor: string | null) {
  return withGuestBookingLock(candidate.orgId, candidate.id, async (source, writer, tx) => {
    const reason = emailEligibility(source, now, kind === 'welcome' ? enabledAt : null)
    if (reason) return { queued: 0, held: reason === 'Primary email is missing or invalid' ? 1 : 0 }
    if (kind === 'welcome' && dueAt(source.arrivalDate!) > now) return { queued: 0, held: 0 }
    const previous = await tx.select().from(guestEmailDeliveries).where(and(eq(guestEmailDeliveries.guestProfileId, source.id), eq(guestEmailDeliveries.orgId, source.orgId))).limit(1)
    // Regenerating a portal link must not automatically send another welcome.
    if (kind !== 'resend' && previous.length) return { queued: 0, held: 0 }
    let access = await writer.active()
    if (!access) {
      if (await writer.latestVersion()) return { queued: 0, held: 1 } // Deliberate revocation requires staff reissue.
      const token = randomBytes(32).toString('base64url'), id = randomUUID(), version = 1
      access = await writer.insert({ id, orgId: source.orgId, propertyId: source.propertyId, guestProfileId: source.id, tokenHash: guestTokenHash(token), encryptedToken: encryptGuestSecret(token, `${id}:${version}`), version, expiresAt: departureExpiry(source.departureDate!), issuedBy: actor })
    }
    try { scopeFromSource(access, source, now) } catch { return { queued: 0, held: 1 } }
    const eventKey = kind === 'resend' ? `guest:${source.id}:${access.version}:resend:${randomUUID()}` : `guest:${source.id}:${access.version}:${kind}`
    const inserted = await tx.insert(guestEmailDeliveries).values({ orgId: source.orgId, propertyId: source.propertyId, guestProfileId: source.id, accessId: access.id, accessVersion: access.version, eventKey, kind, dueAt: kind === 'resend' ? now : dueAt(source.arrivalDate!), requestedBy: actor }).onConflictDoNothing().returning()
    return { queued: inserted.length, held: 0 }
  })
}
export async function enqueueGuestEmails(now: Date): Promise<{ queued: number; held: number }> {
  const result = { queued: 0, held: 0 }; if (!guestMailEnabled()) return result
  configured()
  for (const setting of await db.select().from(guestEmailSettings)) {
    if (!setting.enabledAt) continue
    for (const candidate of await candidates(setting.propertyId)) {
      const counts = await queueBooking(candidate, 'welcome', now, setting.enabledAt, null)
      result.queued += counts.queued; result.held += counts.held
    }
  }
  return result
}
async function previewRows(propertyId: string, now: Date) {
  const counts = { eligible: 0, missingEmail: 0, excluded: 0 }, ids: string[] = []
  for (const candidate of await candidates(propertyId)) {
    await withGuestBookingLock(candidate.orgId, candidate.id, async (source, writer, tx) => {
      const reason = emailEligibility(source, now, null)
      const prior = await tx.select({ id: guestEmailDeliveries.id }).from(guestEmailDeliveries).where(eq(guestEmailDeliveries.guestProfileId, source.id)).limit(1)
      const active = await writer.active(), revoked = !active && await writer.latestVersion() > 0
      let linkInvalid = revoked
      if (active) { try { scopeFromSource(active, source, now) } catch { linkInvalid = true } }
      if (reason === 'Primary email is missing or invalid') counts.missingEmail++
      else if (reason || linkInvalid || prior.length) counts.excluded++
      else { counts.eligible++; ids.push(`${source.id}:${sourceHash(source, active?.id ?? '', active?.version ?? 0)}`) }
    })
  }
  return { counts, digest: hash(ids.sort().join('\n')) }
}
export async function previewGuestEmailActivation(propertyId: string): Promise<{ eligible: number; missingEmail: number; excluded: number }> {
  const actor = await requireLoPropertyAccess(propertyId), now = new Date(), preview = await previewRows(propertyId, now)
  await db.insert(guestEmailSettings).values({ orgId: actor.orgId, propertyId, previewVersion: randomUUID(), previewCount: preview.counts.eligible, previewHash: preview.digest, previewAt: now, previewKind: 'activation' }).onConflictDoUpdate({ target: guestEmailSettings.propertyId, set: { previewVersion: randomUUID(), previewCount: preview.counts.eligible, previewHash: preview.digest, previewAt: now, previewKind: 'activation', updatedAt: now } }).returning()
  return preview.counts
}
async function reviewedSetting(propertyId: string, reviewedCount: number) {
  const actor = await requireLoPropertyAccess(propertyId), now = new Date(), preview = await previewRows(propertyId, now)
  const [setting] = await db.select().from(guestEmailSettings).where(and(eq(guestEmailSettings.orgId, actor.orgId), eq(guestEmailSettings.propertyId, propertyId)))
  if (!Number.isInteger(reviewedCount) || !setting?.previewAt || now.getTime() - setting.previewAt.getTime() > 15 * 60000 || setting.previewCount !== reviewedCount || preview.counts.eligible !== reviewedCount || setting.previewHash !== preview.digest) throw new GuestInputError('Booking list changed. Preview it again before confirming.', 409)
  return { actor, now, setting }
}
export async function activateGuestEmails(propertyId: string, reviewedCount: number): Promise<void> {
  if (!guestMailEnabled()) throw new GuestInputError('Production guest email sending is disabled', 503)
  configured(); const { actor, now, setting } = await reviewedSetting(propertyId, reviewedCount)
  // Preserve the original boundary if staff review activation again.
  await db.update(guestEmailSettings).set({ enabledAt: setting.enabledAt ?? now, enabledBy: setting.enabledBy ?? actor.actorId, previewAt: null, updatedAt: now }).where(and(eq(guestEmailSettings.id, setting.id), eq(guestEmailSettings.previewVersion, setting.previewVersion!))).returning()
}
export async function catchUpGuestEmails(propertyId: string, reviewedCount: number) {
  if (!guestMailEnabled()) throw new GuestInputError('Production guest email sending is disabled', 503)
  configured(); const { actor, now, setting } = await reviewedSetting(propertyId, reviewedCount)
  if (!setting.enabledAt) throw new GuestInputError('Activate prospective emails first', 409)
  const result = { queued: 0, held: 0 }
  for (const candidate of await candidates(propertyId)) { const count = await queueBooking(candidate, 'catch_up', now, null, actor.actorId); result.queued += count.queued; result.held += count.held }
  await db.update(guestEmailSettings).set({ previewAt: null, previewKind: 'catch_up', updatedAt: now }).where(eq(guestEmailSettings.id, setting.id)).returning()
  return result
}
export async function resendGuestEmail(guestProfileId: string, reviewedCount: number) {
  if (reviewedCount !== 1) throw new GuestInputError('Confirm one guest email', 400)
  const { withStaffGuestBooking } = await import('./access')
  const candidate = await withStaffGuestBooking(guestProfileId, async source => ({ id: source.id, orgId: source.orgId, propertyId: source.propertyId }))
  const actor = await requireLoPropertyAccess(candidate.propertyId)
  if (!guestMailEnabled()) throw new GuestInputError('Production guest email sending is disabled', 503)
  configured()
  const [setting] = await db.select().from(guestEmailSettings).where(and(eq(guestEmailSettings.orgId, candidate.orgId), eq(guestEmailSettings.propertyId, candidate.propertyId)))
  if (!setting?.enabledAt) throw new GuestInputError('Activate prospective emails first', 409)
  const pending = await db.select({ id: guestEmailDeliveries.id }).from(guestEmailDeliveries).where(and(eq(guestEmailDeliveries.guestProfileId, candidate.id), sql`${guestEmailDeliveries.state} in ('queued','sending','held','failed')`)).limit(1)
  if (pending.length) throw new GuestInputError('Reconcile the existing delivery before requesting another email', 409)
  const result = await queueBooking(candidate, 'resend', new Date(), null, actor.actorId)
  if (!result.queued) throw new GuestInputError('Booking, address or private link requires review', 409)
  return result
}
export async function getGuestEmailSettings(propertyId: string) {
  const scope = await requireLoPropertyAccess(propertyId)
  const [setting] = await db.select().from(guestEmailSettings).where(and(eq(guestEmailSettings.orgId, scope.orgId), eq(guestEmailSettings.propertyId, propertyId)))
  const deliveries = await db.select({ id: guestEmailDeliveries.id, guestProfileId: guestEmailDeliveries.guestProfileId, kind: guestEmailDeliveries.kind, state: guestEmailDeliveries.state, dueAt: guestEmailDeliveries.dueAt, attempts: guestEmailDeliveries.attempts, acceptedAt: guestEmailDeliveries.acceptedAt, lastError: guestEmailDeliveries.lastError }).from(guestEmailDeliveries).where(and(eq(guestEmailDeliveries.orgId, scope.orgId), eq(guestEmailDeliveries.propertyId, propertyId))).orderBy(desc(guestEmailDeliveries.createdAt)).limit(100)
  return { enabledAt: setting?.enabledAt ?? null, configured: guestMailEnabled() && !!process.env.RESEND_API_KEY && !!process.env.GUEST_EMAIL_FROM && !!process.env.GUEST_PORTAL_LINK_KEY && !!process.env.GUEST_PORTAL_ORIGIN, deliveries }
}
// Helpers are closed over a claimed lease; never callable by guest routes.
function deliveryHelpers(job: Delivery, owner: string) {
  const where = and(eq(guestEmailDeliveries.id, job.id), eq(guestEmailDeliveries.leaseOwner, owner), eq(guestEmailDeliveries.state, 'sending'))
  return {
    holdDelivery: async (_id: string, category: string) => { await db.update(guestEmailDeliveries).set({ state: 'held', lastError: category, leaseOwner: null, leaseUntil: null, updatedAt: new Date() }).where(where).returning() },
    recoverImmutableEmail: async (_id: string): Promise<GuestEmailMessage> => {
      if (_id !== job.id) throw new GuestInputError('Email lease unavailable', 409)
      const [current] = await db.select().from(guestEmailDeliveries).where(where)
      if (!current?.encryptedPayload) throw new GuestInputError('Email lease unavailable', 409)
      return (JSON.parse(decryptGuestSecret(current.encryptedPayload, `email:${current.id}`)) as Frozen).message
    },
    markDeliveryAccepted: async (_id: string, providerId: string) => { const rows = await db.update(guestEmailDeliveries).set({ state: 'accepted', providerId, acceptedAt: new Date(), lastError: null, leaseOwner: null, leaseUntil: null, updatedAt: new Date() }).where(where).returning(); if (!rows.length) throw new GuestInputError('Email lease unavailable', 409) },
    where,
  }
}
export async function deliverGuestEmails(options: { now: Date; limit: number; budgetMs: number }): Promise<{ accepted: number; held: number; failed: number }> {
  const now = options.now, result = { accepted: 0, held: 0, failed: 0 }, deadline = Date.now() + Math.min(options.budgetMs, 45000)
  if (!guestMailEnabled()) return result
  configured()
  for (let i = 0; i < Math.min(options.limit, 50) && Date.now() + 16000 < deadline; i++) {
    const owner = randomUUID()
    const rows = await db.execute(sql`with pick as (select id from guest_email_deliveries where (state='queued' and due_at<=${now.toISOString()}::timestamptz and (next_attempt_at is null or next_attempt_at<=${now.toISOString()}::timestamptz)) or (state='sending' and lease_until<=${now.toISOString()}::timestamptz) order by due_at,id for update skip locked limit 1) update guest_email_deliveries d set state='sending',lease_owner=${owner}::uuid,lease_until=${new Date(now.getTime()+120000).toISOString()}::timestamptz,updated_at=${now.toISOString()}::timestamptz from pick where d.id=pick.id returning d.id`)
    if (!rows.length) break
    const [job] = await db.select().from(guestEmailDeliveries).where(and(eq(guestEmailDeliveries.id, String(rows[0].id)), eq(guestEmailDeliveries.leaseOwner, owner)))
    if (!job) continue
    const { holdDelivery, recoverImmutableEmail, markDeliveryAccepted, where } = deliveryHelpers(job, owner)
    try {
      const ready = await withGuestBookingLock(job.orgId, job.guestProfileId, async (source, writer, tx) => {
        const [setting] = await tx.select().from(guestEmailSettings).where(and(eq(guestEmailSettings.orgId, job.orgId), eq(guestEmailSettings.propertyId, job.propertyId)))
        const active = await writer.active()
        const reason = !setting?.enabledAt ? 'Guest emails are not activated' : emailEligibility(source, now, job.kind === 'welcome' ? setting.enabledAt : null)
        if (reason || !active || active.id !== job.accessId || active.version !== job.accessVersion) return { hold: reason ?? 'Private link changed or was revoked' }
        try { scopeFromSource(active, source, now) } catch { return { hold: 'Private link expired or booking changed' } }
        if (retryRequiresReconciliation(job.startedAt, now)) return { hold: 'Provider outcome requires reconciliation' }
        const currentHash = sourceHash(source, active.id, active.version)
        if (job.encryptedPayload) {
          const frozen = JSON.parse(decryptGuestSecret(job.encryptedPayload, `email:${job.id}`)) as Frozen
          if (frozen.sourceHash !== currentHash || frozen.configHash !== configHash() || frozen.from !== process.env.GUEST_EMAIL_FROM?.trim()) return { hold: 'Email details changed after an uncertain attempt' }
        } else {
          if (job.kind !== 'resend' && dueAt(source.arrivalDate!) > now) {
            await tx.update(guestEmailDeliveries).set({ state: 'queued', dueAt: dueAt(source.arrivalDate!), leaseOwner: null, leaseUntil: null, updatedAt: now }).where(where).returning()
            return { deferred: true }
          }
          const [property] = await tx.select({ name: properties.name }).from(properties).where(and(eq(properties.id, source.propertyId), eq(properties.orgId, source.orgId)))
          const portalUrl = `${guestPortalOrigin()}/stay/${decryptGuestSecret(active.encryptedToken, `${active.id}:${active.version}`)}`
          const message = { to: validGuestEmail(source.guestEmail)!, ...renderGuestEmail({ propertyName: property.name, arrivalDate: source.arrivalDate!, departureDate: source.departureDate!, portalUrl }), idempotencyKey: job.eventKey }
          const frozen: Frozen = { message, from: process.env.GUEST_EMAIL_FROM!.trim(), configHash: configHash(), sourceHash: currentHash }
          await tx.update(guestEmailDeliveries).set({ encryptedPayload: encryptGuestSecret(JSON.stringify(frozen), `email:${job.id}`), recipientHash: hash(message.to), startedAt: now, updatedAt: now }).where(where).returning()
        }
        const updated = await tx.update(guestEmailDeliveries).set({ attempts: job.attempts + 1, updatedAt: now }).where(where).returning()
        return { ready: !!updated.length }
      })
      if ('hold' in ready && ready.hold) { await holdDelivery(job.id, ready.hold); result.held++; continue }
      if (!('ready' in ready) || !ready.ready) continue
      if (!guestMailEnabled()) { await holdDelivery(job.id, 'Production guest email sending is disabled'); result.held++; continue }
      const sent = await sendGuestEmail(await recoverImmutableEmail(job.id))
      await markDeliveryAccepted(job.id, sent.providerId); result.accepted++
    } catch {
      await db.update(guestEmailDeliveries).set({ state: job.attempts + 1 >= 5 ? 'failed' : 'queued', lastError: 'Provider outcome not confirmed; safe retry pending', nextAttemptAt: new Date(now.getTime() + Math.min(3600000, 60000 * 2 ** job.attempts)), leaseOwner: null, leaseUntil: null, updatedAt: now }).where(where).returning()
      result.failed++
    }
  }
  return result
}
