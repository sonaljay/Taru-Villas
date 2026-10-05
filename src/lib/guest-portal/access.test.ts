import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ staff: vi.fn(), lock: vi.fn(), lookup: vi.fn(), recover: vi.fn(), insert: vi.fn(), revoke: vi.fn(), current: null as unknown }))
vi.mock('@/lib/auth/guards', () => ({ getProfile: mocks.staff }))
vi.mock('@/lib/oracle/access', () => ({ requireLoPropertyAccess: vi.fn(async () => ({ orgId: 'org', actorId: 'actor' })) }))
vi.mock('./store', () => ({ withGuestBookingLock: mocks.lock, findGuestAccess: mocks.lookup, findAccessById: mocks.recover }))
import { issueGuestLink, recoverGuestLink, resolveGuestScope, revokeGuestLink, encryptGuestSecret, decryptGuestSecret, guestTokenHash, departureExpiry } from './access'
const source = () => ({ id: 'profile', orgId: 'org', propertyId: 'property', arrivalDate: '2026-10-08', departureDate: '2026-10-12', stayState: 'reserved', oracleEnvironment: 'production', lastSyncedRunId: 'run', lastPulledAt: new Date(), propertyActive: true, oracleHotelId: 'LO' })
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('GUEST_PORTAL_LINK_KEY', Buffer.alloc(32, 7).toString('base64')); vi.stubEnv('GUEST_PORTAL_ORIGIN', 'https://stay.example.test')
  mocks.staff.mockResolvedValue({ orgId: 'org', isActive: true }); mocks.current = null
  mocks.lock.mockImplementation(async (_org, _id, fn) => fn(source(), { active: async () => mocks.current, insert: mocks.insert, revoke: mocks.revoke }))
  mocks.insert.mockImplementation(async value => { mocks.current = value; return value })
})
describe('private booking access', () => {
  it('manual sharing and automatic delivery use the same URL without storing plaintext', async () => {
    const link = await issueGuestLink('profile'); const row = mocks.current as Record<string, unknown>
    mocks.recover.mockResolvedValue({ access: row, source: source() })
    expect(await recoverGuestLink(row.id as string)).toBe(link.url)
    expect((await issueGuestLink('profile')).url).toBe(link.url)
    expect(JSON.stringify(row)).not.toContain(link.url.split('/').at(-1))
    expect(row.tokenHash).toBe(guestTokenHash(link.url.split('/').at(-1)!))
  })
  it('issues independent random 32-byte credentials', async () => {
    const first = await issueGuestLink('profile'); mocks.current = null
    const second = await issueGuestLink('profile'); expect(first.url).not.toBe(second.url)
    expect(Buffer.from(first.url.split('/').at(-1)!, 'base64url')).toHaveLength(32)
  })
  it('authenticates ciphertext and its access/version context', () => {
    const encrypted = encryptGuestSecret('token', 'access:1')
    expect(decryptGuestSecret(encrypted, 'access:1')).toBe('token')
    expect(() => decryptGuestSecret(encrypted, 'access:2')).toThrow()
    expect(() => decryptGuestSecret(encrypted.slice(0, -3) + 'xyz', 'access:1')).toThrow()
  })
  it('uses the end of departure day in Colombo', () => expect(departureExpiry('2026-10-12').toISOString()).toBe('2026-10-12T18:29:59.999Z'))
  it('looks up only hash and returns a safe scope', async () => {
    const token = 'a'.repeat(43); mocks.lookup.mockResolvedValue({ access: { id: 'access', version: 2, expiresAt: new Date('2026-10-12T18:29:59Z'), revokedAt: null, orgId: 'org', propertyId: 'property', guestProfileId: 'profile' }, source: source() })
    const scope = await resolveGuestScope(token)
    expect(mocks.lookup).toHaveBeenCalledWith(guestTokenHash(token)); expect(scope).not.toHaveProperty('token'); expect(scope.fresh).toBe(true)
  })
  it.each(['cancelled', 'no_show', 'checked_out', 'waitlist', 'unknown'])('rejects %s source uniformly', async stayState => {
    mocks.lookup.mockResolvedValue({ access: { expiresAt: new Date('2030-01-01') }, source: { ...source(), stayState } })
    await expect(resolveGuestScope('a'.repeat(43))).rejects.toMatchObject({ status: 404 })
  })
  it('rejects expired, revoked, foreign scoped and legacy tokens', async () => {
    await expect(resolveGuestScope('legacy-token')).rejects.toMatchObject({ status: 404 })
    for (const changed of [{ expiresAt: new Date('2020-01-01') }, { revokedAt: new Date() }, { orgId: 'foreign' }]) {
      mocks.lookup.mockResolvedValue({ access: { orgId: 'org', propertyId: 'property', guestProfileId: 'profile', expiresAt: new Date('2030-01-01'), ...changed }, source: source() })
      await expect(resolveGuestScope('a'.repeat(43))).rejects.toMatchObject({ status: 404 })
    }
  })
  it('stale bookings permit read but return fresh=false', async () => {
    mocks.lookup.mockResolvedValue({ access: { orgId: 'org', propertyId: 'property', guestProfileId: 'profile', expiresAt: new Date('2030-01-01') }, source: { ...source(), lastPulledAt: new Date('2020-01-01') } })
    expect((await resolveGuestScope('a'.repeat(43))).fresh).toBe(false)
  })
  it('changed departure expires access even before the cached expiry', async () => {
    mocks.lookup.mockResolvedValue({ access: { orgId: 'org', propertyId: 'property', guestProfileId: 'profile', expiresAt: new Date('2030-01-01') }, source: { ...source(), departureDate: '2020-01-01' } })
    await expect(resolveGuestScope('a'.repeat(43))).rejects.toMatchObject({ status: 404 })
  })
  it('revoke and regenerate invalidate earlier access and increment version', async () => {
    await issueGuestLink('profile'); await revokeGuestLink('profile'); expect(mocks.revoke).toHaveBeenCalled()
    mocks.lock.mockImplementation(async (_org, _id, fn) => fn(source(), { active: async () => null, latestVersion: async () => 1, insert: mocks.insert, revoke: mocks.revoke }))
    expect((await issueGuestLink('profile')).version).toBe(2)
  })
  it('scopes staff lookup to their organization', async () => {
    mocks.lock.mockImplementation(async (org) => { expect(org).toBe('org'); throw Object.assign(Error('Not found'), { status: 404 }) })
    await expect(issueGuestLink('foreign-profile')).rejects.toMatchObject({ status: 404 })
  })
  it('missing encryption key or unsafe origin fails before issuance', async () => {
    vi.stubEnv('GUEST_PORTAL_LINK_KEY', ''); await expect(issueGuestLink('profile')).rejects.toThrow()
    vi.stubEnv('GUEST_PORTAL_LINK_KEY', Buffer.alloc(32).toString('base64')); vi.stubEnv('GUEST_PORTAL_ORIGIN', 'http://evil.example'); await expect(issueGuestLink('profile')).rejects.toThrow()
    expect(mocks.insert).not.toHaveBeenCalled()
  })
})
