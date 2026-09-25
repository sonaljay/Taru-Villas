import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requestActor, errorResponse } from '@/lib/tasks/access'
import { getWorkflowTask } from '@/lib/tasks/queries'
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const a = await requestActor(),
      id = z
        .string()
        .uuid()
        .parse((await c.params).id)
    await getWorkflowTask(a, id)
    const page = Math.max(
      1,
      Math.min(100000, Number(new URL(r.url).searchParams.get('page')) || 1),
    )
    const [events, files, comments] = await Promise.all([
      db.execute(
        sql`select id,actor_name,kind,before_value,after_value,created_at from task_events where task_id=${id}::uuid order by created_at desc,id desc limit 30 offset ${(page - 1) * 30}`,
      ),
      db.execute(
        sql`select id,name,size,created_at from task_attachments where task_id=${id}::uuid and removed_at is null order by created_at desc`,
      ),
      db.execute(
        sql`select c.*,p.full_name actor_name from task_comments c join profiles p on p.id=c.actor_id where c.task_id=${id}::uuid order by c.created_at desc,c.id desc limit 30 offset ${(page - 1) * 30}`,
      ),
    ])
    return Response.json({ events, files, comments, page })
  } catch (e) {
    return errorResponse(e)
  }
}
