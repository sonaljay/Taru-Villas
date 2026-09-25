import { after } from 'next/server'
import { deliverTaskNotifications } from '@/lib/tasks/notifications'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { listWorkflowTasks } from '@/lib/tasks/queries'
import { creation, createWorkflowTask } from '@/lib/tasks/lifecycle'
export async function GET(request: Request) {
  try {
    return Response.json(
      await listWorkflowTasks(
        await requestActor(),
        new URL(request.url).searchParams,
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
export async function POST(request: Request) {
  try {
    const a = await requestActor()
    const body = creation.safeParse(await request.json())
    if (!body.success) throw new TaskError(body.error.issues[0].message)
    const id = await createWorkflowTask(a, body.data)
    after(async () => {
      await deliverTaskNotifications(10)
    })
    return Response.json({ id }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
