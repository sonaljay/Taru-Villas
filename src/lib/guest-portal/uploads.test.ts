import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ action: vi.fn(), read: vi.fn(), upload: vi.fn(), sign: vi.fn(), insert: vi.fn() }))
vi.mock('./access', () => ({ withGuestAction: mocks.action, withStaffGuestBooking: vi.fn() }))
vi.mock('./upload-store', () => ({ insertGuestUpload: mocks.insert, findScopedGuestUpload: mocks.read, signGuestUpload: mocks.sign, putGuestUpload: mocks.upload }))
import { verifyGuestFile, readGuestUpload, saveGuestUpload } from './uploads'
import type { GuestScope } from './types'
const scope = { orgId: 'org', propertyId: 'property', guestProfileId: 'guest', accessId: 'access' } as GuestScope
const png = new File([new Uint8Array([137,80,78,71,13,10,26,10])], 'ignored-name.png', { type: 'image/png' })
beforeEach(() => { vi.clearAllMocks(); mocks.action.mockImplementation(async (_scope, fn) => fn({ id: 'guest', orgId: 'org', propertyId: 'property' }, {})); mocks.insert.mockResolvedValue({ id: 'upload' }); mocks.upload.mockResolvedValue(undefined); mocks.sign.mockResolvedValue({ url: 'https://storage.example.invalid/signed', expiresIn: 60 }) })
it.each([['image/png',new Uint8Array([137,80,78,71,13,10,26,10])],['image/jpeg',new Uint8Array([255,216,255,224])],['application/pdf',new TextEncoder().encode('%PDF-1.7')]])('validates %s MIME and signature', async (mime,bytes) => expect(await verifyGuestFile(new File([bytes],'file',{type:mime}))).toMatchObject({ mime, byteSize: bytes.length }))
it('rejects oversized, empty, spoofed and unsupported files', async () => {
  for (const file of [new File(['x'],'file',{type:'image/png'}),new File(['%PDF-1.7'],'file',{type:'image/jpeg'}),new File(['<script>'],'file',{type:'text/html'}),new File([],'file',{type:'image/png'}),new File([new Uint8Array(8388609)],'file',{type:'image/png'})]) await expect(verifyGuestFile(file)).rejects.toMatchObject({ status: 400 })
})
it('uses random server paths and an ownership metadata row', async () => {
  await saveGuestUpload(scope, png); expect(mocks.action).toHaveBeenCalledWith(scope, expect.any(Function)); const row = mocks.insert.mock.calls[0][1]
  expect(row).toMatchObject({ orgId: 'org', propertyId: 'property', guestProfileId: 'guest', accessId: 'access', mime: 'image/png' }); expect(row.objectPath).toMatch(/^org\/guest\/[0-9a-f-]+\.png$/); expect(row.objectPath).not.toContain('ignored-name')
})
it('rejects foreign upload IDs before signing', async () => { mocks.read.mockResolvedValue(undefined); await expect(readGuestUpload(scope,'foreign')).rejects.toMatchObject({ status: 404 }); expect(mocks.sign).not.toHaveBeenCalled() })
it('signs only an ownership checked private object for sixty seconds', async () => { mocks.read.mockResolvedValue({ objectPath: 'org/guest/file.pdf', state: 'submitted' }); expect(await readGuestUpload(scope,'upload')).toMatchObject({ expiresIn: 60 }); expect(mocks.read).toHaveBeenCalledWith(scope,'upload') })
