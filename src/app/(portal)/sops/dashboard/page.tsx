import { requireRole, getUserProperties } from '@/lib/auth/guards'
import {
  getCompletionsForDashboard,
  getActiveUsersForOrg,
} from '@/lib/db/queries/sops'
import { getProperties } from '@/lib/db/queries/properties'
import { SopDashboardClient } from '@/components/sops/sop-dashboard-client'

export const dynamic = 'force-dynamic'

export default async function SopDashboardPage() {
  const profile = await requireRole(['admin', 'property_manager'])

  const propertyIds = await getUserProperties(profile.id, profile.role)

  const [completions, orgProperties, orgUsers] = await Promise.all([
    getCompletionsForDashboard(profile.orgId, {}, propertyIds),
    getProperties(profile.orgId),
    getActiveUsersForOrg(profile.orgId),
  ])

  // Filter properties for PM if needed
  const visibleProperties = propertyIds
    ? orgProperties.filter((p) => propertyIds.includes(p.id))
    : orgProperties

  return (
    <SopDashboardClient
      completions={completions}
      properties={visibleProperties.map((p) => ({ id: p.id, name: p.name }))}
      users={orgUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
    />
  )
}
