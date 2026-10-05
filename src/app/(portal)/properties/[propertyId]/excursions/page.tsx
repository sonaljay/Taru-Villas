import { canAccessCatalogueProperty } from '@/lib/catalogues/access'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getExcursionsForProperty } from '@/lib/db/queries/excursions'
import { ExcursionsPageClient } from '@/components/admin/excursions-page-client'

export const dynamic = 'force-dynamic'

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

  if (!(await canAccessCatalogueProperty(profile, propertyId))) notFound()

  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  const excursions = await getExcursionsForProperty(propertyId)

  return (
    <ExcursionsPageClient property={property} excursions={excursions} />
  )
}
