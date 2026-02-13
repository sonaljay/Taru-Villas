import { requireRole } from '@/lib/auth/guards'
import { getTasksForAdmin } from '@/lib/db/queries/tasks'
import { getAllProperties } from '@/lib/db/queries/properties'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const metadata = {
  title: 'Manage Tasks | Taru Villas',
}

export default async function AdminTasksPage() {
  const profile = await requireRole(['admin'])

  const [tasks, properties] = await Promise.all([
    getTasksForAdmin(profile.orgId),
    getAllProperties(profile.orgId),
  ])

  return (
    <TasksPageClient
      tasks={tasks}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      isAdmin
      basePath="/admin/tasks"
    />
  )
}
