import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getTaskById, updateTask, deleteTask } from '@/lib/db/queries/tasks'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  status: z.enum(['todo', 'in_progress', 'stuck', 'done']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  propertyId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeIds: z.array(z.string().uuid()).nullable().optional(),
  teamIds: z.array(z.string().uuid()).nullable().optional(),
})

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(task)
  } catch (error) {
    console.error('GET /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const parsed = patchSchema.safeParse(await request.json())
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten().fieldErrors }, { status: 400 })
    const { assigneeIds, teamIds, dueDate, propertyId, ...rest } = parsed.data
    const data = { ...rest,
      ...(dueDate !== undefined ? { dueDate: dueDate ?? null } : {}),
      ...(propertyId !== undefined ? { propertyId: propertyId ?? null } : {}) }
    const task = await updateTask(id, data, assigneeIds ?? undefined, teamIds ?? undefined)
    return NextResponse.json(task)
  } catch (error) {
    console.error('PATCH /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = await context.params
    const task = await getTaskById(id)
    if (!task) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (profile.role !== 'admin' && task.createdBy !== profile.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const deleted = await deleteTask(id)
    return NextResponse.json(deleted)
  } catch (error) {
    console.error('DELETE /api/tasks/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
