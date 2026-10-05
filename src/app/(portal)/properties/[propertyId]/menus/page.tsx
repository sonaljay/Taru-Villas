import { canAccessCatalogueProperty } from '@/lib/catalogues/access'
import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { getPropertyById } from '@/lib/db/queries/properties'
import { getMenusForProperty } from '@/lib/db/queries/menus'
import { MenusPageClient } from '@/components/admin/menus-page-client'

export const dynamic = 'force-dynamic'

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

  if (!(await canAccessCatalogueProperty(profile, propertyId))) notFound()

  const property = await getPropertyById(propertyId)
  if (!property) {
    notFound()
  }

  const menus = await getMenusForProperty(propertyId)

  return <MenusPageClient property={property} menus={menus} />
}
