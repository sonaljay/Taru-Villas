import { and, desc, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestPortalAccess, guestProfiles, properties, oracleSyncRuns } from '@/lib/db/schema'
import { GuestInputError } from './types'
export type BookingSource = typeof guestProfiles.$inferSelect & { propertyActive: boolean; oracleHotelId: string | null; syncComplete: boolean }
export type AccessRow = typeof guestPortalAccess.$inferSelect
export type AccessWriter = { active(): Promise<AccessRow | undefined>; latestVersion(): Promise<number>; insert(value: typeof guestPortalAccess.$inferInsert): Promise<AccessRow>; revoke(): Promise<void> }
export type GuestTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]
async function sourceById(tx: GuestTransaction | typeof db, orgId: string, id: string, lock = false): Promise<BookingSource | undefined> {
  const query = tx.select({ profile: guestProfiles, propertyActive: properties.isActive, oracleHotelId: properties.oracleHotelId, syncState: oracleSyncRuns.state }).from(guestProfiles)
    .innerJoin(properties, and(eq(properties.id, guestProfiles.propertyId), eq(properties.orgId, guestProfiles.orgId)))
    .leftJoin(oracleSyncRuns, eq(oracleSyncRuns.id, guestProfiles.lastSyncedRunId))
    .where(and(eq(guestProfiles.id, id), eq(guestProfiles.orgId, orgId)))
  const [row] = lock ? await query.for('update', { of: guestProfiles }) : await query.limit(1)
  return row ? { ...row.profile, propertyActive: row.propertyActive, oracleHotelId: row.oracleHotelId, syncComplete: row.syncState === 'complete' } : undefined
}
export async function withGuestBookingLock<T>(orgId: string, id: string, fn: (source: BookingSource, writer: AccessWriter, tx: GuestTransaction) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    const source = await sourceById(tx, orgId, id, true)
    if (!source) throw new GuestInputError('Booking unavailable', 404)
    const where = and(eq(guestPortalAccess.guestProfileId, id), eq(guestPortalAccess.orgId, orgId), eq(guestPortalAccess.propertyId, source.propertyId))
    const writer: AccessWriter = {
      active: async () => (await tx.select().from(guestPortalAccess).where(and(where, isNull(guestPortalAccess.revokedAt))).for('update'))[0],
      latestVersion: async () => (await tx.select().from(guestPortalAccess).where(where).orderBy(desc(guestPortalAccess.version)).limit(1))[0]?.version ?? 0,
      insert: async value => (await tx.insert(guestPortalAccess).values(value).returning())[0],
      revoke: async () => { await tx.update(guestPortalAccess).set({ revokedAt: new Date(), updatedAt: new Date() }).where(and(where, isNull(guestPortalAccess.revokedAt))).returning() },
    }
    return fn(source, writer, tx)
  })
}
export async function findGuestAccess(hash: string) {
  const [access] = await db.select().from(guestPortalAccess).where(eq(guestPortalAccess.tokenHash, hash)).limit(1)
  if (!access) return undefined
  const source = await sourceById(db, access.orgId, access.guestProfileId)
  return source ? { access, source } : undefined
}
export async function findAccessById(id: string) {
  const [access] = await db.select().from(guestPortalAccess).where(eq(guestPortalAccess.id, id)).limit(1)
  if (!access) return undefined
  const source = await sourceById(db, access.orgId, access.guestProfileId)
  return source ? { access, source } : undefined
}

export async function readGuestPortalRows(scope: import('./types').GuestScope) {
  const { preArrivalQuestions, guestRequests } = await import('@/lib/db/schema')
  const { asc } = await import('drizzle-orm')
  const [[profile], [property], questions, requests] = await Promise.all([
    db.select().from(guestProfiles).where(and(eq(guestProfiles.id, scope.guestProfileId), eq(guestProfiles.orgId, scope.orgId), eq(guestProfiles.propertyId, scope.propertyId))).limit(1),
    db.select().from(properties).where(and(eq(properties.id, scope.propertyId), eq(properties.orgId, scope.orgId), eq(properties.isActive, true))).limit(1),
    db.select().from(preArrivalQuestions).where(and(eq(preArrivalQuestions.orgId, scope.orgId), eq(preArrivalQuestions.propertyId, scope.propertyId), eq(preArrivalQuestions.isActive, true))).orderBy(asc(preArrivalQuestions.sortOrder), asc(preArrivalQuestions.id)),
    db.select().from(guestRequests).where(and(eq(guestRequests.orgId, scope.orgId), eq(guestRequests.propertyId, scope.propertyId), eq(guestRequests.guestProfileId, scope.guestProfileId))).orderBy(desc(guestRequests.createdAt)),
  ])
  return profile && property ? { profile, property, questions, requests } : undefined
}
