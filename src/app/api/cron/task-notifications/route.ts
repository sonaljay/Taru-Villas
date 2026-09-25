import { timingSafeEqual } from 'node:crypto'
import {
  enqueueReminders,
  deliverTaskNotifications,
  cleanupTaskFiles,
} from '@/lib/tasks/notifications'
export const dynamic = 'force-dynamic'
export const maxDuration = 60
export async function GET(r: Request) {
  const secret = process.env.CRON_SECRET,
    got = Buffer.from(r.headers.get('authorization') ?? ''),
    want = Buffer.from(`Bearer ${secret ?? ''}`)
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want))
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Colombo',
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    )
    if (hour >= 8) await enqueueReminders()
    const result = await deliverTaskNotifications(1000, 35000)
    await cleanupTaskFiles()
    return Response.json(result, { status: result.failed ? 503 : 200 })
  } catch {
    return Response.json(
      { error: 'Task delivery sweep failed' },
      { status: 500 },
    )
  }
}
