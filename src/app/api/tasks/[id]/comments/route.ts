import { z } from 'zod'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { addComment } from '@/lib/tasks/activity'
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const a = await requestActor()
    const p = z
      .object({ body: z.string().trim().min(1).max(10000) })
      .safeParse(await r.json())
    if (!p.success)
      throw new TaskError('Write a comment up to 10,000 characters.')
    return Response.json(
      await addComment(
        a,
        z
          .string()
          .uuid()
          .parse((await c.params).id),
        p.data.body,
      ),
      { status: 201 },
    )
  } catch (e) {
    return errorResponse(e)
  }
}
