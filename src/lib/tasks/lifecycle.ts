import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { tasks, taskAssignees, type NewTask } from '@/lib/db/schema'
import { TaskError, loadActor } from './access'
import {
  canEditTask,
  canTransferTask,
  canDecideTask,
  type Actor,
} from './policy'
import { checkTransition } from './transitions'
import { assertVisitReportTaskEdit } from '@/lib/db/queries/tasks'
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) =>
      !Number.isNaN(Date.parse(v)) &&
      new Date(v).toISOString().slice(0, 10) === v,
    'Invalid date',
  )
  .nullable()
export const fields = z.object({
  title: z.string().trim().min(1).max(1000),
  description: z.string().max(30000).nullable().optional(),
  propertyId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  dueDate: date.optional(),
  assigneeIds: z.array(z.string().uuid()).max(100).optional(),
})
export const creation = fields
  .extend({ committeeId: z.string().uuid().nullable().optional() })
  .strict()
export const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit'), patch: fields.partial().strict() }),
  z.object({
    type: z.literal('transfer'),
    committeeId: z.string().uuid(),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('require_approval'),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('resubmit'),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.object({
    type: z.literal('decide'),
    cycle: z.number().int(),
    decision: z.enum(['approved', 'rejected']),
    note: z.string().max(4000),
  }),
  z.object({
    type: z.literal('progress'),
    status: z.enum(['todo', 'in_progress', 'stuck', 'done']),
  }),
  z.object({
    type: z.literal('reopen'),
    reason: z.string().trim().min(1).max(4000),
  }),
  z.object({ type: z.literal('archive') }),
])
export async function actorContext(tx: Tx, a: Actor, action: string) {
  await tx.execute(
    sql`select set_config('app.task_actor',${a.profileId},true),set_config('app.task_action',${action},true)`,
  )
}
export async function reviewable(tx: Tx, id: string, org: string) {
  const rows = await tx.execute(
    sql`select c.id from task_committees c where c.id=${id}::uuid and c.org_id=${org}::uuid and c.archived_at is null and exists(select 1 from task_committee_members m join profiles p on p.id=m.profile_id where m.committee_id=c.id and p.is_active and p.org_id=c.org_id) for share`,
  )
  if (!rows.length)
    throw new TaskError(
      'Add active committee members before requesting approval.',
    )
}
async function assignees(tx: Tx, id: string, ids: string[]) {
  const wanted = [...new Set(ids)]
  const old = await tx
    .select()
    .from(taskAssignees)
    .where(eq(taskAssignees.taskId, id))
  for (const row of old)
    if (!wanted.includes(row.profileId))
      await tx.execute(
        sql`delete from task_assignees where task_id=${id}::uuid and profile_id=${row.profileId}::uuid`,
      )
  for (const profileId of wanted)
    if (!old.some((r) => r.profileId === profileId))
      await tx.insert(taskAssignees).values({ taskId: id, profileId })
}
export async function createWorkflowTask(
  actor: Actor,
  input: z.infer<typeof creation>,
) {
  return db.transaction(async (tx) => {
    const a = await loadActor(actor.profileId, tx)
    await actorContext(tx, a, 'created')
    const committee = input.committeeId ?? a.operationsCommitteeId
    if (!committee)
      throw new TaskError('An admin must configure the Operations Committee.')
    if (input.committeeId) {
      if (
        !canTransferTask(a, {
          orgId: a.orgId,
          propertyId: null,
          committeeId: committee,
          assigneeIds: [],
        })
      )
        throw new TaskError(
          'Only Operations and admins can choose a committee.',
          403,
        )
      await reviewable(tx, committee, a.orgId)
    }
    if (
      input.propertyId &&
      !a.isAdmin &&
      !a.propertyIds.includes(input.propertyId) &&
      !a.committeeIds.includes(a.operationsCommitteeId)
    )
      throw new TaskError('Choose a property assigned to you.', 403)
    const { assigneeIds = [], committeeId: _, ...rest } = input
    void _
    const [task] = await tx
      .insert(tasks)
      .values({
        ...rest,
        committeeId: committee,
        orgId: a.orgId,
        createdBy: a.profileId,
        approval: input.committeeId ? 'pending' : 'not_required',
        approvalCycle: input.committeeId ? 1 : 0,
      })
      .returning()
    // A creator without scope retains access as an explicit responsible user.
    await assignees(tx, task.id, [
      ...assigneeIds,
      ...(!a.isAdmin && !a.committeeIds.includes(committee) && !input.propertyId
        ? [a.profileId]
        : []),
    ])
    return task.id
  })
}
export async function executeTaskCommand(
  actor: Actor,
  id: string,
  version: number,
  c: z.infer<typeof command>,
) {
  return db.transaction(async (tx) => {
    const a = await loadActor(actor.profileId, tx)
    const [t] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .for('update')
    if (!t || t.orgId !== a.orgId || t.archivedAt)
      throw new TaskError('Task not found', 404)
    const assigned = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, id))
    const scope = {
      orgId: t.orgId,
      propertyId: t.propertyId,
      committeeId: t.committeeId,
      assigneeIds: assigned.map((x) => x.profileId),
    }
    const allowed =
      c.type === 'decide'
        ? canDecideTask(a, scope)
        : ['transfer', 'require_approval', 'resubmit'].includes(c.type)
          ? canTransferTask(a, scope)
          : canEditTask(a, scope)
    if (!allowed) throw new TaskError('You cannot perform this action.', 403)
    try {
      checkTransition(
        {
          version: t.version,
          status: t.status,
          approval: t.approval,
          approval_cycle: t.approvalCycle,
        },
        c,
        version,
      )
    } catch (e) {
      throw new TaskError((e as Error).message, 409)
    }
    await actorContext(tx, a, c.type)
    const patch: Partial<NewTask> = { updatedAt: new Date() }
    if (c.type === 'edit') Object.assign(patch, c.patch)
    delete (patch as Record<string, unknown>).assigneeIds
    if (c.type === 'transfer') {
      await reviewable(tx, c.committeeId, a.orgId)
      if (c.committeeId === t.committeeId)
        throw new TaskError('Select a different committee.')
      patch.committeeId = c.committeeId
    }
    if (c.type === 'require_approval' || c.type === 'resubmit') {
      if (c.type === 'resubmit' && t.approval !== 'rejected')
        throw new TaskError('Only rejected tasks need resubmission.')
      await reviewable(tx, t.committeeId, a.orgId)
      patch.approval = 'pending'
      patch.approvalCycle = t.approvalCycle + 1
    }
    if (c.type === 'decide') {
      await tx.execute(
        sql`insert into task_approval_decisions(task_id,cycle,committee_id,actor_id,decision,note) values(${id}::uuid,${c.cycle},${t.committeeId}::uuid,${a.profileId}::uuid,${c.decision},${c.note})`,
      )
      patch.approval = c.decision
    }
    if (c.type === 'progress') patch.status = c.status
    if (c.type === 'reopen') {
      if (t.status !== 'done') throw new TaskError('Task is already open.')
      patch.status = 'todo'
    }
    if (c.type === 'archive') patch.archivedAt = new Date()
    const [report] = await tx.execute(
      sql`select r.submitted_at,rq.status request_status from fleet_trip_reports r left join fleet_requests rq on rq.id=r.request_id where r.reporting_task_id=${id}::uuid limit 1`,
    )
    const [renewal] = await tx.execute(
      sql`select id from vehicle_renewals where task_id=${id}::uuid limit 1`,
    )
    if (c.type === 'archive') {
      const links = await tx.execute(
        sql`select 1 from fleet_trip_reports r left join fleet_report_task_links l on l.report_id=r.id where r.reporting_task_id=${id}::uuid or r.task_id=${id}::uuid or l.task_id=${id}::uuid limit 1`,
      )
      if (renewal || links.length)
        throw new TaskError(
          'Linked report and renewal tasks must be retained.',
          409,
        )
    }
    const assignment = c.type === 'edit' ? c.patch.assigneeIds : undefined
    try {
      assertVisitReportTaskEdit(
        t,
        report
          ? {
              submittedAt: report.submitted_at
                ? new Date(String(report.submitted_at))
                : null,
              requestStatus: String(report.request_status),
            }
          : null,
        patch,
        scope.assigneeIds,
        assignment,
      )
    } catch (e) {
      throw new TaskError((e as Error).message, 409)
    }
    if (
      renewal &&
      ((patch.projectId !== undefined && patch.projectId !== t.projectId) ||
        (patch.dueDate !== undefined && patch.dueDate !== t.dueDate) ||
        (assignment !== undefined &&
          JSON.stringify([...new Set(assignment)].sort()) !==
            JSON.stringify([...scope.assigneeIds].sort())))
    )
      throw new TaskError(
        'Update renewal dates and responsibility on the vehicle.',
        409,
      )
    await tx.update(tasks).set(patch).where(eq(tasks.id, id))
    if (assignment) await assignees(tx, id, assignment)
    if ('reason' in c)
      await tx.execute(
        sql`insert into task_comments(task_id,actor_id,body) values(${id}::uuid,${a.profileId}::uuid,${c.reason})`,
      )
    return id
  })
}
