import { eq, and, asc, sql } from 'drizzle-orm'
import { db } from '..'
import { projects, tasks, type Project, type NewProject } from '../schema'

export interface ProjectWithCounts extends Project {
  taskCount: number
  doneCount: number
}

export async function getProjects(
  orgId: string, opts: { includeArchived?: boolean } = {},
): Promise<ProjectWithCounts[]> {
  const conditions = [eq(projects.orgId, orgId)]
  if (!opts.includeArchived) conditions.push(eq(projects.status, 'active'))
  const rows = await db
    .select({
      project: projects,
      taskCount: sql<number>`count(${tasks.id})`.as('task_count'),
      doneCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')`.as('done_count'),
    })
    .from(projects)
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .where(and(...conditions))
    .groupBy(projects.id)
    .orderBy(asc(projects.status), asc(projects.name))
  return rows.map((r) => ({ ...r.project, taskCount: Number(r.taskCount), doneCount: Number(r.doneCount) }))
}

export async function getProjectById(id: string): Promise<Project | null> {
  const [p] = await db.select().from(projects).where(eq(projects.id, id))
  return p ?? null
}

export async function createProject(data: NewProject): Promise<Project> {
  const [p] = await db.insert(projects).values(data).returning()
  return p
}

export async function updateProject(id: string, data: Partial<NewProject>): Promise<Project> {
  const [p] = await db.update(projects).set({ ...data, updatedAt: new Date() }).where(eq(projects.id, id)).returning()
  return p
}

export async function deleteProject(id: string): Promise<{ blocked: boolean; project?: Project }> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` }).from(tasks).where(eq(tasks.projectId, id))
  if (Number(count) > 0) return { blocked: true }
  const [project] = await db.delete(projects).where(eq(projects.id, id)).returning()
  return { blocked: false, project }
}
