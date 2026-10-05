import { resolveGuestScope } from './access'
import { readGuestPortalRows } from './store'
import { getMenusForProperty, type MenuWithCategories } from '@/lib/db/queries/menus'
import { getActiveExcursionsForProperty } from '@/lib/db/queries/excursions'
import type { Excursion } from '@/lib/db/schema'
import { GuestInputError, type PublicGuestRequest, type PublicQuestion } from './types'
export function safeGuestUrl(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) return value
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? value : null } catch { return null }
}
export function publicGuestRequest(row: typeof import('@/lib/db/schema').guestRequests.$inferSelect): PublicGuestRequest {
  return { id: row.id, kind: row.kind as PublicGuestRequest['kind'], title: row.title, notes: row.notes, requestedDate: row.requestedDate, requestedTime: row.requestedTime, partySize: row.partySize, quantity: row.quantity, priceNote: row.priceNote, state: row.state as PublicGuestRequest['state'], publicReply: row.publicReply, createdAt: row.createdAt.toISOString() }
}
export async function getGuestPortalView(token: string) {
  const scope = await resolveGuestScope(token)
  const [rows, menuRows, excursionRows] = await Promise.all([readGuestPortalRows(scope), getMenusForProperty(scope.propertyId), getActiveExcursionsForProperty(scope.propertyId)])
  if (!rows) throw new GuestInputError('Guest link unavailable', 404)
  const menus: MenuWithCategories[] = menuRows.filter(m => m.propertyId === scope.propertyId && m.isActive).map(m => ({
    id: m.id, propertyId: m.propertyId, name: m.name, type: m.type, dayOfWeek: m.dayOfWeek, priceNote: m.priceNote, footerNote: m.footerNote, description: m.description, sortOrder: m.sortOrder, isActive: m.isActive, createdAt: m.createdAt, updatedAt: m.updatedAt,
    categories: m.categories.filter(c => c.menuId === m.id && c.propertyId === scope.propertyId && c.isActive).map(c => ({
      id: c.id, propertyId: c.propertyId, menuId: c.menuId, name: c.name, description: c.description, priceNote: c.priceNote, sortOrder: c.sortOrder, isActive: c.isActive, createdAt: c.createdAt, updatedAt: c.updatedAt,
      menuItems: c.menuItems.filter(i => i.categoryId === c.id && i.isActive).map(i => ({ id: i.id, categoryId: i.categoryId, title: i.title, description: i.description, imageUrl: safeGuestUrl(i.imageUrl), price: i.price, tags: i.tags ?? [], sortOrder: i.sortOrder, isActive: i.isActive, createdAt: i.createdAt, updatedAt: i.updatedAt })),
    })),
  }))
  const excursions: Excursion[] = excursionRows.filter(e => e.propertyId === scope.propertyId && e.isActive).map(e => ({ id: e.id, propertyId: e.propertyId, title: e.title, description: e.description, experience: e.experience, whatsIncluded: e.whatsIncluded, imageUrl: safeGuestUrl(e.imageUrl), price: e.price, duration: e.duration, tags: e.tags ?? [], locations: (e.locations ?? []).map(l => ({ name: l.name, mapUrl: safeGuestUrl(l.mapUrl) })), bookingUrl: null, sortOrder: e.sortOrder, isActive: e.isActive, createdAt: e.createdAt, updatedAt: e.updatedAt }))
  const questions: PublicQuestion[] = rows.questions.filter(q => q.orgId === scope.orgId && q.propertyId === scope.propertyId && q.isActive).map(q => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options ?? [], required: q.required }))
  return {
    stay: { guestName: rows.profile.guestName, arrivalDate: scope.arrivalDate, departureDate: scope.departureDate, roomType: rows.profile.roomType, roomNumber: rows.profile.roomNumber, stayState: scope.stayState, fresh: scope.fresh },
    property: { name: rows.property.name, imageUrl: safeGuestUrl(rows.property.imageUrl), location: rows.property.location }, menus, excursions, questions,
    questionnaireStatus: rows.profile.questionnaireStatus,
    requests: rows.requests.filter(r => r.orgId === scope.orgId && r.propertyId === scope.propertyId && r.guestProfileId === scope.guestProfileId).map(publicGuestRequest),
  }
}
export type GuestPortalView = Awaited<ReturnType<typeof getGuestPortalView>>
