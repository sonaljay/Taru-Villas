import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth/guards'
import { getTaskById } from '@/lib/db/queries/tasks'
import { TaskDetail } from '@/components/tasks/task-detail'

interface AdminTaskDetailPageProps {
  params: Promise<{ taskId: string }>
}

export default async function AdminTaskDetailPage({
  params,
}: AdminTaskDetailPageProps) {
  await requireRole(['admin'])
  const { taskId } = await params

  const task = await getTaskById(taskId)
  if (!task) {
    notFound()
  }

  return <TaskDetail task={task} backHref="/admin/tasks" />
}
