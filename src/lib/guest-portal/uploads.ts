import { randomUUID } from 'node:crypto'
import { GuestInputError, type GuestScope } from './types'
import { withGuestAction, withStaffGuestBooking } from './access'
import { findScopedGuestUpload, insertGuestUpload, putGuestUpload, signGuestUpload, removePrivateGuestObject, markGuestUploadDeleted } from './upload-store'
export async function verifyGuestFile(file: File) {
  if (!file.size || file.size > 8 * 1024 * 1024 || !['image/jpeg','image/png','application/pdf'].includes(file.type)) throw new GuestInputError('Choose a JPEG, PNG or PDF up to 8 MiB')
  const bytes = new Uint8Array(await file.arrayBuffer()); const signature = Array.from(bytes.subarray(0,8))
  const matches = file.type === 'image/png' ? signature.join(',') === '137,80,78,71,13,10,26,10' : file.type === 'image/jpeg' ? signature.slice(0,3).join(',') === '255,216,255' : new TextDecoder().decode(bytes.subarray(0,5)) === '%PDF-'
  if (!matches) throw new GuestInputError('The file content does not match its type')
  return { mime: file.type, byteSize: bytes.length, bytes }
}
export async function saveGuestUpload(scope: GuestScope, file: File): Promise<{ uploadId: string }> {
  const verified = await verifyGuestFile(file); const id = randomUUID(); const extension = { 'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf' }[verified.mime]
  const path = `${scope.orgId}/${scope.guestProfileId}/${id}.${extension}`
  let attempted = false
  try {
    return await withGuestAction(scope, async (_source, tx) => {
      const row = await insertGuestUpload(tx, { id, orgId: scope.orgId, propertyId: scope.propertyId, guestProfileId: scope.guestProfileId, accessId: scope.accessId, objectPath: path, mime: verified.mime, byteSize: verified.byteSize })
      attempted = true; await putGuestUpload(path, verified.bytes, verified.mime)
      return { uploadId: row.id }
    })
  } catch (error) { if (attempted) await removePrivateGuestObject(path).catch(() => undefined); throw error }
}
export async function readGuestUpload(scope: GuestScope, uploadId: string): Promise<{ url: string; expiresIn: number }> {
  const upload = await findScopedGuestUpload(scope,uploadId)
  if (!upload || upload.state === 'deleted') throw new GuestInputError('File unavailable',404)
  return signGuestUpload(upload.objectPath)
}
export async function deleteGuestUpload(scope: GuestScope, uploadId: string) {
  await withGuestAction(scope, async () => { if (!await markGuestUploadDeleted(scope,uploadId)) throw new GuestInputError('File unavailable',404) })
}
export async function readStaffGuestUpload(guestProfileId: string, uploadId: string) { return withStaffGuestBooking(guestProfileId, async source => readGuestUpload({ orgId:source.orgId,propertyId:source.propertyId,guestProfileId:source.id } as GuestScope,uploadId)) }
