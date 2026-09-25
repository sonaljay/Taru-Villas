import { sql } from 'drizzle-orm'
import { z } from 'zod'
import { db } from '@/lib/db'
import { requestActor, errorResponse, TaskError } from '@/lib/tasks/access'
import { getWorkflowTask, scope } from '@/lib/tasks/queries'
import { canEditTask } from '@/lib/tasks/policy'
import { editActivity } from '@/lib/tasks/activity'
import { validateAttachment } from '@/lib/tasks/file-types'
import { createAdminClient } from '@/lib/supabase/admin'
export async function POST(r: Request, c: { params: Promise<{ id: string }> }) {
  try {
    const a = await requestActor(),
      id = z
        .string()
        .uuid()
        .parse((await c.params).id),
      t = await getWorkflowTask(a, id)
    if (!canEditTask(a, scope(t)))
      throw new TaskError('You cannot attach files.', 403)
    if (Number(r.headers.get('content-length')) > 11 * 1024 * 1024)
      throw new TaskError('Files must be at most 10 MB.')
    const file = (await r.formData()).get('file')
    if (!(file instanceof File)) throw new TaskError('Choose a file.')
    if (file.size > 10 * 1024 * 1024)
      throw new TaskError('Files must be at most 10 MB.')
    const bytes = Buffer.from(await file.arrayBuffer())
    let type: string
    try {
      type = validateAttachment(file.name, bytes)
    } catch (e) {
      throw new TaskError((e as Error).message)
    }
    const path = `${a.orgId}/${id}/${crypto.randomUUID()}`
    const storage = createAdminClient().storage.from('task-attachments')
    // Persist cleanup intent before uploading so crashes cannot orphan objects.
    await db.execute(
      sql`insert into task_file_cleanup(storage_path) values(${path})`,
    )
    const result = await storage.upload(path, bytes, {
      contentType: type,
      upsert: false,
    })
    if (result.error)
      throw new TaskError('File storage is unavailable. Try again later.', 503)
    try {
      return Response.json(
        await editActivity(a, id, 'attachment_added', async (tx) => {
          const [row] = await tx.execute(
            sql`insert into task_attachments(task_id,actor_id,name,storage_path,content_type,size) values(${id}::uuid,${a.profileId}::uuid,${file.name.slice(0, 250)},${path},${type},${bytes.length}) returning id,name`,
          )
          await tx.execute(
            sql`delete from task_file_cleanup where storage_path=${path}`,
          )
          return row
        }),
        { status: 201 },
      )
    } catch (e) {
      await storage.remove([path])
      throw e
    }
  } catch (e) {
    return errorResponse(e)
  }
}
