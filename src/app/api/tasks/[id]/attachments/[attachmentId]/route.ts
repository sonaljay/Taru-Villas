import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { getWorkflowTask } from '@/lib/tasks/queries'
import { editActivity } from '@/lib/tasks/activity'
import { createAdminClient } from '@/lib/supabase/admin'
type C = { params: Promise<{ id: string; attachmentId: string }> }
export async function GET(_r: Request, c: C) {
  try {
    const a = await requestActor(),
      p = await c.params
    z.string().uuid().parse(p.attachmentId)
    await getWorkflowTask(a, z.string().uuid().parse(p.id))
    const [f] = await db.execute(
      sql`select * from task_attachments where id=${p.attachmentId}::uuid and task_id=${p.id}::uuid and removed_at is null`,
    )
    if (!f) throw new TaskError('File not found', 404)
    const { data, error } = await createAdminClient()
      .storage.from('task-attachments')
      .createSignedUrl(String(f.storage_path), 60, { download: String(f.name) })
    if (error) throw new TaskError('File unavailable', 503)
    return Response.redirect(data.signedUrl)
  } catch (e) {
    return errorResponse(e)
  }
}
export async function DELETE(_r: Request, c: C) {
  try {
    const a = await requestActor(),
      p = await c.params
    z.string().uuid().parse(p.attachmentId)
    return Response.json(
      await editActivity(
        a,
        z.string().uuid().parse(p.id),
        'attachment_removed',
        async (tx) => {
          const [row] = await tx.execute(
            sql`update task_attachments set removed_at=now() where id=${p.attachmentId}::uuid and task_id=${p.id}::uuid and removed_at is null returning storage_path`,
          )
          if (!row) throw new TaskError('File not found', 404)
          await tx.execute(
            sql`insert into task_file_cleanup(storage_path) values(${row.storage_path}) on conflict do nothing`,
          )
          return { removed: true }
        },
      ),
    )
  } catch (e) {
    return errorResponse(e)
  }
}
