import { requireRole } from '@/lib/auth/guards'
import { getAllProperties } from '@/lib/db/queries/properties'
import { getProfilesWithAssignments } from '@/lib/db/queries/profiles'
import { PropertiesPageClient } from '@/components/admin/properties-page-client'

export const metadata = {
  title: 'Properties | Taru Villas',
}

export default async function AdminPropertiesPage() {
  const profile = await requireRole(['admin'])
  const [properties, profilesWithAssignments] = await Promise.all([
    getAllProperties(profile.orgId),
    getProfilesWithAssignments(profile.orgId),
  ])

  // All active users for property assignment and PM selection in the edit form
  const allUsers = profilesWithAssignments
    .filter((p) => p.isActive)
    .map((p) => ({
      id: p.id,
      fullName: p.fullName,
      role: p.role,
      assignedPropertyIds: p.assignments.map((a) => a.propertyId),
    }))

  return (
    <PropertiesPageClient
      properties={properties}
      allUsers={allUsers}
    />
  )
}
