import { ZodError } from 'zod'
import { sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { getProfile } from '@/lib/auth/guards'
import type { Actor } from './policy'
export class TaskError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
export async function loadActor(
  profileId: string,
  connection: Pick<typeof db, 'execute'> = db,
): Promise<Actor> {
  const [p] = await connection.execute(
    sql`select id,org_id,role,is_active from profiles where id=${profileId}::uuid for share`,
  )
  if (!p || !p.is_active)
    throw new TaskError('Sign in with an active account', 401)
  const memberships = await connection.execute(
    sql`select m.committee_id from task_committee_members m join task_committees c on c.id=m.committee_id where m.profile_id=${profileId}::uuid and c.org_id=${p.org_id}::uuid and c.archived_at is null for share of m`,
  )
  const props = await connection.execute(
    sql`select property_id from property_assignments where user_id=${profileId}::uuid`,
  )
  const [ops] = await connection.execute(
    sql`select id from task_committees where org_id=${p.org_id}::uuid and is_operations`,
  )
  return {
    profileId,
    orgId: String(p.org_id),
    isAdmin: p.role === 'admin',
    isActive: true,
    propertyIds: props.map((r) => String(r.property_id)),
    committeeIds: memberships.map((r) => String(r.committee_id)),
    operationsCommitteeId: String(ops?.id ?? ''),
  }
}
export async function requestActor() {
  const p = await getProfile()
  if (!p) throw new TaskError('Unauthorized', 401)
  return loadActor(p.id)
}
// SQL assumes task table alias t. Values are always bound parameters.
export function taskVisibility(a: Actor): SQL {
  return sql`t.org_id=${a.orgId}::uuid and ( ${a.isAdmin} or exists(select 1 from task_assignees a where a.task_id=t.id and a.profile_id=${a.profileId}::uuid) or exists(select 1 from task_committee_members m where m.committee_id=t.committee_id and m.profile_id=${a.profileId}::uuid) or exists(select 1 from property_assignments p where p.property_id=t.property_id and p.user_id=${a.profileId}::uuid))`
}
export function errorResponse(error: unknown) {
  if(error instanceof ZodError)return Response.json({error:'Invalid request values'},{status:400})
  if (error instanceof TaskError)
    return Response.json({ error: error.message }, { status: error.status })
  const e = error as {
    code?: string
    message?: string
    cause?: { code?: string; message?: string }
  }
  const code = e.cause?.code ?? e.code
  if (
    code === 'P0001' ||
    code === '23503' ||
    code === '23505' ||
    code === '23514'
  )
    return Response.json(
      {
        error:
          code === 'P0001'
            ? (e.cause?.message ?? e.message)
            : 'The change conflicts with task or membership rules.',
      },
      { status: 409 },
    )
  console.error('Task request failed', error)
  return Response.json(
    { error: 'Unable to complete the task request' },
    { status: 500 },
  )
}
