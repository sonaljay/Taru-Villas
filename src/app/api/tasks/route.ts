import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTasks, createTask, type TaskFilters } from '@/lib/db/queries/tasks'

const createSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  projectId: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  teamIds: z.array(z.string().uuid()).nullable().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const sp = new URL(request.url).searchParams
    const statusParam = sp.get('status')
    const priorityParam = sp.get('priority')
    const filters: TaskFilters = {
      projectId: sp.get('projectId') || undefined,
      propertyId: sp.get('propertyId') || undefined,
      status: (['todo', 'in_progress', 'stuck', 'done'].includes(statusParam || '') ? statusParam : undefined) as TaskFilters['status'],
      teamId: sp.get('teamId') || undefined,
      priority: (['low', 'medium', 'high'].includes(priorityParam || '') ? priorityParam : undefined) as TaskFilters['priority'],
      assigneeId: sp.get('assigneeId') || undefined,
      search: sp.get('search') || undefined,
    }
    const items = await getTasks(profile.orgId, filters)
    return NextResponse.json(items)
  } catch (error) {
    console.error('GET /api/tasks error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsed = createSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { assigneeIds, teamIds, ...fields } = parsed.data
    const task = await createTask(
      { ...fields, orgId: profile.orgId, createdBy: profile.id, dueDate: fields.dueDate ?? null, propertyId: fields.propertyId ?? null },
      assigneeIds ?? [], teamIds ?? [],
    )
    return NextResponse.json(task, { status: 201 })
  } catch (error) {
    console.error('POST /api/tasks error:', error)
    return NextResponse.json({ error: 'Failed to create' }, { status: 500 })
  }
}
