import { and, eq, lt, or, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { guestPortalUploads } from '@/lib/db/schema'
import { createAdminClient } from '@/lib/supabase/admin'
import { GuestInputError, type GuestScope } from './types'
import type { GuestTransaction } from './store'
const bucket = () => createAdminClient(15_000).storage.from('pre-arrival')
export async function putGuestUpload(path: string, bytes: Uint8Array, mime: string) { const { error } = await bucket().upload(path, bytes, { contentType: mime, upsert: false }); if (error) throw new GuestInputError('Unable to save this file. Please try again.', 503) }
export async function insertGuestUpload(tx: GuestTransaction, value: typeof guestPortalUploads.$inferInsert) { return (await tx.insert(guestPortalUploads).values(value).returning())[0] }
export async function findScopedGuestUpload(scope: Pick<GuestScope,'orgId' | 'propertyId' | 'guestProfileId'>, id: string) { return (await db.select().from(guestPortalUploads).where(and(eq(guestPortalUploads.id, id), eq(guestPortalUploads.orgId, scope.orgId), eq(guestPortalUploads.propertyId, scope.propertyId), eq(guestPortalUploads.guestProfileId, scope.guestProfileId))).limit(1))[0] }
export async function signGuestUpload(path: string) { const { data, error } = await bucket().createSignedUrl(path, 60); if (error || !data) throw new GuestInputError('File temporarily unavailable', 503); return { url: data.signedUrl, expiresIn: 60 } }
export async function removePrivateGuestObject(path: string) { const { error } = await bucket().remove([path]); if (error) throw new GuestInputError('File cleanup temporarily unavailable', 503) }
export async function markGuestUploadDeleted(scope: GuestScope, id: string) {
  return (await db.update(guestPortalUploads).set({ state: 'deleted', updatedAt: new Date() }).where(and(eq(guestPortalUploads.id,id),eq(guestPortalUploads.orgId,scope.orgId),eq(guestPortalUploads.propertyId,scope.propertyId),eq(guestPortalUploads.guestProfileId,scope.guestProfileId),eq(guestPortalUploads.state,'draft'))).returning())[0]
}
export async function cleanGuestUploadDrafts(limit = 50) {
  const rows = await db.select().from(guestPortalUploads).where(and(isNull(guestPortalUploads.cleanedAt),or(eq(guestPortalUploads.state,'deleted'),and(eq(guestPortalUploads.state,'draft'),lt(guestPortalUploads.createdAt,new Date(Date.now()-86400000)))))).limit(Math.min(limit,50))
  for (const row of rows) {
    // Booking actions lock this row too; recheck under lock before removing a draft.
    await db.transaction(async tx => {
      const [current] = await tx.select().from(guestPortalUploads).where(eq(guestPortalUploads.id,row.id)).for('update')
      if (!current || current.state === 'submitted' || current.cleanedAt) return
      await removePrivateGuestObject(current.objectPath)
      await tx.update(guestPortalUploads).set({ state:'deleted',cleanedAt:new Date(),updatedAt:new Date() }).where(eq(guestPortalUploads.id,row.id)).returning()
    })
  }
}
