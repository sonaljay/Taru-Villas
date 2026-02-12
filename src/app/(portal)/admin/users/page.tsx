import { requireRole } from '@/lib/auth/guards'
import { getProfilesWithAssignments } from '@/lib/db/queries/profiles'
import { getAllProperties } from '@/lib/db/queries/properties'
import { UserTable } from '@/components/admin/user-table'

export const metadata = {
  title: 'Users | Taru Villas',
}

export default async function UsersPage() {
  const profile = await requireRole(['admin'])

  const [users, properties] = await Promise.all([
    getProfilesWithAssignments(profile.orgId),
    getAllProperties(profile.orgId),
  ])

  return <UserTable users={users} properties={properties} />
}
