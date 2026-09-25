import { z } from 'zod'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { saveCommittee, committeeInput } from '@/lib/tasks/committees'
export async function PATCH(
  r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    const a = await requestActor()
    const p = committeeInput.safeParse(await r.json())
    if (!p.success) throw new TaskError(p.error.issues[0].message)
    return Response.json(
      await saveCommittee(
        a,
        z
          .string()
          .uuid()
          .parse((await c.params).id),
        p.data,
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
