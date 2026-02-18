import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getMenuCategoriesForProperty } from '@/lib/db/queries/menus'
import { MenusPageClient } from '@/components/admin/menus-page-client'

export const metadata = {
  title: 'Menu | Taru Villas',
}

export default async function MenusPage({
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

  const categories = await getMenuCategoriesForProperty(propertyId)

  return <MenusPageClient property={property} categories={categories} />
}
