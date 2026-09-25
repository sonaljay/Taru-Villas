import { redirect } from 'next/navigation'
import { getProfile } from '@/lib/auth/guards'
import { loadActor } from '@/lib/tasks/access'
import { taskOptions } from '@/lib/tasks/queries'
import type { Options } from '@/components/tasks/workspace-types'
import { TaskCommitteesClient } from '@/components/tasks/task-committees-client'
export const dynamic = 'force-dynamic'
export default async function Page() {
  const p = await getProfile()
  if (!p?.isActive) redirect('/login')
  const actor = await loadActor(p.id)
  if (!actor.isAdmin) redirect('/tasks')
  return (
    <TaskCommitteesClient
      options={
        JSON.parse(
          JSON.stringify({ actor, ...(await taskOptions(actor)) }),
        ) as Options
      }
    />
  )
}
