import { eq, and, asc, desc, ilike, inArray, sql } from 'drizzle-orm'
import { db } from '..'
import {
  tasks, taskTeams, taskAssignees, taskTeamLinks, properties, profiles,
  type Task, type NewTask, type TaskTeam,
} from '../schema'

export interface TaskFilters {
  propertyId?: string
  status?: 'todo' | 'in_progress' | 'stuck' | 'done'
  teamId?: string
  priority?: 'low' | 'medium' | 'high'
  assigneeId?: string
  search?: string
}

export interface TaskWithRelations extends Task {
  propertyName: string | null
  assignees: { id: string; fullName: string }[]
  teams: { id: string; name: string }[]
}

async function hydrate(rows: Task[]): Promise<TaskWithRelations[]> {
  if (rows.length === 0) return []
  const ids = rows.map((r) => r.id)
  const propIds = Array.from(new Set(rows.map((r) => r.propertyId).filter(Boolean))) as string[]

  const [assigneeRows, teamRows, propRows] = await Promise.all([
    db.select({ taskId: taskAssignees.taskId, id: profiles.id, fullName: profiles.fullName })
      .from(taskAssignees)
      .innerJoin(profiles, eq(taskAssignees.profileId, profiles.id))
      .where(inArray(taskAssignees.taskId, ids)),
    db.select({ taskId: taskTeamLinks.taskId, id: taskTeams.id, name: taskTeams.name })
      .from(taskTeamLinks)
      .innerJoin(taskTeams, eq(taskTeamLinks.teamId, taskTeams.id))
      .where(inArray(taskTeamLinks.taskId, ids)),
    propIds.length
      ? db.select({ id: properties.id, name: properties.name }).from(properties).where(inArray(properties.id, propIds))
      : Promise.resolve([] as { id: string; name: string }[]),
  ])

  const aByTask = new Map<string, { id: string; fullName: string }[]>()
  for (const a of assigneeRows) {
    const arr = aByTask.get(a.taskId) ?? []
    arr.push({ id: a.id, fullName: a.fullName }); aByTask.set(a.taskId, arr)
  }
  const tByTask = new Map<string, { id: string; name: string }[]>()
  for (const t of teamRows) {
    const arr = tByTask.get(t.taskId) ?? []
    arr.push({ id: t.id, name: t.name }); tByTask.set(t.taskId, arr)
  }
  const propName = new Map(propRows.map((p) => [p.id, p.name]))

  return rows.map((r) => ({
    ...r,
    propertyName: r.propertyId ? propName.get(r.propertyId) ?? null : null,
    assignees: aByTask.get(r.id) ?? [],
    teams: tByTask.get(r.id) ?? [],
  }))
}

export async function getTasks(orgId: string, filters: TaskFilters = {}): Promise<TaskWithRelations[]> {
  const conditions = [eq(tasks.orgId, orgId)]
  if (filters.propertyId) conditions.push(eq(tasks.propertyId, filters.propertyId))
  if (filters.status) conditions.push(eq(tasks.status, filters.status))
  if (filters.priority) conditions.push(eq(tasks.priority, filters.priority))
  if (filters.search) conditions.push(ilike(tasks.title, `%${filters.search}%`))

  // team/assignee filters require a membership subquery
  if (filters.teamId) {
    conditions.push(sql`exists (select 1 from task_team_links ttl where ttl.task_id = ${tasks.id} and ttl.team_id = ${filters.teamId})`)
  }
  if (filters.assigneeId) {
    conditions.push(sql`exists (select 1 from task_assignees ta where ta.task_id = ${tasks.id} and ta.profile_id = ${filters.assigneeId})`)
  }

  const rows = await db.select().from(tasks)
    .where(and(...conditions))
    .orderBy(asc(tasks.status), asc(tasks.position), desc(tasks.createdAt))
  return hydrate(rows)
}

export async function getTaskById(id: string): Promise<TaskWithRelations | null> {
  const rows = await db.select().from(tasks).where(eq(tasks.id, id))
  if (!rows[0]) return null
  const [h] = await hydrate(rows)
  return h
}

export async function createTask(data: NewTask, assigneeIds: string[], teamIds: string[]): Promise<Task> {
  return db.transaction(async (tx) => {
    const [task] = await tx.insert(tasks).values(data).returning()
    if (assigneeIds.length)
      await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: task.id, profileId })))
    if (teamIds.length)
      await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: task.id, teamId })))
    return task
  })
}

export async function updateTask(
  id: string, data: Partial<NewTask>, assigneeIds?: string[], teamIds?: string[],
): Promise<Task> {
  return db.transaction(async (tx) => {
    const set: Partial<NewTask> = { ...data, updatedAt: new Date() }
    if (data.status !== undefined) {
      set.completedAt = data.status === 'done' ? new Date() : null
    }
    const [task] = await tx.update(tasks).set(set).where(eq(tasks.id, id)).returning()
    if (assigneeIds) {
      await tx.delete(taskAssignees).where(eq(taskAssignees.taskId, id))
      if (assigneeIds.length)
        await tx.insert(taskAssignees).values(assigneeIds.map((profileId) => ({ taskId: id, profileId })))
    }
    if (teamIds) {
      await tx.delete(taskTeamLinks).where(eq(taskTeamLinks.taskId, id))
      if (teamIds.length)
        await tx.insert(taskTeamLinks).values(teamIds.map((teamId) => ({ taskId: id, teamId })))
    }
    return task
  })
}

export async function deleteTask(id: string): Promise<Task | undefined> {
  const [deleted] = await db.delete(tasks).where(eq(tasks.id, id)).returning()
  return deleted
}

export async function reorderTask(
  id: string, status: 'todo' | 'in_progress' | 'stuck' | 'done', position: number,
): Promise<Task> {
  const [task] = await db.update(tasks)
    .set({ status, position, completedAt: status === 'done' ? new Date() : null, updatedAt: new Date() })
    .where(eq(tasks.id, id)).returning()
  return task
}

export async function getTaskTeams(orgId: string): Promise<TaskTeam[]> {
  return db.select().from(taskTeams).where(eq(taskTeams.orgId, orgId))
    .orderBy(asc(taskTeams.sortOrder), asc(taskTeams.name))
}

export async function createTaskTeam(orgId: string, name: string, sortOrder = 0): Promise<TaskTeam> {
  const [t] = await db.insert(taskTeams).values({ orgId, name, sortOrder }).returning()
  return t
}

export async function updateTaskTeam(id: string, data: { name?: string; sortOrder?: number }): Promise<TaskTeam> {
  const [t] = await db.update(taskTeams).set({ ...data, updatedAt: new Date() }).where(eq(taskTeams.id, id)).returning()
  return t
}

export async function deleteTaskTeam(id: string): Promise<TaskTeam | undefined> {
  const [t] = await db.delete(taskTeams).where(eq(taskTeams.id, id)).returning()
  return t
}
