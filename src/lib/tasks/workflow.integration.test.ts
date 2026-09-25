import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { readFileSync } from 'node:fs'
const url = process.env.TASK_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('task workflow database invariants', () => {
  const sql = postgres(url!, { max: 1 })
  const org = '00000000-0000-4000-8000-000000000001'
  let taskId: string
  beforeAll(async () => {
    if (!/^postgres:\/\/[^/]*localhost:55439\//.test(url!))
      throw Error('Disposable task database only')
    await sql.unsafe('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    await sql.unsafe(readFileSync(process.env.TASK_TEST_BASE_SCHEMA!, 'utf8'))
    await sql`insert into organizations (id,name,slug) values (${org},'Test','task-test')`
    const [project]=await sql`insert into projects(org_id,name) values(${org},'Legacy project') returning id`
    const [legacy]=await sql`insert into tasks(org_id,project_id,title,status,completed_at) values(${org},${project.id},'Legacy completed','done','2026-09-01T00:00:00Z') returning id`
    const [team]=await sql`insert into task_teams(org_id,name) values(${org},'Legacy team') returning id`
    await sql`insert into task_team_links(task_id,team_id) values(${legacy.id},${team.id})`
    await sql.unsafe(readFileSync('drizzle/0034_task_committee_workflow.sql', 'utf8'))
  })
  afterAll(async () => {
    await sql.end()
  })
  it('preserves existing completed tasks, projects and legacy Teams without sending notifications',async()=>{
    const [t]=await sql`select * from tasks where title='Legacy completed'`
    expect(t.status).toBe('done');expect(t.completed_at.toISOString()).toBe('2026-09-01T00:00:00.000Z')
    expect(t.project_id).toBeTruthy();expect(t.approval).toBe('not_required')
    expect(await sql`select * from task_team_links where task_id=${t.id}`).toHaveLength(1)
    expect(await sql`select * from task_notification_deliveries where task_id=${t.id}`).toHaveLength(0)
  })
  it('defaults projectless tasks to Operations without approval', async () => {
    const [task] =
      await sql`insert into tasks(org_id,title) values (${org},'First task') returning *`
    taskId = task.id
    expect(task.project_id).toBeNull()
    expect(task.committee_id).toBeTruthy()
    expect(task.approval).toBe('not_required')
    expect(
      await sql`select * from task_events where task_id=${task.id}`,
    ).toHaveLength(1)
  })
  it('blocks producer completion when approval is pending and preserves audit', async () => {
    await sql`update tasks set approval='pending', approval_cycle=approval_cycle+1 where id=${taskId}`
    await expect(
      sql`update tasks set status='done' where id=${taskId}`,
    ).rejects.toThrow(/approval/i)
    const [row] = await sql`select status from tasks where id=${taskId}`
    expect(row.status).toBe('todo')
  })
  it('rejects audit changes and hard deletion', async () => {
    await expect(
      sql`delete from task_events where task_id=${taskId}`,
    ).rejects.toThrow(/append.only/i)
    await expect(sql`delete from tasks where id=${taskId}`).rejects.toThrow(
      /archive/i,
    )
  })
})
