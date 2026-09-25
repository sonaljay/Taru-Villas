import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { loadActor } from './access'
import { getWorkflowTask } from './queries'
import { localDate, reminderKind } from './dates'
import { sendTaskEmail, type EmailMessage } from './email'
import { createAdminClient } from '@/lib/supabase/admin'
export async function enqueueReminders() {
  await db.execute(sql`insert into task_notification_deliveries(task_id,profile_id,event_key,kind,channel,payload)
 select t.id,a.profile_id,'deadline:'||t.id||':'||t.deadline_version||':'||(now() at time zone 'Asia/Colombo')::date,
 case when t.due_date=(now() at time zone 'Asia/Colombo')::date+1 then 'upcoming' else 'overdue' end,ch,
 jsonb_build_object('deadlineVersion',t.deadline_version,'localDate',(now() at time zone 'Asia/Colombo')::date)
 from tasks t join task_assignees a on a.task_id=t.id join profiles p on p.id=a.profile_id cross join unnest(array['in_app','email']) ch
 where t.archived_at is null and t.status<>'done' and p.is_active and p.org_id=t.org_id
 and (t.due_date=(now() at time zone 'Asia/Colombo')::date+1 or t.due_date<(now() at time zone 'Asia/Colombo')::date)
 on conflict(event_key,profile_id,channel) do nothing`)
}
export async function deliverTaskNotifications(limit = 30) {
  const result = { sent: 0, cancelled: 0, failed: 0 }
  for (let i = 0; i < limit; i++) {
    const [job] =
      await db.execute(sql`with pick as (select id from task_notification_deliveries where (state='pending' and available_at<=now()) or (state='sending' and lease_until<now()) order by created_at for update skip locked limit 1)
   update task_notification_deliveries d set state='sending',lease_until=now()+interval '2 minutes',attempts=attempts+1 from pick where d.id=pick.id returning d.*`)
    if (!job) break
    const payload = job.payload as Record<string, unknown>,
      id = String(job.id)
    try {
      const a = await loadActor(String(job.profile_id)),
        task = await getWorkflowTask(a, String(job.task_id))
      const assigned = task.assignee_ids.includes(a.profileId)
      let eligible = !task.archived_at
      if (job.kind === 'approval_request')
        eligible =
          eligible &&
          a.committeeIds.includes(task.committee_id) &&
          task.approval === 'pending' &&
          Number(payload.cycle) === task.approval_cycle &&
          payload.committeeId === task.committee_id
      else eligible = eligible && assigned
      if (job.kind === 'upcoming' || job.kind === 'overdue') {
        const [current] = await db.execute(
          sql`select deadline_version from tasks where id=${task.id}::uuid`,
        )
        eligible =
          eligible &&
          Number(payload.deadlineVersion) ===
            Number(current.deadline_version) &&
          payload.localDate === localDate() &&
          reminderKind(task.due_date, task.status) === job.kind
      }
      if (!eligible) {
        await db.execute(
          sql`update task_notification_deliveries set state='cancelled',lease_until=null where id=${id}::uuid`,
        )
        result.cancelled++
        continue
      }
      const label = String(job.kind).replaceAll('_', ' ')
      const title = `Task ${label}: ${task.title}`,
        path = `/tasks?task=${task.id}`
      if (job.channel === 'in_app') {
        await db.transaction(async (tx) => {
          const [locked] = await tx.execute(
            sql`select state from task_notification_deliveries where id=${id}::uuid for update`,
          )
          if (locked.state === 'sent') return
          await tx.execute(
            sql`insert into notifications(org_id,profile_id,type,title,body,link_url,channel,sent_at) values(${a.orgId}::uuid,${a.profileId}::uuid,'task',${title},${task.committee_name},${path},'in_app',now())`,
          )
          await tx.execute(
            sql`update task_notification_deliveries set state='sent',sent_at=now(),lease_until=null,error=null where id=${id}::uuid`,
          )
        })
      } else {
        const origin = process.env.TASK_APP_ORIGIN
        if (!origin || new URL(origin).protocol !== 'https:')
          throw Error('Configure TASK_APP_ORIGIN with the deployed HTTPS URL.')
        let message = payload.email as EmailMessage | undefined
        if (!message) {
          const [profile] = await db.execute(
            sql`select email from profiles where id=${a.profileId}::uuid`,
          )
          message = {
            to: String(profile.email),
            subject: title,
            text: `${title}\nCommittee: ${task.committee_name}\n${new URL(path, origin).href}`,
            key: id,
          }
          await db.execute(
            sql`update task_notification_deliveries set payload=payload||${JSON.stringify({ email: message, emailStartedAt: new Date().toISOString() })}::jsonb where id=${id}::uuid`,
          )
        } else if (
          Date.now() - Date.parse(String(payload.emailStartedAt)) >
          23 * 3600000
        ) {
          await db.execute(
            sql`update task_notification_deliveries set state='failed',error='Delivery requires reconciliation before retrying beyond provider idempotency window.',lease_until=null where id=${id}::uuid`,
          )
          result.failed++
          continue
        }
        const sent = await sendTaskEmail(message)
        await db.execute(
          sql`update task_notification_deliveries set state='sent',sent_at=now(),provider_id=${sent.providerId},lease_until=null,error=null where id=${id}::uuid`,
        )
      }
      result.sent++
    } catch (e) {
      const error = e as Error & { status?: number }
      const cancelled = error.status === 404 || error.status === 401
      const state = cancelled
        ? 'cancelled'
        : Number(job.attempts) >= 5
          ? 'failed'
          : 'pending'
      await db.execute(
        sql`update task_notification_deliveries set state=${state},error=${error.message.slice(0, 500)},available_at=now()+interval '15 minutes',lease_until=null where id=${id}::uuid`,
      )
      if (cancelled) result.cancelled++
      else result.failed++
    }
  }
  return result
}
export async function cleanupTaskFiles() {
  const rows = await db.execute(
    sql`select storage_path from task_file_cleanup where created_at<now()-interval '1 hour' limit 20`,
  )
  if (!rows.length) return
  const storage = createAdminClient().storage.from('task-attachments')
  for (const r of rows) {
    const { error } = await storage.remove([String(r.storage_path)])
    if (!error)
      await db.execute(
        sql`delete from task_file_cleanup where storage_path=${r.storage_path}`,
      )
  }
}
