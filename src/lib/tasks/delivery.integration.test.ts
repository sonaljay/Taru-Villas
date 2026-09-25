import { describe, it, expect, vi } from 'vitest'
import postgres from 'postgres'
vi.mock('@/lib/auth/guards', () => ({ getProfile: async () => null }))
vi.mock('./email', () => ({
  sendTaskEmail: vi.fn(async () => ({ providerId: 'test-email' })),
}))
const url = process.env.TASK_TEST_DATABASE_URL
const suite = url ? describe : describe.skip
suite('durable task notifications', () => {
  it('deduplicates reminders and cancels stale recipients before delivery', async () => {
    if (!url?.includes('localhost:55439'))
      throw Error('Disposable database only')
    const sql = postgres(url, { max: 1 })
    const { enqueueReminders, deliverTaskNotifications } = await import(
      './notifications'
    )
    const [t] =
      await sql`select * from tasks where title='Workflow integration' order by created_at desc limit 1`
    await sql`update tasks set due_date=(now() at time zone 'Asia/Colombo')::date-1 where id=${t.id}`
    await enqueueReminders()
    await enqueueReminders()
    const jobs =
      await sql`select * from task_notification_deliveries where task_id=${t.id} and kind='overdue'`
    expect(jobs).toHaveLength(2)
    // Never send real email in a database test.
    await sql`update task_notification_deliveries set state='cancelled' where channel='email'`
    await deliverTaskNotifications(30)
    const [count] =
      await sql`select count(*)::int n from notifications where type='task'`
    expect(count.n).toBeGreaterThan(0)
    const before = count.n
    await deliverTaskNotifications(30)
    const [after] =
      await sql`select count(*)::int n from notifications where type='task'`
    expect(after.n).toBe(before)
    await sql`update tasks set due_date=(now() at time zone 'Asia/Colombo')::date-2 where id=${t.id}`
    await enqueueReminders()
    await sql`delete from task_assignees where task_id=${t.id}`
    await sql`update task_notification_deliveries set state='cancelled' where channel='email'`
    const run = await deliverTaskNotifications(30)
    expect(run.cancelled).toBeGreaterThan(0)
    await sql.end()
  })
  it('drains more than 30 queued deliveries in one bounded sweep', async () => {
    const sql = postgres(url!, { max: 1 })
    const [t] =
      await sql`select * from tasks where title='Workflow integration' limit 1`
    const user = '00000000-0000-4000-8000-000000000002'
    await sql`insert into task_assignees(task_id,profile_id) values(${t.id},${user}) on conflict do nothing`
    await sql`update task_notification_deliveries set state='cancelled' where state <> 'sent'`
    await sql`insert into task_notification_deliveries(task_id,profile_id,event_key,kind,channel) select ${t.id},${user},'large-batch-'||n,'assignment','in_app' from generate_series(1,40) n`
    const { deliverTaskNotifications } = await import('./notifications')
    expect((await deliverTaskNotifications(1000, 35000)).sent).toBe(40)
    await sql.end()
  })
  it('holds membership authorization until email delivery finishes', async () => {
    const sql = postgres(url!, { max: 1 })
    const [t] =
      await sql`select * from tasks where title='Workflow integration' limit 1`
    const user = '00000000-0000-4000-8000-000000000003'
    await sql`insert into task_committee_members(committee_id,profile_id) values(${t.committee_id},${user}) on conflict do nothing`
    await sql`update tasks set approval='pending' where id=${t.id}`
    await sql`update task_notification_deliveries set state='cancelled' where state <> 'sent'`
    await sql`insert into task_notification_deliveries(task_id,profile_id,event_key,kind,channel,payload) values(${t.id},${user},'revocation-race','approval_request','email',${sql.json({ cycle: t.approval_cycle, committeeId: t.committee_id })})`
    const { sendTaskEmail } = await import('./email')
    const { deliverTaskNotifications } = await import('./notifications')
    process.env.TASK_APP_ORIGIN = 'https://example.test'
    vi.mocked(sendTaskEmail).mockImplementationOnce(async () => {
      await sql`set lock_timeout='50ms'`
      await expect(
        sql`delete from task_committee_members where committee_id=${t.committee_id} and profile_id=${user}`,
      ).rejects.toThrow(/lock timeout/)
      return { providerId: 'fenced-email' }
    })
    expect((await deliverTaskNotifications(10)).sent).toBe(1)
    await sql`delete from task_committee_members where committee_id=${t.committee_id} and profile_id=${user}`
    await sql.end()
  })
})
