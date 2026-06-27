import { requireAuth } from '@/lib/auth/guards'
import { getTasks, getTaskTeams } from '@/lib/db/queries/tasks'
import { getAllProperties } from '@/lib/db/queries/properties'
import { getProfiles } from '@/lib/db/queries/profiles'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const dynamic = 'force-dynamic'

export default async function TasksPage() {
  const profile = await requireAuth()
  if (!profile) return null

  const [tasks, teams, properties, users] = await Promise.all([
    getTasks(profile.orgId),
    getTaskTeams(profile.orgId),
    getAllProperties(profile.orgId),
    getProfiles(profile.orgId),
  ])

  return (
    <TasksPageClient
      tasks={tasks}
      teams={teams}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
      currentUserId={profile.id}
      isAdmin={profile.role === 'admin'}
    />
  )
}
