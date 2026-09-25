import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requestActor, errorResponse } from '@/lib/tasks/access'
export async function PATCH(
  _r: Request,
  c: { params: Promise<{ id: string }> },
) {
  try {
    const a = await requestActor(),
      id = z
        .string()
        .uuid()
        .parse((await c.params).id)
    await db.execute(
      sql`update notifications set read_at=now() where id=${id}::uuid and profile_id=${a.profileId}::uuid and org_id=${a.orgId}::uuid`,
    )
    return Response.json({ read: true })
  } catch (e) {
    return errorResponse(e)
  }
}
