import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/auth/guards', () => ({ getProfile: vi.fn(), getUserProperties: vi.fn() }))
vi.mock('@/lib/db/queries/properties', () => ({ getPropertyByIdForOrganization: vi.fn() }))
import { getProfile, getUserProperties } from '@/lib/auth/guards'
import { getPropertyByIdForOrganization } from '@/lib/db/queries/properties'
import { requireLoPropertyAccess } from './access'
beforeEach(() => {
  vi.mocked(getProfile).mockResolvedValue({ id: 'actor', orgId: 'org-a', role: 'admin', isActive: true } as never)
  vi.mocked(getPropertyByIdForOrganization).mockResolvedValue({ id: 'property-a', orgId: 'org-a', oracleHotelId: 'LO', isActive: true } as never)
  vi.mocked(getUserProperties).mockResolvedValue([])
})
describe('LO staff access', () => {
  it('allows active admin and assigned property manager', async () => {
    expect(await requireLoPropertyAccess('property-a')).toEqual({ actorId: 'actor', orgId: 'org-a', propertyId: 'property-a', oracleHotelId: 'LO' })
    vi.mocked(getProfile).mockResolvedValue({ id: 'actor', orgId: 'org-a', role: 'property_manager', isActive: true } as never)
    vi.mocked(getUserProperties).mockResolvedValue(['property-a'])
    expect((await requireLoPropertyAccess('property-a')).orgId).toBe('org-a')
  })
  it('rejects another organization even for admins', async () => {
    vi.mocked(getPropertyByIdForOrganization).mockResolvedValue(undefined)
    await expect(requireLoPropertyAccess('foreign')).rejects.toMatchObject({ status: 404 })
    expect(getPropertyByIdForOrganization).toHaveBeenCalledWith('foreign', 'org-a')
  })
  it.each([{ role: 'admin', isActive: false }, { role: 'staff', isActive: true }, { role: 'property_manager', isActive: true }])('rejects unauthorized staff %o', async (p) => {
    vi.mocked(getProfile).mockResolvedValue({ id: 'actor', orgId: 'org-a', ...p } as never)
    await expect(requireLoPropertyAccess('property-a')).rejects.toMatchObject({ status: 403 })
  })
  it('rejects anonymous staff', async () => {
    vi.mocked(getProfile).mockResolvedValue(null)
    await expect(requireLoPropertyAccess('property-a')).rejects.toMatchObject({ status: 401 })
  })
  it.each([{ oracleHotelId: 'OTHER', isActive: true }, { oracleHotelId: 'LO', isActive: false }])('rejects unavailable hotel %o', async (p) => {
    vi.mocked(getPropertyByIdForOrganization).mockResolvedValue({ id: 'property-a', orgId: 'org-a', ...p } as never)
    await expect(requireLoPropertyAccess('property-a')).rejects.toMatchObject({ status: 404 })
  })
})
