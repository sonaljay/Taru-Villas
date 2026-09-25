import { requestActor, errorResponse } from '@/lib/tasks/access'
import { taskOptions } from '@/lib/tasks/queries'
export async function GET() {
  try {
    const actor = await requestActor()
    return Response.json({ actor, ...(await taskOptions(actor)) })
  } catch (e) {
    return errorResponse(e)
  }
}
