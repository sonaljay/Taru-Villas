import { requireRole } from '@/lib/auth/guards'
import { getAllProperties } from '@/lib/db/queries/properties'
import { PropertiesPageClient } from '@/components/admin/properties-page-client'

export const metadata = {
  title: 'Properties | Taru Villas',
}

export default async function AdminPropertiesPage() {
  const profile = await requireRole(['admin'])
  const properties = await getAllProperties(profile.orgId)

  return <PropertiesPageClient properties={properties} />
}
