import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
export async function GET() {
  try {
    const a = await requestActor()
    if (!a.isAdmin) throw new TaskError('Admin access required', 403)
    return Response.json(
      await db.execute(
        sql`select d.id,d.kind,d.channel,d.state,d.error,d.created_at,t.title from task_notification_deliveries d join tasks t on t.id=d.task_id where t.org_id=${a.orgId}::uuid and d.error is not null and d.state in ('pending','failed') order by d.created_at desc limit 30`,
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
