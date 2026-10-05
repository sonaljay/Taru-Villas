import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getPropertyByIdForOrganization } from '@/lib/db/queries/properties'
import { getLoSyncStatus } from '@/lib/db/queries/oracle-sync'
import { getGuestProfilesForProperty } from '@/lib/db/queries/guest-profiles'
import { GuestProfilesPageClient } from '@/components/guest-profiles/guest-profiles-page-client'

export const dynamic = 'force-dynamic'

export default async function GuestProfilesPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireRole(['admin', 'property_manager'])

  if (profile.role === 'property_manager') {
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) notFound()
  }

  const property = await getPropertyByIdForOrganization(propertyId, profile.orgId)
  if (!property || !property.isActive) notFound()

  const [profiles, syncStatus] = await Promise.all([getGuestProfilesForProperty(profile.orgId, propertyId), getLoSyncStatus(profile.orgId, propertyId)])

  return (
    <GuestProfilesPageClient
      property={{ id: property.id, name: property.name, oracleHotelId: property.oracleHotelId }}
      profiles={profiles}
      syncStatus={syncStatus}
      isAdmin={profile.role === 'admin'}
    />
  )
}
