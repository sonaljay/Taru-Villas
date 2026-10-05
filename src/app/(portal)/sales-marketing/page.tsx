import { requireRole } from '@/lib/auth/guards'
import { getPropertiesForUser } from '@/lib/db/queries/properties'
import { getLoBookingReport } from '@/lib/db/queries/sales-marketing'
import { defaultFutureRange } from '@/lib/sales-marketing/room-nights'
import { BookingsPageClient } from '@/components/sales-marketing/bookings-page-client'
export const dynamic = 'force-dynamic'
export default async function SalesMarketingPage() {
  const profile = await requireRole(['admin', 'property_manager'])
  const accessible = await getPropertiesForUser(profile.id)
  const properties = accessible.filter(p => p.orgId === profile.orgId && p.isActive && p.oracleHotelId === 'LO').map(p => ({ id: p.id, name: p.name }))
  const range = defaultFutureRange(new Date())
  const initial = properties.length ? await getLoBookingReport(properties[0].id, range) : null
  return <BookingsPageClient properties={properties} initial={initial} initialRange={range} />
}
