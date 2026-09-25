import { sql } from 'drizzle-orm'
import type { db } from '@/lib/db'
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
export async function recordTaskActor(
  tx: Tx,
  profileId: string | null,
  source: string,
) {
  await tx.execute(
    sql`select set_config('app.task_actor',${profileId ?? ''},true),set_config('app.task_source',${source},true)`,
  )
}
