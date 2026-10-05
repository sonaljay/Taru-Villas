import { beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ resolve: vi.fn(), rows: vi.fn(), menus: vi.fn(), excursions: vi.fn() }))
vi.mock('./access', () => ({ resolveGuestScope: mocks.resolve }))
vi.mock('./store', () => ({ readGuestPortalRows: mocks.rows }))
vi.mock('@/lib/db/queries/menus', () => ({ getMenusForProperty: mocks.menus }))
vi.mock('@/lib/db/queries/excursions', () => ({ getActiveExcursionsForProperty: mocks.excursions }))
import { getGuestPortalView } from './queries'
const scope = { orgId: 'org', propertyId: 'A', guestProfileId: 'guest', stayState: 'reserved', arrivalDate: '2026-10-08', departureDate: '2026-10-12', fresh: false }
const menu = (propertyId = 'A') => ({ id: 'menu', propertyId, name: 'Dinner', type: 'set', isActive: true, categories: [{ id: 'cat', menuId: 'menu', propertyId, name: 'Starters', isActive: true, menuItems: [{ id: 'item', categoryId: 'cat', title: 'Soup', price: 'LKR 1,200', isActive: true, secret: 'staff-note' }, { id: 'inactive', categoryId: 'cat', isActive: false }] }] })
beforeEach(() => { vi.clearAllMocks(); mocks.resolve.mockResolvedValue(scope); mocks.rows.mockResolvedValue({ profile: { guestName: 'Fixture', guestEmail: 'private@example.invalid', token: 'secret-ciphertext', roomNumber: null, questionnaireStatus: 'not_started', internalNote: 'staff-note', balance: 'financial-balance' }, property: { name: 'Long House', location: 'Bentota', oracleHotelId: 'LO' }, questions: [{ id: 'q', orgId: 'org', propertyId: 'A', isActive: true, prompt: 'Arrival time', type: 'time', options: [], required: true }], requests: [{ id: 'r', guestProfileId: 'guest', orgId: 'org', propertyId: 'A', kind: 'service', title: 'Water', notes: 'Please', state: 'received', publicReply: null, internalNote: 'staff-note', createdAt: new Date() }] }); mocks.menus.mockResolvedValue([menu()]); mocks.excursions.mockResolvedValue([]) })
it('excludes contacts, credentials, financial fields and internal notes', async () => {
  const view = await getGuestPortalView('token'); const text = JSON.stringify(view)
  for (const secret of ['staff-note', 'secret-ciphertext', 'financial-balance', 'private@example.invalid']) expect(text).not.toContain(secret)
  expect(view.stay).toMatchObject({ roomNumber: null, fresh: false }); expect(view.requests[0].title).toBe('Water')
})
it('never leaks another property catalogue or inactive items', async () => {
  mocks.menus.mockResolvedValue([menu(), menu('B')]); mocks.excursions.mockResolvedValue([{ id: 'foreign', propertyId: 'B', isActive: true }])
  const view = await getGuestPortalView('token'); expect(view.menus).toHaveLength(1); expect(view.menus[0].categories[0].menuItems).toHaveLength(1); expect(view.excursions).toEqual([])
  expect(mocks.rows).toHaveBeenCalledWith(scope); expect(mocks.menus).toHaveBeenCalledWith('A')
})
it('supports an empty catalogue and filters foreign questions/requests', async () => {
  mocks.menus.mockResolvedValue([]); const value = await mocks.rows(); value.questions[0].propertyId = 'B'; value.requests[0].guestProfileId = 'other'; mocks.rows.mockResolvedValue(value)
  const view = await getGuestPortalView('token'); expect(view.menus).toEqual([]); expect(view.questions).toEqual([]); expect(view.requests).toEqual([])
})
it('uses one unavailable error for a vanished scoped profile', async () => { mocks.rows.mockResolvedValue(undefined); await expect(getGuestPortalView('token')).rejects.toMatchObject({ status: 404 }) })
it('removes external booking actions and unsafe image/map protocols', async () => {
  mocks.excursions.mockResolvedValue([{ id: 'e', propertyId: 'A', isActive: true, title: 'River', bookingUrl: 'https://book.example', imageUrl: 'javascript:alert(1)', locations: [{ name: 'River', mapUrl: 'javascript:alert(1)' }] }])
  const [excursion] = (await getGuestPortalView('token')).excursions; expect(excursion.bookingUrl).toBeNull(); expect(excursion.imageUrl).toBeNull(); expect(excursion.locations[0].mapUrl).toBeNull()
})
