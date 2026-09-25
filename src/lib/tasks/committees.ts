import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { z } from 'zod'
import { TaskError, loadActor } from './access'
import type { Actor } from './policy'
export const committeeInput = z.object({
  name: z.string().trim().min(1).max(150),
  memberIds: z.array(z.string().uuid()).max(200),
  archived: z.boolean().optional(),
})
export async function saveCommittee(
  actor: Actor,
  id: string | null,
  input: z.infer<typeof committeeInput>,
) {
  return db.transaction(async (tx) => {
    const a = await loadActor(actor.profileId, tx)
    if (!a.isAdmin) throw new TaskError('Admin access required', 403)
    const before = id
      ? (
          await tx.execute(
            sql`select * from task_committees where id=${id}::uuid and org_id=${a.orgId}::uuid for update`,
          )
        )[0]
      : null
    if (id && !before) throw new TaskError('Committee not found', 404)
    if (before?.is_operations && input.archived)
      throw new TaskError('Operations cannot be archived.')
    if (input.archived && id) {
      const tasks = await tx.execute(
        sql`select id from tasks where committee_id=${id}::uuid and status<>'done' and archived_at is null limit 1`,
      )
      if (tasks.length)
        throw new TaskError('Transfer or complete open tasks first.')
    }
    for (const profileId of input.memberIds) {
      const rows = await tx.execute(
        sql`select id from profiles where id=${profileId}::uuid and org_id=${a.orgId}::uuid and is_active for share`,
      )
      if (!rows.length)
        throw new TaskError('Choose active users in this organization.')
    }
    const oldMembers = id
      ? await tx.execute(
          sql`select profile_id from task_committee_members where committee_id=${id}::uuid`,
        )
      : []
    if (id && !input.memberIds.length) {
      const pending = await tx.execute(
        sql`select id from tasks where committee_id=${id}::uuid and approval='pending' and archived_at is null limit 1`,
      )
      if (pending.length)
        throw new TaskError(
          'Keep at least one member while approvals are pending.',
        )
    }
    const [c] = id
      ? await tx.execute(
          sql`update task_committees set name=${input.name},archived_at=${input.archived ? new Date() : null} where id=${id}::uuid returning *`,
        )
      : await tx.execute(
          sql`insert into task_committees(org_id,name) values(${a.orgId}::uuid,${input.name}) returning *`,
        )
    await tx.execute(
      sql`delete from task_committee_members where committee_id=${c.id}::uuid`,
    )
    for (const profileId of new Set(input.memberIds))
      await tx.execute(
        sql`insert into task_committee_members(committee_id,profile_id) values(${c.id}::uuid,${profileId}::uuid)`,
      )
    await tx.execute(
      sql`insert into task_events(org_id,committee_id,actor_id,actor_name,kind,before_value,after_value) values(${a.orgId}::uuid,${c.id}::uuid,${a.profileId}::uuid,(select full_name from profiles where id=${a.profileId}::uuid),'committee_updated',${JSON.stringify({ committee: before, members: oldMembers })}::jsonb,${JSON.stringify({ committee: c, members: input.memberIds })}::jsonb)`,
    )
    return c
  })
}
