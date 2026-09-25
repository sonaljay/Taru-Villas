import { describe, it, expect, vi } from 'vitest'
import postgres from 'postgres'
vi.mock('@/lib/auth/guards', () => ({ getProfile: async () => null }))
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
})
