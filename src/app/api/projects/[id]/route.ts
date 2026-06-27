import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getProfile } from '@/lib/auth/guards'
import { getProjectById, updateProject, deleteProject } from '@/lib/db/queries/projects'

type Ctx = { params: Promise<{ id: string }> }

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  status: z.enum(['active', 'archived']).optional(),
  targetDate: z.string().nullable().optional(),
})

export async function GET(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const project = await getProjectById(id)
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(project)
  } catch (error) {
    console.error('GET /api/projects/[id] error:', error)
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
    const project = await updateProject(id, parsed.data)
    return NextResponse.json(project)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23505') {
      return NextResponse.json({ error: 'A project with that name already exists' }, { status: 409 })
    }
    console.error('PATCH /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, context: Ctx) {
  try {
    const profile = await getProfile()
    if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!profile.isActive) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await context.params
    const project = await getProjectById(id)
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    if (profile.role !== 'admin' && project.createdBy !== profile.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const result = await deleteProject(id)
    if (result.blocked)
      return NextResponse.json({ error: "Move or delete this project's tasks first" }, { status: 409 })
    return NextResponse.json(result.project)
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '23503') {
      return NextResponse.json({ error: "Move or delete this project's tasks first" }, { status: 409 })
    }
    console.error('DELETE /api/projects/[id] error:', error)
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
  }
}
