import { requireRole } from '@/lib/auth/guards'
import { getTasksForAdmin, getTasksForUser } from '@/lib/db/queries/tasks'
import { getAllProperties, getPropertiesForUser } from '@/lib/db/queries/properties'
import { TasksPageClient } from '@/components/tasks/tasks-page-client'

export const metadata = {
  title: 'Tasks | Taru Villas',
}

export default async function TasksPage() {
  const profile = await requireRole(['admin', 'property_manager'])

  const isAdmin = profile.role === 'admin'

  const [tasks, properties] = await Promise.all([
    isAdmin
      ? getTasksForAdmin(profile.orgId)
      : getTasksForUser(profile.id),
    isAdmin
      ? getAllProperties(profile.orgId)
      : getPropertiesForUser(profile.id),
  ])

  return (
    <TasksPageClient
      tasks={tasks}
      properties={properties.map((p) => ({ id: p.id, name: p.name }))}
      isAdmin={isAdmin}
    />
  )
}
