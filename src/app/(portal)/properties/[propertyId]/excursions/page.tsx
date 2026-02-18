import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getExcursionsForProperty } from '@/lib/db/queries/excursions'
import { ExcursionsPageClient } from '@/components/admin/excursions-page-client'

export const metadata = {
  title: 'Excursions | Taru Villas',
}

export default async function ExcursionsPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireRole(['admin', 'property_manager'])

  // PMs can only manage their assigned properties
  if (profile.role === 'property_manager') {
    const userProps = await getUserProperties(profile.id, profile.role)
    if (userProps && !userProps.includes(propertyId)) {
      notFound()
    }
  }

  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  const excursions = await getExcursionsForProperty(propertyId)

  return (
    <ExcursionsPageClient property={property} excursions={excursions} />
  )
}
