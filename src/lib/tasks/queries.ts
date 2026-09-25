import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { type Actor, canViewTask, canReviewTransfer } from './policy'
import { TaskError, taskVisibility } from './access'
export type TaskRow = {
  id: string
  org_id: string
  title: string
  description: string | null
  property_id: string | null
  property_name: string | null
  project_id: string | null
  project_name: string | null
  committee_id: string
  committee_name: string
  status: string
  priority: string
  approval: string
  approval_cycle: number
  version: number
  due_date: string | null
  created_at: string
  completed_at: string | null
  archived_at: string | null
  assignee_ids: string[]
  assignees: { id: string; name: string }[]
  paused_status: string | null
}
export const scope = (t: TaskRow) => ({
  orgId: t.org_id,
  propertyId: t.property_id,
  committeeId: t.committee_id,
  assigneeIds: t.assignee_ids,
})
const selectTask = sql`select t.*,p.name property_name,j.name project_name,c.name committee_name,
 coalesce((select json_agg(a.profile_id) from task_assignees a where a.task_id=t.id),'[]') assignee_ids,
 coalesce((select json_agg(json_build_object('id',p.id,'name',p.full_name)) from task_assignees a join profiles p on p.id=a.profile_id where a.task_id=t.id),'[]') assignees
 from tasks t left join properties p on p.id=t.property_id left join projects j on j.id=t.project_id join task_committees c on c.id=t.committee_id`
export async function getWorkflowTask(
  a: Actor,
  id: string,
  transferOnly = false,
  connection: Pick<typeof db, 'execute'> = db,
) {
  const [row] = await connection.execute(
    sql`${selectTask} where t.id=${id}::uuid and t.org_id=${a.orgId}::uuid`,
  )
  if (!row) throw new TaskError('Task not found', 404)
  const task = row as unknown as TaskRow
  if (
    !(transferOnly
      ? canReviewTransfer(a, scope(task))
      : canViewTask(a, scope(task)))
  )
    throw new TaskError('Task not found', 404)
  return task
}
export async function listWorkflowTasks(a: Actor, params: URLSearchParams) {
  const terms = [taskVisibility(a), sql`t.archived_at is null`]
  const text = params.get('search')?.trim()
  if (text) terms.push(sql`t.title ilike ${'%' + text + '%'}`)
  for (const [key, column] of [
    ['propertyId', 'property_id'],
    ['projectId', 'project_id'],
    ['committeeId', 'committee_id'],
  ] as const) {
    const v = params.get(key)
    if (v === 'none') terms.push(sql`${sql.raw('t.' + column)} is null`)
    else if (v && /^[\da-f-]{36}$/i.test(v))
      terms.push(sql`${sql.raw('t.' + column)}=${v}::uuid`)
  }
  for (const [key, values] of [
    ['status', ['todo', 'in_progress', 'stuck', 'done']],
    ['priority', ['low', 'medium', 'high']],
    ['approval', ['not_required', 'pending', 'approved', 'rejected']],
  ] as const) {
    const v = params.get(key)
    if (v && values.some((x) => x === v))
      terms.push(sql`${sql.raw('t.' + key)}::text=${v}`)
  }
  const assignee = params.get('assigneeId')
  if (assignee && /^[\da-f-]{36}$/i.test(assignee))
    terms.push(
      sql`exists(select 1 from task_assignees a where a.task_id=t.id and a.profile_id=${assignee}::uuid)`,
    )
  const view = params.get('view') ?? 'open'
  if (view === 'mine')
    terms.push(
      sql`exists(select 1 from task_assignees a where a.task_id=t.id and a.profile_id=${a.profileId}::uuid)`,
    )
  if (view === 'overdue')
    terms.push(
      sql`t.status<>'done' and t.due_date<(now() at time zone 'Asia/Colombo')::date`,
    )
  if (view === 'approval') terms.push(sql`t.approval='pending'`)
  if (view === 'completed') terms.push(sql`t.status='done'`)
  if (view === 'open') terms.push(sql`t.status<>'done'`)
  const where = sql.join(terms, sql` and `),
    page = Math.max(1, Math.min(100000, Number(params.get('page')) || 1))
  const [count] = await db.execute(
    sql`select count(*)::int total from tasks t where ${where}`,
  )
  const rows = await db.execute(
    sql`${selectTask} where ${where} order by (t.status<>'done' and t.due_date<(now() at time zone 'Asia/Colombo')::date) desc nulls last,case t.priority when 'high' then 0 when 'medium' then 1 else 2 end,t.due_date asc nulls last,t.created_at desc,t.id limit 30 offset ${(page - 1) * 30}`,
  )
  return {
    items: rows as unknown as TaskRow[],
    total: Number(count.total),
    page,
  }
}
export async function taskOptions(a: Actor) {
  const [committees, properties, projects, users] = await Promise.all([
    db.execute(
      sql`select c.*,coalesce((select json_agg(m.profile_id) from task_committee_members m where m.committee_id=c.id),'[]') member_ids from task_committees c where c.org_id=${a.orgId}::uuid and c.archived_at is null order by c.is_operations desc,c.name`,
    ),
    db.execute(
      sql`select p.id,p.name from properties p where p.org_id=${a.orgId}::uuid and (${a.isAdmin} or exists(select 1 from property_assignments x where x.user_id=${a.profileId}::uuid and x.property_id=p.id) or exists(select 1 from tasks t where t.property_id=p.id and ${taskVisibility(a)})) order by p.name`,
    ),
    db.execute(
      sql`select j.id,j.name from projects j where j.org_id=${a.orgId}::uuid and j.status='active' and (${a.isAdmin} or j.created_by=${a.profileId}::uuid or exists(select 1 from tasks t where t.project_id=j.id and ${taskVisibility(a)})) order by j.name`,
    ),
    db.execute(
      sql`select id,full_name name from profiles where org_id=${a.orgId}::uuid and is_active order by full_name`,
    ),
  ])
  return { committees, properties, projects, users }
}

export async function scopedProjects(a: Actor) {
  const rows = await db.execute(
    sql`select j.*,count(t.id)::int task_count,count(t.id) filter(where t.status='done')::int done_count from projects j left join tasks t on t.project_id=j.id and t.archived_at is null and ${taskVisibility(a)} where j.org_id=${a.orgId}::uuid and (${a.isAdmin} or j.created_by=${a.profileId}::uuid or exists(select 1 from tasks t where t.project_id=j.id and ${taskVisibility(a)})) group by j.id order by j.name`,
  )
  return rows.map((r) => ({
    id: String(r.id),
    orgId: String(r.org_id),
    name: String(r.name),
    description: r.description as string | null,
    color: r.color as string | null,
    status: r.status as 'active' | 'archived',
    targetDate: r.target_date as string | null,
    createdBy: r.created_by as string | null,
    createdAt: new Date(String(r.created_at)),
    updatedAt: new Date(String(r.updated_at)),
    taskCount: Number(r.task_count),
    doneCount: Number(r.done_count),
  }))
}
