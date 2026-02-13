import { notFound } from 'next/navigation'
import { requireRole, getUserProperties } from '@/lib/auth/guards'
import { getTaskById } from '@/lib/db/queries/tasks'
import { TaskDetail } from '@/components/tasks/task-detail'

interface TaskDetailPageProps {
  params: Promise<{ taskId: string }>
}

export default async function TaskDetailPage({ params }: TaskDetailPageProps) {
  const profile = await requireRole(['admin', 'property_manager'])
  const { taskId } = await params

  const task = await getTaskById(taskId)
  if (!task) {
    notFound()
  }

  // PMs can only see tasks for their assigned properties
  if (profile.role !== 'admin') {
    const userProps = await getUserProperties(profile.id, profile.role as 'property_manager')
    if (userProps && !userProps.includes(task.propertyId)) {
      notFound()
    }
  }

  return <TaskDetail task={task} backHref="/tasks" />
}
