import { requireAuth } from '@/lib/auth/guards'
import { getAssignmentsForUser } from '@/lib/db/queries/sops'
import { MySopsClient } from '@/components/sops/my-sops-client'

export const dynamic = 'force-dynamic'

export default async function MySopsPage() {
  const profile = await requireAuth()

  if (!profile) {
    return null
  }

  const assignments = await getAssignmentsForUser(profile.id)

  return <MySopsClient assignments={assignments} />
}
