import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
export async function GET(r: Request) {
  try {
    const a = await requestActor()
    if (!a.isAdmin && !a.committeeIds.includes(a.operationsCommitteeId))
      throw new TaskError('Operations access required', 403)
    const search = new URL(r.url).searchParams.get('search') ?? ''
    return Response.json(
      await db.execute(
        sql`select t.id,t.title,t.version,t.approval,t.committee_id,c.name committee_name,p.name property_name from tasks t join task_committees c on c.id=t.committee_id left join properties p on p.id=t.property_id where t.org_id=${a.orgId}::uuid and t.status<>'done' and t.archived_at is null and t.title ilike ${'%' + search + '%'} order by t.updated_at desc limit 100`,
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
