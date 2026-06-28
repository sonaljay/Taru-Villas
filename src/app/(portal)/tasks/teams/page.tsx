import { requireRole } from '@/lib/auth/guards'
import { getTaskTeams } from '@/lib/db/queries/tasks'
import { TaskTeamsClient } from '@/components/tasks/task-teams-client'
import { TasksAreaTabs } from '@/components/tasks/tasks-area-tabs'

export const dynamic = 'force-dynamic'

export default async function TaskTeamsPage() {
  const profile = await requireRole(['admin'])
  const teams = await getTaskTeams(profile.orgId)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Task Manager</h1>
        <p className="text-sm text-muted-foreground">Manage teams for organizing work.</p>
      </div>
      <TasksAreaTabs isAdmin={true} />
      <TaskTeamsClient teams={teams} />
    </div>
  )
}
