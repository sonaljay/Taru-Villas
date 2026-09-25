import { sql, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks, taskAssignees } from '@/lib/db/schema'
import { type Actor, canEditTask } from './policy'
import { loadActor, TaskError } from './access'
import { actorContext, type Tx } from './lifecycle'
export async function editActivity<T>(
  actor: Actor,
  id: string,
  action: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const a = await loadActor(actor.profileId, tx)
    const [t] = await tx
      .select()
      .from(tasks)
      .where(eq(tasks.id, id))
      .for('update')
    const assignees = await tx
      .select()
      .from(taskAssignees)
      .where(eq(taskAssignees.taskId, id))
    if (
      !t ||
      t.archivedAt ||
      !canEditTask(a, { ...t, assigneeIds: assignees.map((a) => a.profileId) })
    )
      throw new TaskError('You cannot update this task.', 403)
    await actorContext(tx, a, action)
    return fn(tx)
  })
}
export async function addComment(a: Actor, id: string, body: string) {
  return editActivity(a, id, 'comment', async (tx) => {
    const [r] = await tx.execute(
      sql`insert into task_comments(task_id,actor_id,body) values(${id}::uuid,${a.profileId}::uuid,${body}) returning *`,
    )
    return r
  })
}
