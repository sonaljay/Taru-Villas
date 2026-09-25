import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requestActor, errorResponse, taskVisibility } from '@/lib/tasks/access'
export async function GET(r: Request) {
  try {
    const a = await requestActor(),
      page = Math.max(
        1,
        Math.min(10000, Number(new URL(r.url).searchParams.get('page')) || 1),
      )
    const allowed = sql`n.profile_id=${a.profileId}::uuid and n.org_id=${a.orgId}::uuid and (n.type<>'task' or exists(select 1 from tasks t where n.link_url='/tasks?task='||t.id::text and ${taskVisibility(a)}))`
    const [items, [count]] = await Promise.all([
      db.execute(
        sql`select n.* from notifications n where ${allowed} order by created_at desc,id desc limit 20 offset ${(page - 1) * 20}`,
      ),
      db.execute(
        sql`select count(*)::int total from notifications n where ${allowed} and read_at is null`,
      ),
    ])
    return Response.json({ items, unread: count.total, page })
  } catch (e) {
    return errorResponse(e)
  }
}
