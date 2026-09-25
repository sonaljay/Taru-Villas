import { after } from 'next/server'
import { deliverTaskNotifications } from '@/lib/tasks/notifications'
import { z } from 'zod'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { executeTaskCommand, command } from '@/lib/tasks/lifecycle'
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const a = await requestActor()
    const parsed = z
      .object({ version: z.number().int(), command })
      .safeParse(await r.json())
    if (!parsed.success) throw new TaskError(parsed.error.issues[0].message)
    const id = z
      .string()
      .uuid()
      .parse((await c.params).id)
    await executeTaskCommand(a, id, parsed.data.version, parsed.data.command)
    after(async () => {
      await deliverTaskNotifications(10)
    })
    return Response.json({ id })
  } catch (e) {
    return errorResponse(e)
  }
}
