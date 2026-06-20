import { notFound } from 'next/navigation'
import { requireAuth, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { WastePageClient } from '@/components/waste/waste-page-client'

export const dynamic = 'force-dynamic'

export const metadata = {
  title: 'Daily Wastage | Taru Villas',
}

export default async function PropertyWastePage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const { propertyId } = await params
  const profile = await requireAuth()
  if (!profile) return null

  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(
      profile.id,
      profile.role as 'admin' | 'property_manager' | 'staff'
    )
    if (userProps && !userProps.includes(propertyId)) {
      notFound()
    }
  }

  const property = await getPropertyById(propertyId)
  if (!property) notFound()

  return (
    <WastePageClient
      property={{ id: property.id, name: property.name, code: property.code, slug: property.slug }}
      isAdmin={profile.role === 'admin'}
    />
  )
}
