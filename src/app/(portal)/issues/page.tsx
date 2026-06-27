import { requireRole } from '@/lib/auth/guards'
import { getIssuesForAdmin, getIssuesForUser } from '@/lib/db/queries/issues'
import { getAllProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { IssuesPageClient } from '@/components/issues/issues-page-client'

export const metadata = {
  title: 'Issues | Taru Villas',
}

export const dynamic = 'force-dynamic'

export default async function IssuesPage() {
  const profile = await requireRole(['admin', 'property_manager'])

  const isAdmin = profile.role === 'admin'

  const [issueRows, properties] = await Promise.all([
    isAdmin
      ? getIssuesForAdmin(profile.orgId)
      : getIssuesForUser(profile.id),
    isAdmin
      ? getAllProperties(profile.orgId)
      : getPropertiesForUser(profile.id),
  ])

  return (
    <IssuesPageClient
      issues={issueRows}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      isAdmin={isAdmin}
      basePath="/issues"
    />
  )
}
