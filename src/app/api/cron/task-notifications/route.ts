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
    await enqueueReminders()
    const result = await deliverTaskNotifications()
    await cleanupTaskFiles()
    return Response.json(result, { status: result.failed ? 503 : 200 })
  } catch {
    return Response.json(
      { error: 'Task delivery sweep failed' },
      { status: 500 },
    )
  }
}
