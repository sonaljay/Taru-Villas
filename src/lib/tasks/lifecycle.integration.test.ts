import { describe, it, expect, beforeAll, vi } from 'vitest'
import postgres from 'postgres'
vi.mock('@/lib/auth/guards', () => ({ getProfile: async () => null }))
const url = process.env.TASK_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('task lifecycle transactions', () => {
  let opsId: string,
    otherId: string,
    taskId: string,
    actor: Awaited<ReturnType<(typeof import('./access'))['loadActor']>>
  const org = '00000000-0000-4000-8000-000000000001',
    user = '00000000-0000-4000-8000-000000000002'
  beforeAll(async () => {
    if (!url?.includes('localhost:55439')) throw Error('Disposable DB only')
    const sql = postgres(url, { max: 1 })
    await sql`insert into auth.users(id) values(${user}) on conflict do nothing`
    await sql`insert into profiles(id,org_id,email,full_name,role) values(${user},${org},'task@example.test','Task Admin','admin') on conflict do nothing`
    const second = '00000000-0000-4000-8000-000000000003'
    await sql`insert into auth.users(id) values(${second}) on conflict do nothing`
    await sql`insert into profiles(id,org_id,email,full_name,role) values(${second},${org},'staff@example.test','Task Staff','staff') on conflict do nothing`
    const [ops] =
      await sql`select id from task_committees where org_id=${org} and is_operations`
    opsId = ops.id
    const [other] =
      await sql`insert into task_committees(org_id,name) values(${org},'Finance') on conflict(org_id,name) do update set name=excluded.name returning id`
    otherId = other.id
    await sql`insert into task_committee_members(committee_id,profile_id) values(${opsId},${user}),(${otherId},${user}) on conflict do nothing`
    await sql.end()
    actor = await (await import('./access')).loadActor(user)
  })
  it('creates and starts default Operations tasks with audit and delivery intentions', async () => {
    const { createWorkflowTask, executeTaskCommand } = await import(
      './lifecycle'
    )
    const { getWorkflowTask } = await import('./queries')
    taskId = await createWorkflowTask(actor, {
      title: 'Workflow integration',
      assigneeIds: [user],
    })
    const t = await getWorkflowTask(actor, taskId)
    expect(t.approval).toBe('not_required')
    expect(t.assignee_ids).toContain(user)
    await executeTaskCommand(actor, taskId, t.version, {
      type: 'progress',
      status: 'in_progress',
    })
    expect((await getWorkflowTask(actor, taskId)).status).toBe('in_progress')
  })
  it('transfers pause work and concurrent decisions only allow one winner', async () => {
    const { executeTaskCommand } = await import('./lifecycle')
    const { getWorkflowTask } = await import('./queries')
    let t = await getWorkflowTask(actor, taskId)
    await executeTaskCommand(actor, taskId, t.version, {
      type: 'transfer',
      committeeId: otherId,
      reason: 'Budget approval',
    })
    t = await getWorkflowTask(actor, taskId)
    expect(t.status).toBe('stuck')
    expect(t.approval).toBe('pending')
    const outcomes = await Promise.allSettled(
      ['approved', 'rejected'].map((decision) =>
        executeTaskCommand(actor, taskId, t.version, {
          type: 'decide',
          cycle: t.approval_cycle,
          decision: decision as 'approved' | 'rejected',
          note: 'Decision',
        }),
      ),
    )
    expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    t = await getWorkflowTask(actor, taskId)
    expect(t.status).toBe('stuck')
    const sql = postgres(url!, { max: 1 })
    const events =
      await sql`select after_value from task_events where task_id=${taskId} and kind='task_approval_decisions_insert'`
    expect(events).toHaveLength(1)
    expect(events[0].after_value.note).toBe('Decision')
    expect(events[0].after_value.cycle).toBe(t.approval_cycle)
    await sql.end()
  })
  it('rejects stale edits without changing task title', async () => {
    const { executeTaskCommand } = await import('./lifecycle')
    const { getWorkflowTask } = await import('./queries')
    await expect(
      executeTaskCommand(actor, taskId, 0, {
        type: 'edit',
        patch: { title: 'Lost update' },
      }),
    ).rejects.toThrow(/changed/)
    expect((await getWorkflowTask(actor, taskId)).title).toBe(
      'Workflow integration',
    )
  })
  it('scopes projects and includes visible projectless tasks in Fleet options', async () => {
    const sql = postgres(url!, { max: 1 })
    const staff = await (
      await import('./access')
    ).loadActor('00000000-0000-4000-8000-000000000003')
    const { scopedProjects } = await import('./queries')
    expect(await scopedProjects(staff)).toEqual([])
    const [property] =
      await sql`insert into properties(org_id,name,slug,code) values(${org},'Task test property','task-test-property','TASK-QA') returning id`
    const [task] =
      await sql`insert into tasks(org_id,title,property_id) values(${org},'Projectless Fleet reason',${property.id}) returning id`
    const { listEligibleFleetTasks } = await import('../db/queries/dispatches')
    expect(
      (await listEligibleFleetTasks(org, user)).some(
        (t) => t.id === task.id && t.projectId === null,
      ),
    ).toBe(true)
    expect(await listEligibleFleetTasks(org, staff.profileId)).toEqual([])
    await sql.end()
  })
})
