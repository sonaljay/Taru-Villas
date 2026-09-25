import { z } from 'zod'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { getWorkflowTask } from '@/lib/tasks/queries'
import { executeTaskCommand, fields } from '@/lib/tasks/lifecycle'
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: Request, c: Ctx) {
  try {
    const a = await requestActor()
    return Response.json(
      await getWorkflowTask(
        a,
        z
          .string()
          .uuid()
          .parse((await c.params).id),
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
export async function PATCH(r: Request, c: Ctx) {
  try {
    const a = await requestActor()
    const parsed = z
      .object({ version: z.number().int(), patch: fields.partial().strict() })
      .safeParse(await r.json())
    if (!parsed.success)
      throw new TaskError('Refresh the task and submit a versioned edit.')
    const id = (await c.params).id
    await executeTaskCommand(a, id, parsed.data.version, {
      type: 'edit',
      patch: parsed.data.patch,
    })
    return Response.json(await getWorkflowTask(a, id))
  } catch (e) {
    return errorResponse(e)
  }
}
export async function DELETE() {
  return Response.json(
    { error: 'Use the audited Archive action.' },
    { status: 405 },
  )
}
