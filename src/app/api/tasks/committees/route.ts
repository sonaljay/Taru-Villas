import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { saveCommittee, committeeInput } from '@/lib/tasks/committees'
import { taskOptions } from '@/lib/tasks/queries'
export async function GET() {
  try {
    const a = await requestActor()
    if (!a.isAdmin) throw new TaskError('Admin access required', 403)
    return Response.json((await taskOptions(a)).committees)
  } catch (e) {
    return errorResponse(e)
  }
}
export async function POST(r: Request) {
  try {
    const a = await requestActor()
    const p = committeeInput.safeParse(await r.json())
    if (!p.success) throw new TaskError(p.error.issues[0].message)
    return Response.json(await saveCommittee(a, null, p.data), { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
