import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/guards'
import { loadActor } from '@/lib/tasks/access'
import { taskOptions } from '@/lib/tasks/queries'
import { TaskWorkspace } from '@/components/tasks/task-workspace'
import type { Options } from '@/components/tasks/workspace-types'
export const dynamic = 'force-dynamic'
export default async function TasksPage() {
  const p = await getProfile()
  if (!p?.isActive) redirect('/login')
  const actor = await loadActor(p.id)
  const options = JSON.parse(
    JSON.stringify({ actor, ...(await taskOptions(actor)) }),
  ) as Options
  return <TaskWorkspace options={options} />
}
