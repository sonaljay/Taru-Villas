import { requireRole } from '@/lib/auth/guards'
import { getSubmissionsWithDetails } from '@/lib/db/queries/surveys'
import { getAllProperties } from '@/lib/db/queries/properties'
import { AdminSurveysClient } from '@/components/admin/admin-surveys-client'

export const metadata = {
  title: 'Survey History | Taru Villas',
}

export default async function AdminSurveysPage() {
  const profile = await requireRole(['admin'])
  const [submissions, properties] = await Promise.all([
    getSubmissionsWithDetails(),
    getAllProperties(profile.orgId),
  ])

  return (
    <AdminSurveysClient
      submissions={submissions}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
    />
  )
}
